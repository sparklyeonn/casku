import { randomBytes,randomUUID } from "node:crypto"
import type { Prisma,PrismaClient } from "@prisma/client"
import { MailUnavailable } from "../mail/brevo.ts"
import { openRecoveryAddress,recoveryAddressHash,sealRecoveryAddress } from "./queue-crypto.ts"
type Tx=Prisma.TransactionClient
export type RecoveryOptions={key:Buffer;origin:string;hash:(value:string)=>string;deliver:(email:string,link:string,id:string)=>Promise<string>;limit?:number}
export async function enqueueRecoveryRequest(db:PrismaClient,email:string,key:Buffer) {
 const id=randomUUID(),cipher=sealRecoveryAddress(email,id,key),hash=recoveryAddressHash(email,key)
 await db.$executeRaw`INSERT INTO "SolicitudRecuperacion" (id,"destinatarioHash","correoCifrado") VALUES (${id}::uuid,${hash},${cipher})`
}
async function finish(tx:Tx,id:string,lock:string,state:string,reason:string) {
 return tx.$executeRaw`UPDATE "SolicitudRecuperacion" SET estado=${state},motivo=${reason},"correoCifrado"=NULL,"bloqueoToken"=NULL,"bloqueoHasta"=NULL,"terminadoAt"=CURRENT_TIMESTAMP WHERE id=${id}::uuid AND estado='ENVIANDO' AND "bloqueoToken"=${lock}::uuid`
}
export async function cleanRecoveryQueue(db:PrismaClient) {
 // Bloqueos vencidos se revisan, nunca se repite un envío de aceptación incierta.
 await db.$transaction(async tx=>{
  const expired=await tx.$queryRaw<Array<{recuperacionId:string|null}>>`
   WITH vencidas AS (
    SELECT id FROM "SolicitudRecuperacion" WHERE (estado='ENVIANDO' AND "bloqueoHasta"<CURRENT_TIMESTAMP) OR (estado='PENDIENTE' AND "expiraAt"<=CURRENT_TIMESTAMP)
    ORDER BY orden LIMIT 100 FOR UPDATE SKIP LOCKED
   )
   UPDATE "SolicitudRecuperacion" s SET motivo=CASE WHEN s.estado='ENVIANDO' THEN 'INTERRUMPIDO' ELSE 'VENCIDA' END,
    estado=CASE WHEN s.estado='ENVIANDO' THEN 'REVISION' ELSE 'OMITIDO' END,"correoCifrado"=NULL,"bloqueoToken"=NULL,"bloqueoHasta"=NULL,"terminadoAt"=CURRENT_TIMESTAMP
   FROM vencidas v WHERE s.id=v.id RETURNING s."recuperacionId"`
  const ids=expired.flatMap(row=>row.recuperacionId?[row.recuperacionId]:[])
  if(ids.length)await tx.recuperacionClave.updateMany({where:{id:{in:ids},estado:"PENDIENTE"},data:{estado:"FALLIDO"}})
 })
 await db.$executeRaw`DELETE FROM "SolicitudRecuperacion" WHERE id IN (SELECT id FROM "SolicitudRecuperacion" WHERE "terminadoAt"<CURRENT_TIMESTAMP-interval '7 days' AND NOT EXISTS(SELECT 1 FROM "GestionCorreo" g WHERE g.tipo='RECUPERACION' AND g."destinoId"="SolicitudRecuperacion".id) ORDER BY orden LIMIT 100 FOR UPDATE SKIP LOCKED)`
 await db.$executeRaw`DELETE FROM "RecuperacionClave" WHERE id IN (SELECT id FROM "RecuperacionClave" WHERE "expiraAt"<CURRENT_TIMESTAMP-interval '7 days' ORDER BY "expiraAt" LIMIT 100)`
}
async function processOne(db:PrismaClient,options:RecoveryOptions) {
 const lock=randomUUID()
 const job=await db.$transaction(async tx=>{
  const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "SolicitudRecuperacion" WHERE estado='PENDIENTE' AND "expiraAt">CURRENT_TIMESTAMP ORDER BY orden LIMIT 1 FOR UPDATE SKIP LOCKED`
  if(!rows.length)return null
  await tx.$executeRaw`UPDATE "SolicitudRecuperacion" SET estado='ENVIANDO',"bloqueoToken"=${lock}::uuid,"bloqueoHasta"=CURRENT_TIMESTAMP+interval '2 minutes' WHERE id=${rows[0].id}::uuid`
  return tx.solicitudRecuperacion.findUniqueOrThrow({where:{id:rows[0].id}})
 })
 if(!job)return null
 let challengeId:string|undefined,attempted=false
 try {
  const email=openRecoveryAddress(job.correoCifrado??"",job.id,options.key)
  if(recoveryAddressHash(email,options.key)!==job.destinatarioHash)throw new Error("Solicitud no disponible")
  const account=await db.cuentaEquipo.findUnique({where:{email}})
  if(!account?.active){await db.$transaction(tx=>finish(tx,job.id,lock,"OMITIDO","NO_APLICA"));return "omitidas" as const}
  const token=randomBytes(32).toString("base64url"),id=randomUUID(),tokenHash=options.hash(`team-recovery:${token}`)
  const prepared=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "CuentaEquipo" WHERE id=${account.id} FOR UPDATE`
   const current=await tx.cuentaEquipo.findUnique({where:{id:account.id}})
   const newer=await tx.solicitudRecuperacion.findFirst({where:{destinatarioHash:job.destinatarioHash,orden:{gt:job.orden},estado:"ENVIADO"},select:{id:true}})
   const lease=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "SolicitudRecuperacion" WHERE id=${job.id}::uuid AND estado='ENVIANDO' AND "bloqueoToken"=${lock}::uuid AND "bloqueoHasta">CURRENT_TIMESTAMP AND "expiraAt">CURRENT_TIMESTAMP FOR UPDATE`
   if(!lease.length||!current?.active||current.version!==account.version||current.email!==email||newer){await finish(tx,job.id,lock,"OMITIDO","OBSOLETA");return false}
   await tx.$executeRaw`INSERT INTO "RecuperacionClave" (id,"cuentaId","tokenHash","versionCuenta","expiraAt") VALUES (${id}::uuid,${account.id},${tokenHash},${account.version},CURRENT_TIMESTAMP+interval '30 minutes')`
   await tx.solicitudRecuperacion.update({where:{id:job.id},data:{recuperacionId:id}})
   return true
  })
  if(!prepared)return "omitidas" as const
  challengeId=id
  // Sin transacción abierta mientras el proveedor responde; el token solo vive en memoria.
  attempted=true
  await options.deliver(email,`${options.origin}/recuperar-clave#token=${token}`,id)
  const activated=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "CuentaEquipo" WHERE id=${account.id} FOR UPDATE`
   const lease=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "SolicitudRecuperacion" WHERE id=${job.id}::uuid AND estado='ENVIANDO' AND "bloqueoToken"=${lock}::uuid AND "bloqueoHasta">CURRENT_TIMESTAMP FOR UPDATE`
   const current=await tx.cuentaEquipo.findUnique({where:{id:account.id}})
   const newer=await tx.solicitudRecuperacion.findFirst({where:{destinatarioHash:job.destinatarioHash,orden:{gt:job.orden},estado:"ENVIADO"},select:{id:true}})
   const valid=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "RecuperacionClave" WHERE id=${id}::uuid AND "expiraAt">CURRENT_TIMESTAMP AND estado='PENDIENTE'`
   if(!lease.length||!current?.active||current.version!==account.version||current.email!==email||newer||!valid.length){
    await tx.recuperacionClave.updateMany({where:{id,estado:"PENDIENTE"},data:{estado:"ANULADA"}});await finish(tx,job.id,lock,"OMITIDO","OBSOLETA");return false
   }
   await tx.recuperacionClave.updateMany({where:{cuentaId:account.id,estado:"ACTIVA"},data:{estado:"ANULADA"}})
   await tx.recuperacionClave.update({where:{id},data:{estado:"ACTIVA"}})
   await finish(tx,job.id,lock,"ENVIADO","ACEPTADO")
   return true
  })
  return activated?"enviadas" as const:"omitidas" as const
 } catch(error) {
  const uncertain=attempted&&(!(error instanceof MailUnavailable)||error.kind==="INCIERTO")
  await db.$transaction(async tx=>{
   if(challengeId)await tx.recuperacionClave.updateMany({where:{id:challengeId,estado:"PENDIENTE"},data:{estado:"FALLIDO"}})
   await finish(tx,job.id,lock,uncertain?"REVISION":"FALLIDO",uncertain?"ACEPTACION_INCIERTA":attempted?"ENVIO_NO_CONFIRMADO":"SOLICITUD_NO_DISPONIBLE")
  })
  return uncertain?"revision" as const:"fallidas" as const
 }
}
export async function processRecoveryBatch(db:PrismaClient,options:RecoveryOptions) {
 const limit=options.limit??5
 const origin=new URL(options.origin)
 if(options.key.length!==32||!Number.isInteger(limit)||limit<1||limit>10||origin.origin!==options.origin||!(origin.protocol==="https:"||(origin.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(origin.hostname))))throw new Error("Proceso no configurado")
 await cleanRecoveryQueue(db)
 const counts={procesadas:0,enviadas:0,omitidas:0,fallidas:0,revision:0}
 for(let n=0;n<limit;n++) {const result=await processOne(db,options);if(!result)break;counts.procesadas++;counts[result]++}
 return counts
}
