import test from "node:test"
import assert from "node:assert/strict"
import {randomBytes,randomUUID} from "node:crypto"
import {recoveryQueueKey,recoveryAddressHash,sealRecoveryAddress,openRecoveryAddress} from "../src/lib/team-passwords/queue-crypto.ts"
test("Cola de recuperación: exige clave de 32 bytes en base64url canónico",()=>{
 const value=randomBytes(32).toString("base64url");assert.equal(recoveryQueueKey(value)?.length,32)
 for(const bad of [undefined,"",randomBytes(31).toString("base64url"),"x".repeat(44),"x".repeat(42)+"+",value+"="])assert.equal(recoveryQueueKey(bad),null)
})
test("Cola de recuperación: cifrado autenticado por solicitud, no persiste correo ni permite copiar el cifrado",()=>{
 const key=randomBytes(32),id=randomUUID(),email="equipo@example.com",first=sealRecoveryAddress(email,id,key),second=sealRecoveryAddress(email,id,key)
 assert.notEqual(first,second);assert(!first.includes(email));assert.equal(openRecoveryAddress(first,id,key),email)
 assert.throws(()=>openRecoveryAddress(first,randomUUID(),key));assert.throws(()=>openRecoveryAddress(first,id,randomBytes(32)))
 const damaged=Buffer.from(first,"base64url");damaged[20]^=1;assert.throws(()=>openRecoveryAddress(damaged.toString("base64url"),id,key))
 assert.equal(recoveryAddressHash(email,key),recoveryAddressHash(email,key));assert.notEqual(recoveryAddressHash(email,key),recoveryAddressHash(email,randomBytes(32)))
})
