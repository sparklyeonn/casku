import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { privateHash } from "@/lib/families/security"
import { configuredOrigin } from "@/lib/team-passwords/store"
import { recoveryQueueKey } from "@/lib/team-passwords/queue-crypto"
import { recoveryTransport } from "@/lib/team-passwords/delivery"
import { cleanRecoveryQueue,processRecoveryBatch } from "@/lib/team-passwords/recovery-queue"
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}})
export async function POST(request:Request) {
 const secret=process.env.CASKU_PASSWORD_RECOVERY_WORKER_SECRET??"",supplied=Buffer.from(request.headers.get("authorization")??""),expected=Buffer.from(`Bearer ${secret}`)
 if(secret.length<32||secret.length>256||!/^[A-Za-z0-9_-]+$/.test(secret)||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply({error:"Acceso no autorizado."},401)
 if(process.env.CASKU_PASSWORD_RECOVERY_ENABLED!=="1")return reply({estado:"DESACTIVADO"})
 const key=recoveryQueueKey(process.env.CASKU_PASSWORD_RECOVERY_QUEUE_KEY),origin=configuredOrigin(),deliver=recoveryTransport()
 try{
  if(!key||!origin||!deliver){await cleanRecoveryQueue(prisma);return reply({estado:"DESACTIVADO",motivo:"CONFIGURACION_PENDIENTE"})}
  return reply(await processRecoveryBatch(prisma,{key,origin,hash:privateHash,deliver}))
 }
 catch{return reply({error:"No se pudo procesar el lote."},503)}
}
