import { createHash } from "node:crypto"
import { resultRevision } from "./input.ts"
export const CONTACT_CONSENT_VERSION = "resultado-contacto-presencial-2026-11-21.1"
export const CONTACT_CONSENT_TEXT = {
  confirmarApoderado: "El apoderado presente confirma que el correo registrado le pertenece y solicita recibir allí esta revisión del resultado.",
  autorizarCorreo: "El apoderado autoriza expresamente enviar a ese correo las medidas, el resultado y las indicaciones de esta revisión. Este envío es opcional y no crea una cuenta ni autoriza seguimientos.",
} as const
export class ContactInputError extends Error {}
export class ContactConflict extends Error {}
export class ContactUnavailable extends Error {}
export function contactEmail(value: unknown) {
  if(typeof value!=="string" || value.length>254 || /[\r\n\0]/.test(value))throw new ContactInputError("Revisa el correo registrado y su repetición.")
  const email=value.trim().toLowerCase()
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw new ContactInputError("El contacto guardado no tiene un correo válido.")
  return email
}
function canonical(value: unknown): unknown {
  if(Array.isArray(value))return value.map(canonical)
  if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]))
  return value
}
export const contactSnapshotHash=(value:unknown)=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")
export function contactInput(raw: Record<string,unknown>) {
  const keys=["id","revision","contexto","correoRepetido","confirmarApoderado","autorizarCorreo","versionConsentimiento","motivo"]
  if(Object.keys(raw).some(key=>!keys.includes(key)))throw new ContactInputError("El destino y el apoderado se toman exclusivamente del registro guardado.")
  if(typeof raw.id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(raw.id))throw new ContactInputError("Actualiza el formulario de envío.")
  if(raw.versionConsentimiento!==CONTACT_CONSENT_VERSION || raw.confirmarApoderado!==true || raw.autorizarCorreo!==true)throw new ContactInputError("El apoderado debe confirmar el destinatario y autorizar específicamente este envío.")
  if(typeof raw.contexto!=="string"||!/^[a-f0-9]{64}$/.test(raw.contexto))throw new ContactInputError("Consulta nuevamente el contacto guardado.")
  if(raw.motivo!==undefined&&raw.motivo!==null&&typeof raw.motivo!=="string")throw new ContactInputError("Revisa el motivo de la nueva copia.")
  const motivo=typeof raw.motivo==="string"?raw.motivo.trim():null
  if(motivo!==null&&(motivo.length<5||motivo.length>500))throw new ContactInputError("Describe el motivo de la nueva copia entre 5 y 500 caracteres.")
  return {id:raw.id.toLowerCase(),revision:resultRevision(raw.revision),contexto:raw.contexto,correoRepetido:contactEmail(raw.correoRepetido),confirmarApoderado:true,autorizarCorreo:true,versionConsentimiento:CONTACT_CONSENT_VERSION,motivo}
}
type Ledger={estado:string;proveedorId?:string|null;disponibleAt?:Date;aceptadoAt?:Date|null;bloqueoHasta?:Date|null;intentos?:number}
export function contactDeliveryDecision(state:string,ledger:Ledger|null,now=Date.now(),startedAt?:Date) {
  if(ledger?.estado==="ACEPTADO"&&ledger.proveedorId)return {send:false,state:"ACEPTADO",providerId:ledger.proveedorId}
  if(state==="ACEPTADO")return {send:false,state:"ACEPTADO"}
  if(["CANCELADO","RECHAZADO","REVISION"].includes(state))return {send:false,state}
  if(ledger) {
    if(ledger.estado==="REINTENTABLE"&&ledger.disponibleAt&&ledger.disponibleAt.getTime()<=now)return {send:true,state:"REINTENTABLE"}
    if(ledger.estado==="PENDIENTE"&&ledger.intentos===0)return state==="ENVIANDO"&&startedAt&&startedAt.getTime()+120000>now?{send:false,state:"ENVIANDO"}:{send:true,state:"PENDIENTE"}
    if(ledger.estado==="ENVIANDO"&&ledger.bloqueoHasta&&ledger.bloqueoHasta.getTime()>now)return {send:false,state:"ENVIANDO"}
    return {send:false,state:ledger.estado==="RECHAZADO"?"RECHAZADO":ledger.estado==="REINTENTABLE"?"REINTENTABLE":"REVISION"}
  }
  if(state==="ENVIANDO"&&startedAt)return startedAt.getTime()+120000<=now?{send:true,state:"PENDIENTE"}:{send:false,state:"ENVIANDO"}
  return state==="PENDIENTE"?{send:true,state:"PENDIENTE"}:{send:false,state:"REVISION"}
}
