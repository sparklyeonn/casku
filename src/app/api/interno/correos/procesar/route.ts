import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { sendMail, mailConfig, MailUnavailable } from "@/lib/families/mail"
import { processMailBatch } from "@/lib/mail-queue/store"
import { DeliveryFailure } from "@/lib/mail-queue/policy"
import { familyResponse } from "@/lib/families/http"
export async function POST(request:Request) {
  const secret=process.env.CASKU_MAIL_WORKER_SECRET??"", supplied=request.headers.get("authorization")??"", expected=`Bearer ${secret}`
  if(secret.length<32 || Buffer.byteLength(supplied)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return familyResponse({error:"Acceso no autorizado."},401)
  if(process.env.CASKU_MAIL_AUTOMATION!=="1")return familyResponse({estado:"DESACTIVADO"})
  const policyVersion=process.env.CASKU_MAIL_POLICY_VERSION, hashSecret=process.env.CASKU_MAIL_SUPPRESSION_SECRET
  if(!policyVersion || !hashSecret || hashSecret.length<32)return familyResponse({error:"La política y el transporte de correo están pendientes de configuración."},503)
  // El transporte clínico real conserva su activación pendiente.
  try {mailConfig("RESULTADO")} catch {return familyResponse({estado:"DESACTIVADO",motivo:"PENDIENTE_INTEGRACION_CLINICA"})}
  try {return familyResponse(await processMailBatch(prisma,{name:"brevo",idempotencyWindowMs:0,send:async(message,key)=>{try{return await sendMail(message,key,"RESULTADO")}catch(error){throw new DeliveryFailure(error instanceof MailUnavailable?error.kind:"INCIERTO")}}},{policyVersion,secret:hashSecret,limit:10}))}
  catch {return familyResponse({error:"No se pudo completar el lote."},503)}
}
