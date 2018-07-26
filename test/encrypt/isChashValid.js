/* global describe it */

const assert = require('assert')
const logger = require('../../common/logger')

const chash = require('../../encrypt/chash')
const objectHash = require('../../encrypt/object_hash')

describe('encrypt->object_hash->getChash160', () => {
    const definition = ['sig', { pubkey: 'xpub661MyMwAqRbcFjjL32Wcrq94pt7zp9csPK9EGd7egJZZqcf9AurBJR3JMWoCZdfokjUBsmGgBPRn5Y19weMnfdj5ZiingJBDjiGGYfCSoKy' }]

    describe('getChash160(obj)', () => {
        it('Verify 160 address generate by object_hash module', () => {
            const address = objectHash.getChash160(definition)
            logger.info(`Generated address : ${address} by pubkey : ${definition[1].pubkey}`)

            const isValid = chash.isChashValid(address)
            assert.equal(isValid, true, `Generated address :${address} is invalidate!`)
            logger.info(`Verify generate address :${address} passed.`)
        })
    })
})