/*jslint node: true */
"use strict";
let crypto = require('crypto');
let chash = require('./chash.js');

function getSourceString(obj) {
	let arrComponents = [];
	function extractComponents(variable){
		if (variable === null)
			throw Error("null value in "+JSON.stringify(obj));
		switch (typeof variable){
			case "string":
				arrComponents.push("s", variable);
				break;
			case "number":
				arrComponents.push("n", variable.toString());
				break;
			case "boolean":
				arrComponents.push("b", variable.toString());
				break;
			case "object":
				if (Array.isArray(variable)){
					if (variable.length === 0)
						throw Error("empty array in "+JSON.stringify(obj));
					arrComponents.push('[');
					for (let item of variable){
						extractComponents(item);
					}
					arrComponents.push(']');
				}
				else{
					var keys = Object.keys(variable).sort();
					if (keys.length === 0)
						throw Error("empty object in "+JSON.stringify(obj));
					for (let key of keys) {
						if (typeof variable[key] === "undefined")
							throw Error("undefined at "+key+" of "+JSON.stringify(obj));
						arrComponents.push(key);
						extractComponents(variable[key]);
					};
				}
				break;
			default:
				throw Error("hash: unknown type="+(typeof variable)+" of "+variable+", object: "+JSON.stringify(obj));
		}
	}
	
	extractComponents(obj);
	return arrComponents.join("\x00");
}

function getChash160(obj) {
	return chash.getChash160(getSourceString(obj));
}

function getChash288(obj) {
	return chash.getChash288(getSourceString(obj));
}

function getHexHash(obj) {
	return crypto.createHash("sha256").update(getSourceString(obj), "utf8").digest("hex");
}

function getBase64Hash(obj) {
	return crypto.createHash("sha256").update(getSourceString(obj), "utf8").digest("base64");
}


function getNakedUnit(objUnit){
	let objNakedUnit = Object.assign({}, objUnit);
	delete objNakedUnit.unit;
	delete objNakedUnit.headers_commission;
	delete objNakedUnit.payload_commission;
	delete objNakedUnit.main_chain_index;
	delete objNakedUnit.timestamp;
	//delete objNakedUnit.last_ball_unit;
	if (objNakedUnit.messages){
		for (let i=0; i<objNakedUnit.messages.length; i++){
			delete objNakedUnit.messages[i].payload;
			delete objNakedUnit.messages[i].payload_uri;
		}
	}
	//console.log("naked Unit: ", objNakedUnit);
	//console.log("original Unit: ", objUnit);
	return objNakedUnit;
}

function getUnitContentHash(objUnit){
	return getBase64Hash(getNakedUnit(objUnit));
}

function getUnitHash(objUnit) {
	if (objUnit.content_hash) // already stripped
		return getBase64Hash(getNakedUnit(objUnit));
	let objStrippedUnit = {
		content_hash: getUnitContentHash(objUnit),
		version: objUnit.version,
		alt: objUnit.alt,
		authors: objUnit.authors.map(function(author){ return {address: author.address}; }) // already sorted
	};
	if (objUnit.witness_list_unit)
		objStrippedUnit.witness_list_unit = objUnit.witness_list_unit;
	else
		objStrippedUnit.witnesses = objUnit.witnesses;
	if (objUnit.parent_units){
		objStrippedUnit.parent_units = objUnit.parent_units;
		objStrippedUnit.last_ball = objUnit.last_ball;
		objStrippedUnit.last_ball_unit = objUnit.last_ball_unit;
	}
	return getBase64Hash(objStrippedUnit);
}

function getUnitHashToSign(objUnit) {
	let objNakedUnit = getNakedUnit(objUnit);
	for (let i=0; i<objNakedUnit.authors.length; i++)
		delete objNakedUnit.authors[i].authentifiers;
	return crypto.createHash("sha256").update(getSourceString(objNakedUnit), "utf8").digest();
}

function getBallHash(unit, arrParentBalls, arrSkiplistBalls, bNonserial) {
	let objBall = {
		unit: unit
	};
	if (arrParentBalls && arrParentBalls.length > 0)
		objBall.parent_balls = arrParentBalls;
	if (arrSkiplistBalls && arrSkiplistBalls.length > 0)
		objBall.skiplist_balls = arrSkiplistBalls;
	if (bNonserial)
		objBall.is_nonserial = true;
	return getBase64Hash(objBall);
}

function getJointHash(objJoint) {
	// we use JSON.stringify, we can't use objectHash here because it might throw errors
	return crypto.createHash("sha256").update(JSON.stringify(objJoint), "utf8").digest("base64");
}

function cleanNulls(obj){
	Object.keys(obj).forEach(function(key){
		if (obj[key] === null)
			delete obj[key];
	});
}

// -----------------

// prefix device addresses with 0 to avoid confusion with payment addresses
// Note that 0 is not a member of base32 alphabet, which makes device addresses easily distinguishable from payment addresses 
// but still selectable by double-click.  Stripping the leading 0 will not produce a payment address that the device owner knows a private key for,
// because payment address is derived by c-hashing the definition object, while device address is produced from raw public key.
function getDeviceAddress(b64_pubkey){
	return ('0' + getChash160(b64_pubkey));
}

function getDeviceMessageHashToSign(objDeviceMessage) {
	let objNakedDeviceMessage = Object.assign({}, objDeviceMessage);
	delete objNakedDeviceMessage.signature;
	return crypto.createHash("sha256").update(getSourceString(objNakedDeviceMessage), "utf8").digest();
}



exports.getChash160 = getChash160;
exports.getChash288 = getChash288;

exports.getHexHash = getHexHash;
exports.getBase64Hash = getBase64Hash;

exports.getUnitContentHash = getUnitContentHash;
exports.getUnitHash = getUnitHash;
exports.getUnitHashToSign = getUnitHashToSign;
exports.getBallHash = getBallHash;
exports.getJointHash = getJointHash;

exports.cleanNulls = cleanNulls;

exports.getDeviceAddress = getDeviceAddress;
exports.getDeviceMessageHashToSign = getDeviceMessageHashToSign;


