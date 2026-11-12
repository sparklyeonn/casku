import { randomUUID, createHmac } from "node:crypto"
import { Prisma, type PrismaClient, type OrdenCorreo } from "@prisma/client"
import { PRIVACY_VERSION } from "../privacy/policy.ts"
import { parseSnapshot } from "../results/snapshot.ts"
import { calendar, eligible, STAGES, MAX_ATTEMPTS, LEASE_MS, stageMessage, DeliveryFailure, retryDelay, type CalendarPolicy, type Eligibility, type MailTransport, type Message } from "./policy.ts"
type Db = PrismaClient
type Tx = Prisma.TransactionClient
const suppressionKey = (email: string, secret: string) => createHmac("sha256",secret).update(`mail:${email.trim().toLowerCase()}`).digest("hex")
export async function draftMailPlan(tx: Tx, publicationId: string, version=1) {
  const legacy=await tx.correoResultado.findUniqueOrThrow({where:{publicacionId:publicationId}})
  await tx.ordenCorreo.createMany({data:STAGES.map(etapa=>({id:version===1&&etapa==="INICIAL"?legacy.id:randomUUID(),publicacionId:publicationId,version,etapa,claveIdempotencia:version===1?(etapa==="INICIAL"?`result-${legacy.id}`:`followup-${publicationId}-${etapa}`):`result-${publicationId}-v${version}-${etapa}`})),skipDuplicates:true})
}
async function scope(db: Tx, publicationId: string) {
  return db.resultadoPublicado.findUnique({where:{id:publicationId},include:{versiones:{orderBy:{numero:"desc"},take:1},correo:true,apoderado:true,evaluacion:{include:{paciente:true,fila:{include:{inscripcion:{include:{autorizacion:true}}}}}}}})
}
function permission(row: NonNullable<Awaited<ReturnType<typeof scope>>>, stage: string, recipient?: string | null, version=1) {
  const family=row.apoderado, inscription=row.evaluacion.fila?.inscripcion, consent=inscription?.autorizacion
  return !!(row.estado==="VIGENTE" && row.versionActual===version && family.activo && (!recipient || recipient===family.correo) && row.evaluacion.paciente.apoderadoId===family.id && inscription?.apoderadoId===family.id && row.evaluacion.fila?.estado==="ATENDIDO" && consent?.apoderadoId===family.id && consent.pacienteId===row.evaluacion.pacienteId && consent.eventoId===inscription.eventoId && consent.versionTexto===PRIVACY_VERSION && consent.datos && consent.correoResultados && (stage==="INICIAL" || consent.seguimiento))
}
// Solo para un futuro llamador clínico de confianza: ninguna API permite enviar estos valores desde el navegador.
export async function prepareMailPlan(db: Db, publicationId: string, classification: Eligibility, policy: CalendarPolicy, now=new Date()) {
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "ResultadoPublicado" WHERE id=${publicationId}::uuid FOR UPDATE`
    const publication=await scope(tx,publicationId)
    if(!publication || publication.estado!=="VIGENTE")throw new Error("Publicación no disponible")
    const version=publication.versionActual, current=publication.versiones.find(row=>row.numero===version)
    if(!current && version!==1)throw new Error("Versión no disponible")
    const snapshot=parseSnapshot(current?.datos??publication.datos), dates=calendar(new Date(snapshot.fechaEvaluacion),current?.createdAt??publication.publicadoAt,policy), selection=eligible(classification)
    await draftMailPlan(tx,publicationId,version)
    for(const stage of STAGES) {
      const order=await tx.ordenCorreo.findUniqueOrThrow({where:{publicacionId_version_etapa:{publicacionId:publicationId,version,etapa:stage}}})
      if(order.estado!=="BLOQUEADO")continue
      if(selection==="PENDIENTE")continue
      const legacy=publication.correo!
      if(version===1 && stage==="INICIAL" && legacy.estado==="ENVIANDO")continue
      if(version===1 && stage==="INICIAL" && legacy.estado==="ENVIADO") {
        await tx.ordenCorreo.update({where:{id:order.id},data:{estado:"ACEPTADO",motivo:"ENVIO_INICIAL_EXISTENTE",destinatario:legacy.destinatario,proveedor:"legacy",proveedorId:legacy.proveedorId,aceptadoAt:legacy.enviadoAt}})
        continue
      }
      const allowed=permission(publication,stage,null,version), date=dates[stage]
      const motivo=selection==="NO"?"CLASIFICACION_NORMAL":!allowed?"PRIVACIDAD":!date?"PUBLICACION_TARDIA":date.getTime()+72*3_600_000<now.getTime()?"VENTANA_VENCIDA":null
      await tx.ordenCorreo.update({where:{id:order.id},data:{estado:motivo?"OMITIDO":"PENDIENTE",motivo,destinatario:publication.apoderado.correo,mensaje:stageMessage(snapshot,legacy.portalUrl,stage),politicaVersion:policy.version,protocoloVersion:policy.protocolo,plantillaVersion:"seguimiento-borrador.1",programadoAt:date,disponibleAt:date,limiteAt:date?new Date(date.getTime()+72*3_600_000):null}})
    }
  })
}
function validMessage(value: Prisma.JsonValue | null): Message {
  if(!value || typeof value!=="object" || Array.isArray(value))throw new Error("Mensaje no disponible")
  const row=value as Record<string,unknown>
  if(![row.subject,row.text,row.html].every(value=>typeof value==="string" && value.length>0))throw new Error("Mensaje no disponible")
  return {subject:String(row.subject),text:String(row.text),html:String(row.html)}
}
async function processOne(db: Db, transport: MailTransport, options: {policyVersion:string;secret:string;limit?:number;now?:Date}) {
  const now=options.now??new Date(), limit=1
  if(!options.policyVersion || options.secret.length<32 || !Number.isInteger(limit)||limit<1||limit>50 || !transport.name || !Number.isFinite(transport.idempotencyWindowMs)||transport.idempotencyWindowMs<0)throw new Error("Trabajador no configurado")
  let examined=0
  const jobs=await db.$transaction(async tx=>{
    const rows=await tx.$queryRaw<OrdenCorreo[]>`SELECT * FROM "OrdenCorreo" WHERE "politicaVersion"=${options.policyVersion} AND ((estado='PENDIENTE' AND "disponibleAt"<=${now}) OR (estado='ENVIANDO' AND "bloqueoHasta"<=${now})) ORDER BY "disponibleAt",id LIMIT ${limit} FOR UPDATE SKIP LOCKED`
    examined=rows.length
    const claimed:OrdenCorreo[]=[]
    for(const row of rows) {
      const lost=row.estado==="ENVIANDO"
      const unknown=lost && (!row.primerIntentoAt || row.primerIntentoAt.getTime()+transport.idempotencyWindowMs<=now.getTime() || (row.proveedor && row.proveedor!==transport.name))
      if(lost)await tx.intentoCorreo.updateMany({where:{ordenId:row.id,numero:row.intentos,terminadoAt:null},data:{resultado:"INTERRUMPIDO",terminadoAt:now}})
      if(unknown || row.intentos>=MAX_ATTEMPTS || !row.limiteAt || row.limiteAt<=now) {
        await tx.ordenCorreo.update({where:{id:row.id},data:{estado:unknown?"REVISION":"AGOTADO",motivo:unknown?"ACEPTACION_INCIERTA":"LIMITE_REINTENTOS",bloqueoToken:null,bloqueoHasta:null}});continue
      }
      const updated=await tx.ordenCorreo.update({where:{id:row.id},data:{estado:"ENVIANDO",proveedor:transport.name,intentos:{increment:1},primerIntentoAt:row.primerIntentoAt??now,bloqueoToken:randomUUID(),bloqueoHasta:new Date(now.getTime()+LEASE_MS)}})
      await tx.intentoCorreo.create({data:{ordenId:row.id,numero:updated.intentos,createdAt:now}})
      claimed.push(updated)
    }
    return claimed
  })
  const counts={examinados:examined,reclamados:jobs.length,aceptados:0,cancelados:0,fallidos:0}
  for(const job of jobs) {
    let state="PENDIENTE", reason:string|null=null, providerId:string|null=null, usedProvider=transport.name
    try {
      const publication=await scope(db,job.publicacionId)
      if(!publication || !permission(publication,job.etapa,job.destinatario,job.version)) {state="CANCELADO";reason="PRIVACIDAD_O_VINCULACION"}
      else if(await db.supresionCorreo.findUnique({where:{clave:suppressionKey(job.destinatario!,options.secret)}})) {state="CANCELADO";reason="DESTINATARIO_SUPRIMIDO"}
      else if(job.version===1 && job.etapa==="INICIAL" && publication.correo?.estado==="ENVIADO") {state="ACEPTADO";providerId=publication.correo.proveedorId;usedProvider="legacy"}
      else if(job.version===1 && job.etapa==="INICIAL" && publication.correo?.estado==="ENVIANDO") {state="REVISION";reason="ENVIO_INICIAL_EN_CURSO"}
      else {
        // Una retirada posterior a esta comprobación puede coincidir con un envío ya en curso.
        const live=await db.ordenCorreo.findFirst({where:{id:job.id,estado:"ENVIANDO",bloqueoToken:job.bloqueoToken,publicacion:{estado:"VIGENTE",versionActual:job.version}},select:{id:true}})
        if(!live){state="CANCELADO";reason="VERSION_NO_VIGENTE"}
        else {
        providerId=await transport.send({...validMessage(job.mensaje),to:job.destinatario!},job.claveIdempotencia)
        if(typeof providerId!=="string" || !providerId || providerId.length>254)throw new DeliveryFailure("INCIERTO")
        state="ACEPTADO"
        }
      }
    } catch(error) {
      reason=error instanceof DeliveryFailure?error.kind:"INCIERTO"
      state=reason==="TRANSITORIO" && job.intentos<MAX_ATTEMPTS && now.getTime()+retryDelay(job.intentos)<job.limiteAt!.getTime()?"PENDIENTE":reason==="INCIERTO"?"REVISION":"AGOTADO"
    }
    const finalized=await db.$transaction(async tx=>{
      const result=await tx.ordenCorreo.updateMany({where:{id:job.id,bloqueoToken:job.bloqueoToken,estado:"ENVIANDO"},data:{estado:state,motivo:reason,proveedor:usedProvider,proveedorId:providerId,aceptadoAt:state==="ACEPTADO"?now:null,disponibleAt:state==="PENDIENTE"?new Date(now.getTime()+retryDelay(job.intentos)):job.disponibleAt,bloqueoToken:null,bloqueoHasta:null}})
      if(!result.count){
        if(state==="ACEPTADO" && providerId){
          const late=await tx.ordenCorreo.updateMany({where:{id:job.id,estado:"CANCELADO",motivo:"VERSION_NO_VIGENTE",intentos:job.intentos,proveedorId:null},data:{proveedor:usedProvider,proveedorId:providerId,aceptadoAt:now}})
          if(late.count){await tx.intentoCorreo.updateMany({where:{ordenId:job.id,numero:job.intentos},data:{resultado:"ACEPTADO_TRAS_CANCELACION",terminadoAt:now}});await applyNotifications(tx,job.id,options.secret)}
        }
        return
      }
      await tx.intentoCorreo.updateMany({where:{ordenId:job.id,numero:job.intentos},data:{resultado:state==="ACEPTADO"?"ACEPTADO":reason??state,terminadoAt:now}})
      if(job.version===1 && job.etapa==="INICIAL") await tx.correoResultado.updateMany({where:{publicacionId:job.publicacionId,estado:{in:["PENDIENTE","FALLIDO","CANCELADO"]}},data:{estado:state==="ACEPTADO"?"ENVIADO":state==="CANCELADO"?"CANCELADO":"FALLIDO",...(state==="ACEPTADO"?{proveedorId:providerId,enviadoAt:now}:{}),ultimoError:reason}})
      if(state==="ACEPTADO")await applyNotifications(tx,job.id,options.secret)
      return true
    })
    if(!finalized)continue
    if(state==="ACEPTADO")counts.aceptados++;else if(state==="CANCELADO")counts.cancelados++;else counts.fallidos++
  }
  return counts
}
export type DeliveryEvent = {provider:string;id:string;messageId:string;type:"ENTREGADO"|"REBOTE"|"QUEJA";occurredAt:Date}
// El adaptador futuro debe autenticar el webhook antes de llamar a esta función. No es una ruta pública.
export async function recordDeliveryEvent(db: Db, event: DeliveryEvent, secret: string) {
  if(secret.length<32 || ![event.provider,event.id,event.messageId].every(value=>typeof value==="string"&&value.length>0&&value.length<=254) || !["ENTREGADO","REBOTE","QUEJA"].includes(event.type) || !Number.isFinite(event.occurredAt.getTime()))throw new Error("Notificación inválida")
  await db.$transaction(async tx=>{
    await tx.notificacionCorreo.createMany({data:[{proveedor:event.provider,eventoId:event.id,mensajeId:event.messageId,tipo:event.type,ocurridoAt:event.occurredAt}],skipDuplicates:true})
    const saved=await tx.notificacionCorreo.findUniqueOrThrow({where:{proveedor_eventoId:{proveedor:event.provider,eventoId:event.id}}})
    if(saved.mensajeId!==event.messageId||saved.tipo!==event.type||saved.ocurridoAt.getTime()!==event.occurredAt.getTime())throw new Error("Notificación repetida con contenido distinto")
    const order=await tx.ordenCorreo.findUnique({where:{proveedor_proveedorId:{proveedor:event.provider,proveedorId:event.messageId}}})
    if(order)await applyNotifications(tx,order.id,secret)
  })
}
async function applyNotifications(tx:Tx,id:string,secret:string) {
  await tx.$queryRaw`SELECT id FROM "OrdenCorreo" WHERE id=${id}::uuid FOR UPDATE`
  const order=await tx.ordenCorreo.findUniqueOrThrow({where:{id}})
  if(!order.proveedor || !order.proveedorId)return
  const events=await tx.notificacionCorreo.findMany({where:{proveedor:order.proveedor,mensajeId:order.proveedorId,aplicadaAt:null},orderBy:{createdAt:"asc"}})
  const ranks:Record<string,number>={SIN_CONFIRMAR:0,ENTREGADO:1,REBOTE:2,QUEJA:3}
  let delivery=order.entrega
  for(const event of events) {
    if(ranks[event.tipo]>ranks[delivery])delivery=event.tipo
    await tx.notificacionCorreo.update({where:{id:event.id},data:{ordenId:id,aplicadaAt:new Date()}})
  }
  await tx.ordenCorreo.update({where:{id},data:{entrega:delivery}})
  if(order.destinatario && ["REBOTE","QUEJA"].includes(delivery)) {
    const key=suppressionKey(order.destinatario,secret)
    await tx.supresionCorreo.upsert({where:{clave:key},create:{clave:key,motivo:delivery},update:{motivo:delivery}})
    await tx.ordenCorreo.updateMany({where:{destinatario:order.destinatario,estado:"PENDIENTE"},data:{estado:"CANCELADO",motivo:"DESTINATARIO_SUPRIMIDO"}})
  }
}

export async function reconcileDeliveryEvents(db: Db, secret: string) {
  const matches=await db.$queryRaw<Array<{id:string}>>`SELECT DISTINCT o.id FROM "OrdenCorreo" o JOIN "NotificacionCorreo" n ON n.proveedor=o.proveedor AND n."mensajeId"=o."proveedorId" WHERE n."aplicadaAt" IS NULL ORDER BY o.id LIMIT 100`
  for(const order of matches)await db.$transaction(tx=>applyNotifications(tx,order.id,secret))
}
export async function processMailBatch(db: Db, transport: MailTransport, options: {policyVersion:string;secret:string;limit?:number;now?:Date}) {
  const limit=options.limit??10
  if(!options.policyVersion || options.secret.length<32 || !Number.isInteger(limit)||limit<1||limit>50)throw new Error("Trabajador no configurado")
  await reconcileDeliveryEvents(db,options.secret)
  const total={examinados:0,reclamados:0,aceptados:0,cancelados:0,fallidos:0}
  for(let index=0;index<limit;index++) {
    const result=await processOne(db,transport,options)
    for(const key of Object.keys(total) as Array<keyof typeof total>)total[key]+=result[key]
    if(!result.examinados)break
  }
  return total
}
