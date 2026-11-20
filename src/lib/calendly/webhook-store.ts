import { rescheduleWaiting } from "./reschedule"
import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { trace } from "@/lib/privacy/store"
import { hookConfig, type parseCalendlyNotice } from "./webhook-policy"
import { verifyProviderSubscription, currentInvitees } from "./webhook-provider"
export async function verifyWebhookConnection(signal?: AbortSignal) {
 try {
  const config = await verifyProviderSubscription(signal)
  return await prisma.$transaction(async tx => {
   await tx.estadoWebhookCalendly.upsert({ where:{id:"expo"},create:{id:"expo"},update:{} })
   await tx.$queryRaw`SELECT id FROM "EstadoWebhookCalendly" WHERE id='expo' FOR UPDATE`
   const old = await tx.estadoWebhookCalendly.findUniqueOrThrow({where:{id:"expo"}})
   if(config.retryAt){
    const received=await tx.avisoCalendly.findFirst({orderBy:{recibidoAt:"desc"},select:{recibidoAt:true}})
    if(!received||received.recibidoAt<config.retryAt)throw new Error("ENTREGA_PENDIENTE_DE_CONFIRMAR")
   }
   await tx.estadoWebhookCalendly.update({where:{id:"expo"},data:{huella:config.huella,conectadaAt:old.huella===config.huella&&old.conectadaAt?old.conectadaAt:new Date(),verificadaAt:new Date(),fallo:false}})
   return {verificada:true}
  })
 } catch(error) {
  await prisma.estadoWebhookCalendly.updateMany({where:{id:"expo"},data:{fallo:true}})
  throw error
 }
}
export async function storeCalendlyNotice(notice: NonNullable<ReturnType<typeof parseCalendlyNotice>>) {
 return prisma.$transaction(async tx => {
  await tx.estadoWebhookCalendly.upsert({where:{id:"expo"},create:{id:"expo"},update:{}})
  await tx.$queryRaw`SELECT id FROM "EstadoWebhookCalendly" WHERE id='expo' FOR UPDATE`
  const inserted = await tx.avisoCalendly.createMany({data:[notice],skipDuplicates:true})
  if(inserted.count) await tx.estadoWebhookCalendly.update({where:{id:"expo"},data:{revision:{increment:1}}})
  return {nuevo:!!inserted.count}
 })
}
export async function flagChangedRegistration(tx: Prisma.TransactionClient, row: {invitadoId:string; estado:string; inicio:Date; fin:Date}) {
 const inscription = await tx.inscripcion.findUnique({where:{calendlyInvitadoId:row.invitadoId},select:{id:true,citaInicio:true,citaFin:true,revisionCalendlyPendiente:true}})
 if(inscription && (row.estado!=="ACTIVA" || inscription.citaInicio?.getTime()!==row.inicio.getTime() || inscription.citaFin?.getTime()!==row.fin.getTime()) && !inscription.revisionCalendlyPendiente) {
  await tx.inscripcion.update({where:{id:inscription.id},data:{revisionCalendlyPendiente:true}})
  await trace(tx,{id:"calendly:webhook",role:"SISTEMA_CALENDLY"},"REVISAR_CAMBIO_CITA","INSCRIPCION",inscription.id)
 }
}
export async function processCalendlyNotice(id: string, signal?: AbortSignal) {
 if(!hookConfig())return false
 const token=randomUUID(), now=new Date()
 const claimed=await prisma.avisoCalendly.updateMany({where:{id,disponibleAt:{lte:now},OR:[{estado:"PENDIENTE"},{estado:"PROCESANDO",bloqueoHasta:{lte:now}}]},data:{estado:"PROCESANDO",bloqueoToken:token,bloqueoHasta:new Date(Date.now()+60000),intentos:{increment:1}}})
 if(!claimed.count)return false
 try {
  const job=await prisma.avisoCalendly.findUniqueOrThrow({where:{id}})
  await verifyWebhookConnection(signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000))
  const version=(await prisma.estadoWebhookCalendly.findUniqueOrThrow({where:{id:"expo"}})).revision
  const observedAt=new Date(), rows=await currentInvitees(job.invitadoUri,signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000))
  const dates=[...new Set(rows.map(row=>new Date(row.fecha+"T00:00:00Z")))]
  const mapped=await prisma.jornadaCalendly.findMany({where:{fecha:{in:dates}}})
  const mapping=new Map(mapped.map(row=>[row.fecha.toISOString().slice(0,10),row.eventoId]))
  signal?.throwIfAborted()
  await prisma.$transaction(async tx => {
   for(const eventId of [...new Set(mapped.map(row=>row.eventoId))].sort())await tx.$queryRaw`SELECT id FROM "Evento" WHERE id=${eventId}::uuid FOR UPDATE`
   await tx.$queryRaw`SELECT id FROM "EstadoWebhookCalendly" WHERE id='expo' FOR UPDATE`
   const current=await tx.estadoWebhookCalendly.findUniqueOrThrow({where:{id:"expo"}})
   const own=await tx.avisoCalendly.findUniqueOrThrow({where:{id}})
   if(own.bloqueoToken!==token || own.bloqueoHasta!<=new Date() || current.revision!==version)throw new Error("ACTUALIZACION_POSTERIOR")
   const missing=rows.some(row=>!mapping.has(row.fecha))
   // A reschedule is applied as one pair. If its destination has no jornada, preserve both previous holds for review.
   if(!missing)for(const row of rows) {
    const eventoId=mapping.get(row.fecha)!
    const old=await tx.reservaCupoCalendly.findUnique({where:{invitadoId:row.invitadoId}})
    if(old&&(old.eventoId!==eventoId||old.reservaId!==row.reservaId))throw new Error("JORNADA_DISTINTA")
    const linked=await tx.inscripcion.findUnique({where:{calendlyInvitadoId:row.invitadoId},select:{id:true,eventoId:true,calendlyReservaId:true}})
    if(linked&&(linked.eventoId!==eventoId||linked.calendlyReservaId!==row.reservaId))throw new Error("INSCRIPCION_DISTINTA")
    if(old&&old.verificadaAt>observedAt)throw new Error("LECTURA_ANTERIOR")
    const data={invitadoId:row.invitadoId,reservaId:row.reservaId,eventoId,inicio:row.inicio,fin:row.fin,estado:row.estado,verificadaAt:observedAt,inscripcionId:linked?.id??old?.inscripcionId??null}
    await tx.reservaCupoCalendly.upsert({where:{invitadoId:row.invitadoId},create:data,update:data})
   }
   if(!missing)await rescheduleWaiting(tx,rows,mapping)
   if(!missing)for(const row of rows)await flagChangedRegistration(tx,row)
   if(missing)for(const row of rows)await flagChangedRegistration(tx,row)
   await tx.avisoCalendly.update({where:{id},data:{estado:missing?"REVISION":rows.length?"PROCESADO":"IGNORADO",resultado:missing?"JORNADA_PENDIENTE":rows.length?"ACTUALIZADO":"OTRO_TIPO",procesadoAt:new Date(),bloqueoToken:null,bloqueoHasta:null}})
   await trace(tx,{id:"calendly:webhook",role:"SISTEMA_CALENDLY"},"PROCESAR_AVISO_CALENDLY","AVISO_CALENDLY",id)
  },{timeout:15000})
  return true
 } catch {
  const job=await prisma.avisoCalendly.findUnique({where:{id},select:{intentos:true}})
  await prisma.avisoCalendly.updateMany({where:{id,bloqueoToken:token},data:{estado:"PENDIENTE",resultado:"REINTENTAR",disponibleAt:new Date(Date.now()+Math.min(900000,5000*2**Math.min(job?.intentos??1,7))),bloqueoToken:null,bloqueoHasta:null}})
  return false
 }
}
export async function processCalendlyBatch(limit=3, retry=false) {
 const start=Date.now(),deadline=AbortSignal.timeout(45000);let processed=0
 for(let i=0;i<limit&&Date.now()-start<40000;i++) {
  const now=new Date(),job=await prisma.avisoCalendly.findFirst({where:{disponibleAt:{lte:now},OR:[{estado:"PENDIENTE"},{estado:"PROCESANDO",bloqueoHasta:{lte:now}}]},orderBy:{recibidoAt:"asc"},select:{id:true}})
  if(!job){
   if(!retry)break
   const next=await prisma.avisoCalendly.findFirst({where:{estado:"PENDIENTE"},orderBy:{disponibleAt:"asc"},select:{disponibleAt:true}})
   const wait=next?Math.max(0,next.disponibleAt.getTime()-Date.now()):Infinity
   if(wait>10000||Date.now()-start+wait>=40000)break
   await new Promise(resolve=>setTimeout(resolve,wait+20));continue
  }
  if(await processCalendlyNotice(job.id,deadline))processed++
 }
 return {procesados:processed}
}
