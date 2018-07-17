/* jslint node: true */

const objectHash = require('../encrypt/objectHash.js')

const conf = {}
const network = {}
const eventBus = {}
const db = {}
const definition = {}
const validationUtils = {}
const device = {}

const MAX_INT32 = (2 ** 31) - 1

function sendNewSharedAddress(deviceAddress, address, arrDefinition,
    assocSignersByPath, bForwarded) {
    device.sendMessageToDevice(deviceAddress, 'new_shared_address', {
        address, definition: arrDefinition, signers: assocSignersByPath, forwarded: bForwarded,
    })
}

function includesMyDeviceAddress(assocSignersByPath) {
    Object.values(assocSignersByPath).forEach((signerInfo) => {
        if (signerInfo.device_address === device.getMyDeviceAddress()) return true
        return undefined
    })
    return false
}


function handleNewSharedAddress(body) {
    return new Promise((resolve, reject) => {
        if (!validationUtils.isArrayOfLength(body.definition, 2)) return reject(Error('invalid definition'))
        if (typeof body.signers !== 'object' || Object.keys(body.signers).length === 0) return reject(Error('invalid signers'))
        if (body.address !== objectHash.getChash160(body.definition)) return reject(Error('definition doesn\'t match its c-hash'))
        Object.values(body.signers).forEach((signerInfo) => {
            if (signerInfo.address && !validationUtils.isValidAddress(signerInfo.address)) return reject(Error(`invalid member address: ${signerInfo.address}`))
            return undefined
        })
        return resolve()
    })
}


function determineIfIncludesMe(assocSignersByPath, handleResult) {
    return new Promise((resolve, reject) => {
        const assocMemberAddresses = {}
        Object.values(assocSignersByPath).forEach((signerInfo) => {
            if (signerInfo.address) assocMemberAddresses[signerInfo.address] = true
        })
        const arrMemberAddresses = Object.keys(assocMemberAddresses)
        if (arrMemberAddresses.length === 0) return reject(Error('no member addresses?'))
        db.query(
            'SELECT address FROM my_addresses WHERE address IN(?) UNION SELECT shared_address AS address FROM shared_addresses WHERE shared_address IN(?)',
            [arrMemberAddresses, arrMemberAddresses],
            (rows) => {
                handleResult(rows.length > 0 ? null : 'I am not a member of this shared address')
            },
        )
        return resolve()
    })
}

function validateAddressDefinition(arrDefinition) {
    return new Promise((resolve, reject) => {
        const objFakeUnit = { authors: [] }
        const objFakeValidationState = {
            last_ball_mci: MAX_INT32,
            bAllowUnresolvedInnerDefinitions: true,
        }
        definition.validateDefinition(db, arrDefinition, objFakeUnit,
            objFakeValidationState, false, (err) => {
                if (err) return reject(Error(err))
                return resolve()
            })
    })
}

function forwardNewSharedAddressToCosignersOfMyMemberAddresses(address,
    arrDefinition, assocSignersByPath) {
    const assocMyMemberAddresses = {}
    Object.values(assocSignersByPath).forEach((signerInfo) => {
        if (signerInfo.device_address === device.getMyDeviceAddress() && signerInfo.address) {
            assocMyMemberAddresses[signerInfo.address] = true
        }
    })
    const arrMyMemberAddresses = Object.keys(assocMyMemberAddresses)
    if (arrMyMemberAddresses.length === 0) throw Error('my member addresses not found')
    db.query(
        'SELECT DISTINCT device_address FROM my_addresses JOIN wallet_signing_paths USING(wallet) WHERE address IN(?) AND device_address!=?',
        [arrMyMemberAddresses, device.getMyDeviceAddress()],
        (rows) => {
            rows.forEach((row) => {
                sendNewSharedAddress(row.device_address, address,
                    arrDefinition, assocSignersByPath, true)
            })
        },
    )
}

function addNewSharedAddress(address, arrDefinition, assocSignersByPath) {
    return new Promise((resolve) => {
        db.query(
            `INSERT ${db.getIgnore()} INTO shared_addresses (shared_address, definition) VALUES (?,?)`,
            [address, JSON.stringify(arrDefinition)],
            () => {
                const arrQueries = []
                Object.keys(assocSignersByPath).forEach((signingPath) => {
                    const signerInfo = assocSignersByPath[signingPath]
                    db.addQuery(arrQueries,
                        `INSERT ${db.getIgnore()} INTO shared_address_signing_paths
                            (shared_address, address, signing_path, member_signing_path, device_address) VALUES (?,?,?,?,?)`,
                        [address, signerInfo.address, signingPath,
                            signerInfo.member_signing_path, signerInfo.device_address])
                })
                resolve(arrQueries)
            },
        )
    })
}

async function createNewSharedAddress(arrDefinition, assocSignersByPath) {
    if (!includesMyDeviceAddress(assocSignersByPath)) {
        throw Error('my device address not mentioned')
    }
    const address = objectHash.getChash160(arrDefinition)
    const body = await handleNewSharedAddress({
        address,
        definition: arrDefinition,
        signers: assocSignersByPath,
    })
    await determineIfIncludesMe(body.signers)
    await validateAddressDefinition(body.definition)
    const arrQueries = await addNewSharedAddress(body.address, body.definition,
        body.signers, body.forward)
    arrQueries.forEach(() => {
        console.log(`added new shared address ${address}`)
        eventBus.emit(`new_address-${address}`)
        if (conf.bLight) {
            network.addLightWatchedAddress(address)
        }
        if (!body.forward) {
            forwardNewSharedAddressToCosignersOfMyMemberAddresses(address,
                arrDefinition, assocSignersByPath)
        }
        const arrDeviceAddresses = []
        Object.values(assocSignersByPath).forEach((signerInfo) => {
            if (signerInfo.device_address !== device.getMyDeviceAddress()
                && arrDeviceAddresses.indexOf(signerInfo.device_address) === -1) {
                arrDeviceAddresses.push(signerInfo.device_address)
            }
        })
        arrDeviceAddresses.forEach((deviceAddress) => {
            sendNewSharedAddress(deviceAddress, address, arrDefinition, assocSignersByPath)
        })
    })
}

exports.createNewSharedAddress = createNewSharedAddress
