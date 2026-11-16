import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"
export function recoveryQueueKey(value: string | undefined) {
 if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null
 const key=Buffer.from(value,"base64url")
 return key.length===32 && key.toString("base64url")===value ? key : null
}
export function recoveryAddressHash(email:string,key:Buffer) {return createHmac("sha256",key).update(`recovery-address:${email}`).digest("hex")}
export function sealRecoveryAddress(email:string,id:string,key:Buffer) {
 const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,nonce)
 cipher.setAAD(Buffer.from(`casku-recovery:${id}`))
 const data=Buffer.concat([cipher.update(email,"utf8"),cipher.final()])
 return Buffer.concat([nonce,cipher.getAuthTag(),data]).toString("base64url")
}
export function openRecoveryAddress(value:string,id:string,key:Buffer) {
 const data=Buffer.from(value,"base64url")
 if(data.length<29||data.length>400||data.toString("base64url")!==value)throw new Error("Solicitud no disponible")
 const decipher=createDecipheriv("aes-256-gcm",key,data.subarray(0,12))
 decipher.setAAD(Buffer.from(`casku-recovery:${id}`));decipher.setAuthTag(data.subarray(12,28))
 return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString("utf8")
}
