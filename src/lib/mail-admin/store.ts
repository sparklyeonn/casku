import { randomUUID } from "node:crypto"
import { Prisma,type PrismaClient } from "@prisma/client"
import { MailAdminError,type MailAction,type MailFilters } from "./input.ts"
import { canonicalMessageId } from "../mail/webhook-policy.ts"
import { TEAM_SESSION_IDLE_MINUTES } from "../team-auth/policy.ts"
type Db=PrismaClient
type Tx=Prisma.TransactionClient
type MailRow={tipo:string;id:string;finalidad:string;eventoId:string|null;eventoNombre:string|null;numero:number|null;proceso:string;estado:string;entrega:string;intentos:number;motivo:string|null;creado:Date;actualizado:Date;huella:string;suprimido:boolean;revision:number;seguimiento:string;mensaje:string|null;proveedor:string|null}
const tracking=Prisma.sql`CASE WHEN g.estado='CERRADO' AND g."huellaCierre"<>v.huella THEN 'NUEVA_INCIDENCIA' ELSE COALESCE(g.estado,'PENDIENTE') END`
const needsReview=Prisma.sql`(${tracking} IN ('EN_REVISION','NUEVA_INCIDENCIA') OR (${tracking}<>'CERRADO' AND (v.estado IN ('REVISION','RECHAZADO','AGOTADO') OR v.entrega IN ('REBOTE','QUEJA'))))`
const from=Prisma.sql`FROM "VistaCorreoAdministracion" v LEFT JOIN "GestionCorreo" g ON g.tipo=v.tipo AND g."destinoId"=v.id`
function dto(row:MailRow){return {proveedor:row.proveedor==='brevo'?'Brevo':'Registro anterior',referenciaProveedor:row.mensaje&&/^[a-zA-Z0-9@._<>:-]{1,254}$/.test(row.mensaje)?row.mensaje:null,tipo:row.tipo,id:row.id,finalidad:row.finalidad,eventoId:row.eventoId,eventoNombre:row.eventoNombre,numero:row.numero,estado:row.estado,proceso:row.proceso,entrega:row.entrega,intentos:row.intentos,motivo:row.motivo&&/^[A-Z_0-9]{1,64}$/.test(row.motivo)?row.motivo:row.motivo?"INCIDENCIA_REGISTRADA":null,creado:row.creado.toISOString(),actualizado:row.actualizado.toISOString(),huella:row.huella,suprimido:row.suprimido,revision:row.revision,seguimiento:row.seguimiento}}
const columns=Prisma.sql`v.tipo,v.id,v.finalidad,v."eventoId",v."eventoNombre",v.numero,v.proceso,v.estado,v.entrega,v.intentos,v.motivo,v.creado,v.actualizado,v.huella,v.suprimido,v.mensaje,v.proveedor,COALESCE(g.revision,0)::int revision,${tracking} seguimiento`
function where(filters:MailFilters){return Prisma.sql`(${filters.tipo}::text IS NULL OR v.tipo=${filters.tipo}) AND (${filters.eventoId}::uuid IS NULL OR v."eventoId"=${filters.eventoId}::uuid) AND
 (${filters.seguimiento}='TODOS' OR ${tracking}=${filters.seguimiento}) AND
 (${filters.estado}='TODOS' OR (${filters.estado}='PENDIENTES' AND v.estado IN ('PENDIENTE','ENVIANDO','BLOQUEADO')) OR (${filters.estado}='ACEPTADOS' AND v.estado='ACEPTADO') OR (${filters.estado}='ENTREGADOS' AND v.entrega='ENTREGADO') OR (${filters.estado}='FALLOS' AND v.estado IN ('FALLIDO','RECHAZADO','REINTENTABLE','AGOTADO')) OR (${filters.estado}='REBOTES' AND v.entrega IN ('REBOTE','REBOTE_TEMPORAL')) OR (${filters.estado}='QUEJAS' AND v.entrega='QUEJA') OR (${filters.estado}='REVISION' AND ${needsReview}))`}
export async function listAdminMail(db:Db,filters:MailFilters){
 const filter=where(filters)
 const [rows,totals]=await Promise.all([db.$queryRaw<MailRow[]>(Prisma.sql`SELECT ${columns} ${from} WHERE ${filter} ORDER BY v.creado DESC,v.tipo,v.id LIMIT 20 OFFSET ${(filters.pagina-1)*20}`),db.$queryRaw<Array<{total:number;fallos:number;entregados:number;rebotes:number;quejas:number;revision:number}>>(Prisma.sql`SELECT count(*)::int total,count(*) FILTER(WHERE v.estado IN ('FALLIDO','RECHAZADO','REINTENTABLE','AGOTADO'))::int fallos,count(*) FILTER(WHERE v.entrega='ENTREGADO')::int entregados,count(*) FILTER(WHERE v.entrega IN ('REBOTE','REBOTE_TEMPORAL'))::int rebotes,count(*) FILTER(WHERE v.entrega='QUEJA')::int quejas,count(*) FILTER(WHERE ${needsReview})::int revision ${from} WHERE ${filter}`)])
 return {correos:rows.map(dto),pagina:filters.pagina,total:totals[0].total,hayMas:filters.pagina*20<totals[0].total,resumen:totals[0]}
}
async function current(db:Db|Tx,tipo:string,id:string){const [row]=await db.$queryRaw<MailRow[]>(Prisma.sql`SELECT ${columns} ${from} WHERE v.tipo=${tipo} AND v.id=${id}::uuid`);if(!row)throw new MailAdminError("Correo no disponible.",404);return row}
export async function adminMailDetail(db:Db,tipo:string,id:string,historyPage=1,eventPage=1){
 const row=await current(db,tipo,id)
 const history=await db.cambioGestionCorreo.findMany({where:{tipo,destinoId:id},orderBy:{revision:"desc"},skip:(historyPage-1)*20,take:21,select:{id:true,actorId:true,actorNombre:true,accion:true,motivo:true,revision:true,createdAt:true}})
 let events:Array<{tipo:string;ocurridoAt:Date;createdAt:Date}>=[]
 if(row.mensaje&&row.proveedor){let ids=[row.mensaje];if(row.proveedor==='brevo'){try{const canonical=canonicalMessageId(row.mensaje);ids=[canonical,`<${canonical}>`]}catch{ids=[]}}
 events=await db.notificacionCorreo.findMany({where:{proveedor:row.proveedor,mensajeId:{in:ids},OR:[{envioClave:{not:null}},{ordenId:{not:null},aplicadaAt:{not:null}}]},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(eventPage-1)*20,take:21,select:{tipo:true,ocurridoAt:true,createdAt:true}})}
 return {correo:dto(row),historial:history.slice(0,20),hayMasHistorial:history.length>20,notificaciones:events.slice(0,20),hayMasNotificaciones:events.length>20}
}
export type MailAdminActor={id:string;version:number;sessionId:string}
async function validActor(tx:Tx,actor:MailAdminActor){
 await tx.$queryRaw`SELECT id FROM "CuentaEquipo" WHERE id=${actor.id} FOR UPDATE`
 const account=await tx.cuentaEquipo.findUnique({where:{id:actor.id}})
 const session=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "SesionEquipo" WHERE id=${actor.sessionId}::uuid AND "cuentaId"=${actor.id} AND version=${actor.version} AND "revocadaAt" IS NULL AND "expiraAt">CURRENT_TIMESTAMP AND "actividadAt">CURRENT_TIMESTAMP-${TEAM_SESSION_IDLE_MINUTES}*interval '1 minute'`
 if(!account?.active||account.role!=="ADMIN"||account.mustChangePassword||account.version!==actor.version||!session.length)throw new MailAdminError("Tu acceso cambió. Inicia sesión nuevamente.",403)
 return account
}
export async function actOnAdminMail(db:Db,actor:MailAdminActor,tipo:string,id:string,input:MailAction,options:{canRetry:boolean;retry?:(inscripcionId:string,revisionContenido:number)=>Promise<void>}){
 const result=await db.$transaction(async tx=>{
  const account=await validActor(tx,actor)
  const previous=await tx.cambioGestionCorreo.findUnique({where:{id:input.id}})
  if(previous){if(previous.tipo!==tipo||previous.destinoId!==id||previous.actorId!==actor.id||previous.accion!==input.accion||previous.motivo!==input.motivo||previous.huella!==input.huella||previous.revision!==input.revision+1)throw new MailAdminError("La operación ya se utilizó con otros datos.",409);return {repetida:true}}
  if(tipo==='RECUPERACION')await tx.$queryRaw`SELECT id FROM "SolicitudRecuperacion" WHERE id=${id}::uuid FOR UPDATE`
  await tx.gestionCorreo.createMany({data:[{id:randomUUID(),tipo,destinoId:id}],skipDuplicates:true})
  await tx.$queryRaw`SELECT id FROM "GestionCorreo" WHERE tipo=${tipo} AND "destinoId"=${id}::uuid FOR UPDATE`
  const row=await current(tx,tipo,id)
  if(row.revision!==input.revision||row.huella!==input.huella)throw new MailAdminError("El correo cambió. Actualiza antes de continuar.",409)
  let next="EN_REVISION",inscripcionId:string|undefined,revisionContenido:number|undefined
  if(input.accion==='CERRAR'){if(row.seguimiento==='CERRADO')throw new MailAdminError("La revisión ya está cerrada.",409);next='CERRADO'}
  if(input.accion==='REABRIR'&&!['CERRADO','NUEVA_INCIDENCIA'].includes(row.seguimiento))throw new MailAdminError("Esta revisión no está cerrada.",409)
  if(input.accion==='REINTENTAR_CONFIRMACION'){
   if(!options.canRetry||!options.retry)throw new MailAdminError("Los envíos están desactivados o pendientes de configuración.",409)
   if(tipo!=='CONFIRMACION'||row.suprimido||!['PENDIENTE','FALLIDO','REINTENTABLE'].includes(row.estado))throw new MailAdminError("Este mensaje no admite un reintento administrativo.",409)
   await tx.$queryRaw`SELECT id FROM "CorreoInscripcion" WHERE id=${id}::uuid FOR UPDATE`
   if((await current(tx,tipo,id)).huella!==input.huella)throw new MailAdminError("El correo cambió. Actualiza antes de continuar.",409)
   const mail=await tx.correoInscripcion.findUnique({where:{id},include:{inscripcion:{select:{cancelacion:{select:{id:true}}}}}})
   const ready=await tx.$queryRaw<Array<{id:string}>>`SELECT c.id FROM "CorreoInscripcion" c LEFT JOIN "EnvioTransaccional" l ON l.clave='registration-'||c.id::text||CASE WHEN c."revisionContenido"=1 THEN '' ELSE '-revision-'||c."revisionContenido"::text END WHERE c.id=${id}::uuid AND c.estado IN ('PENDIENTE','FALLIDO') AND c."disponibleAt"<=CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AND (l.clave IS NULL OR (l.estado IN ('PENDIENTE','REINTENTABLE') AND l.intentos<5 AND l."disponibleAt"<=CURRENT_TIMESTAMP))`
   if(!mail||mail.inscripcion.cancelacion||!ready.length)throw new MailAdminError("El correo está bloqueado, en curso o debe esperar antes de reintentar.",409)
   inscripcionId=mail.inscripcionId;revisionContenido=mail.revisionContenido
  }
  const before={seguimiento:row.seguimiento,estado:row.estado,entrega:row.entrega,revision:row.revision}
  const after={seguimiento:next,estado:row.estado,entrega:row.entrega,revision:row.revision+1}
  await tx.gestionCorreo.update({where:{tipo_destinoId:{tipo,destinoId:id}},data:{estado:next,revision:{increment:1},huellaCierre:next==='CERRADO'?row.huella:null}})
  await tx.cambioGestionCorreo.create({data:{id:input.id,tipo,destinoId:id,actorId:actor.id,actorNombre:account.name,accion:input.accion,motivo:input.motivo,revision:row.revision+1,huella:row.huella,anterior:before,nueva:after}})
  return {repetida:false,inscripcionId,revisionContenido}
 })
 // La intención queda auditada antes del proveedor. Repetir la misma operación no vuelve a enviarla.
 if(result.inscripcionId){try{await options.retry!(result.inscripcionId,result.revisionContenido!)}catch{return {repetida:result.repetida,mensaje:"Acción registrada. Consulta el estado del correo antes de continuar."}}}
 return {repetida:result.repetida,mensaje:result.inscripcionId?"Solicitud de reintento registrada. Consulta el estado actualizado.":"Gestión registrada."}
}
