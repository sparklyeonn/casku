import { draftMailPlan } from "@/lib/mail-queue/store"
import { requireDataConsent, trace } from "@/lib/privacy/store"
import { privateHash } from "@/lib/families/security"
import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AttentionConflict, AttentionUnavailable } from "@/lib/kinesiology/http"
import { parseMeasurements, InvalidEvaluation } from "@/lib/evaluation-input"
import { parseSnapshot, type ResultSnapshot } from "./snapshot"
import type { publishedChangeInput } from "./input"
const reviewInclude={paciente:true,fila:{include:{inscripcion:{include:{apoderado:true,evento:true}}}},publicacion:{include:{correo:true,versiones:{orderBy:{numero:"desc" as const},take:1},ordenesCorreo:{where:{etapa:"INICIAL"},select:{version:true,estado:true,disponibleAt:true}}}}} satisfies Prisma.EvaluacionInclude
type Review=Prisma.EvaluacionGetPayload<{include:typeof reviewInclude}>
type Publication=NonNullable<Review["publicacion"]>
type Measures=ReturnType<typeof parseMeasurements>
function draftSnapshot(row:Review):ResultSnapshot {
 return parseSnapshot({nombreBebe:row.paciente.nombre,fechaNacimiento:row.paciente.fechaNacimiento.toISOString().slice(0,10),profesional:row.kinesiologa,evento:row.fila?.inscripcion.evento.nombre??null,numero:row.fila?.inscripcion.numero??null,fechaEvaluacion:row.createdAt.toISOString(),medidas:{ap:row.anteroposterior,bp:row.biparietal,di:row.diagonalIzq,dd:row.diagonalDer},indiceCraneal:row.indiceCraneal,indiceAsimetria:row.indiceAsimetria,diagnostico:row.diagnostico,recomendacion:row.recomendacion})
}
function latest(publication:Publication) {
 const version=publication.versiones.find(row=>row.numero===publication.versionActual)
 if(!version&&publication.versionActual!==1)throw new Error("Versión no disponible")
 return {datos:parseSnapshot(version?.datos??publication.datos),fecha:version?.createdAt??publication.publicadoAt}
}
function recipient(row:Review) {
 const inscription=row.fila?.inscripcion,family=inscription?.apoderado
 return family?.activo&&row.paciente.apoderadoId===family.id&&inscription?.pacienteId===row.pacienteId&&row.fila?.estado==="ATENDIDO"?family:null
}
const mailSummary=(mail:{estado:string;disponibleAt:Date|null}|null|undefined)=>mail?{estado:mail.estado,reintentarDesde:mail.disponibleAt?.toISOString()??null}:{estado:"BLOQUEADO",reintentarDesde:null}
function publicationMail(publication:Publication) {
 if(publication.estado!=="VIGENTE")return {estado:"RETIRADO",reintentarDesde:null}
 return mailSummary(publication.versionActual===1?publication.correo:publication.ordenesCorreo.find(row=>row.version===publication.versionActual))
}
function reviewSummary(row:Review) {
 const family=recipient(row),publication=row.publicacion,current=publication?latest(publication):null
 return {id:row.id,revision:row.revision,datos:current?.datos??draftSnapshot(row),publicable:!!family,motivoBloqueo:family?null:"Pendiente de vinculación con una cuenta familiar verificada y activa.",correoDestino:family?.correo??publication?.correo?.destinatario??null,publicacion:publication?{id:publication.id,publicadoAt:current!.fecha.toISOString(),version:publication.versionActual,revisionControl:publication.revisionControl,estado:publication.estado,correo:publicationMail(publication)}:null}
}
export type ResultReview=ReturnType<typeof reviewSummary>
export async function ownedReview(staffId:string,id:string) {
 const row=await prisma.evaluacion.findFirst({where:{id,autorId:staffId},include:reviewInclude})
 if(row)await trace(prisma,{id:staffId,role:"KINESIOLOGO"},"CONSULTAR","EVALUACION",row.id)
 return row?reviewSummary(row):null
}
export async function ownResults(staffId:string,page:number,state:"TODOS"|"BORRADOR"|"PUBLICADO"|"RETIRADO",eventoId?:string) {
 const where:Prisma.EvaluacionWhereInput={autorId:staffId,...(eventoId?{fila:{is:{eventoId}}}:{}),...(state==="BORRADOR"?{publicacion:{is:null}}:state==="PUBLICADO"?{publicacion:{is:{estado:"VIGENTE"}}}:state==="RETIRADO"?{publicacion:{is:{estado:"RETIRADO"}}}:{})}
 const [total,rows]=await prisma.$transaction([prisma.evaluacion.count({where}),prisma.evaluacion.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(page-1)*20,take:20,include:reviewInclude})])
 await trace(prisma,{id:staffId,role:"KINESIOLOGO"},"CONSULTAR_LISTA","EVALUACIONES",`pagina:${page}`)
 return {total,pagina:page,hayMas:page*20<total,resultados:rows.map(row=>{const view=reviewSummary(row);return {id:row.id,revision:row.revision,nombreBebe:view.datos.nombreBebe,fecha:row.createdAt.toISOString(),evento:view.datos.evento,numero:view.datos.numero,estado:row.publicacion?(row.publicacion.estado==="RETIRADO"?"RETIRADO":"PUBLICADO"):"BORRADOR",version:row.publicacion?.versionActual??null,correo:view.publicacion?.correo.estado??null}})}
}
async function lockOwned(tx:Prisma.TransactionClient,staffId:string,id:string) {
 const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Evaluacion" WHERE id=${id} AND "autorId"=${staffId} FOR UPDATE`
 if(!rows.length)throw new AttentionUnavailable()
 return tx.evaluacion.findUniqueOrThrow({where:{id},include:reviewInclude})
}
function measureData(measures:Measures) {
 return {anteroposterior:measures.ap,biparietal:measures.bp,diagonalIzq:measures.di,diagonalDer:measures.dd,indiceCraneal:measures.indiceCraneal,indiceAsimetria:measures.indiceAsimetria,diagnostico:measures.diagnostico,recomendacion:measures.recomendacion}
}
export async function reviseResult(staffId:string,id:string,revision:number,measures:Measures) {
 return prisma.$transaction(async tx=>{
  const row=await lockOwned(tx,staffId,id)
  if(row.publicacion)throw new AttentionConflict("El resultado ya está publicado. Usa la corrección con motivo y nueva versión.")
  if(row.revision!==revision)throw new AttentionConflict("La evaluación cambió en otra pantalla. Actualiza antes de guardar.")
  await requireDataConsent(tx,row.autorizacionId??row.fila?.inscripcion.autorizacionId,row.pacienteId,row.paciente.apoderadoId)
  const anterior=draftSnapshot(row),data=measureData(measures)
  if(Object.entries(data).every(([key,value])=>row[key as keyof typeof data]===value))return reviewSummary(row)
  const updated=await tx.evaluacion.update({where:{id},data:{...data,revision:{increment:1}},include:reviewInclude})
  await tx.revisionEvaluacion.create({data:{evaluacionId:id,revision:updated.revision,autorId:staffId,anterior,nueva:draftSnapshot(updated)}})
  return reviewSummary(updated)
 },{timeout:15000})
}
function portalUrl(id:string) {
 try {const base=process.env.AUTH_URL||process.env.NEXTAUTH_URL;if(!base)return null;const url=new URL(`/familias/resultados/${id}`,base);return ["https:","http:"].includes(url.protocol)?url.href:null}catch{return null}
}
export async function publishResult(staffId:string,id:string,revision:number) {
 return prisma.$transaction(async tx=>{
  const row=await lockOwned(tx,staffId,id)
  if(row.revision!==revision)throw new AttentionConflict("La evaluación cambió. Revisa la última versión antes de publicarla.")
  if(row.publicacion){if(row.publicacion.estado==="RETIRADO")throw new AttentionConflict("El resultado está retirado. Usa corregir y publicar una nueva versión con motivo.");return {id:row.publicacion.id,nueva:false}}
  const family=recipient(row)
  if(!family)throw new AttentionConflict("Primero debe verificarse la vinculación del bebé con una cuenta familiar activa. No se envió el resultado al correo de contacto.")
  const authorization=await requireDataConsent(tx,row.autorizacionId??row.fila?.inscripcion.autorizacionId,row.pacienteId,family.id)
  const snapshot=draftSnapshot(row),checked=parseMeasurements(snapshot.medidas)
  if(snapshot.indiceCraneal!==checked.indiceCraneal||snapshot.indiceAsimetria!==checked.indiceAsimetria||snapshot.diagnostico!==checked.diagnostico||snapshot.recomendacion!==checked.recomendacion)throw new AttentionConflict("Revisa y guarda las medidas antes de publicar este resultado.")
  const publicationId=randomUUID()
  await tx.resultadoPublicado.create({data:{id:publicationId,evaluacionId:id,apoderadoId:family.id,publicadoPorId:staffId,revision,datos:snapshot,versiones:{create:{numero:1,revisionEvaluacion:revision,datos:snapshot,motivo:"Publicación inicial",actorId:staffId}},correo:{create:{destinatario:family.correo,portalUrl:portalUrl(publicationId),...(authorization.correoResultados?{}:{estado:"CANCELADO",ultimoError:"PRIVACIDAD"})}}}})
  await draftMailPlan(tx,publicationId)
  await trace(tx,{id:staffId,role:"KINESIOLOGO"},"PUBLICAR","PUBLICACION",publicationId)
  return {id:publicationId,nueva:true}
 },{timeout:15000})
}
async function cancelVersionMail(tx:Prisma.TransactionClient,publicationId:string,version:number) {
 const running=await tx.ordenCorreo.count({where:{publicacionId:publicationId,version,estado:"ENVIANDO"}})+(version===1?await tx.correoResultado.count({where:{publicacionId:publicationId,estado:"ENVIANDO"}}):0)
 await tx.ordenCorreo.updateMany({where:{publicacionId:publicationId,version,estado:{in:["BLOQUEADO","PENDIENTE","ENVIANDO"]}},data:{estado:"CANCELADO",motivo:"VERSION_NO_VIGENTE",bloqueoToken:null,bloqueoHasta:null}})
 if(version===1)await tx.correoResultado.updateMany({where:{publicacionId:publicationId,estado:{in:["PENDIENTE","FALLIDO","ENVIANDO"]}},data:{estado:"CANCELADO",ultimoError:"VERSION_NO_VIGENTE",bloqueoToken:null,bloqueoHasta:null}})
 return running
}
export async function changePublishedResult(actor:{id:string;version:number},id:string,action:"CORREGIR"|"RETIRAR",input:ReturnType<typeof publishedChangeInput>,measures?:Measures) {
 const hash=privateHash(`published-change:${JSON.stringify({actor:actor.id,evaluacionId:id,action,input,measures:measures??null})}`)
 return prisma.$transaction(async tx=>{
  const row=await lockOwned(tx,actor.id,id),publication=row.publicacion
  if(!publication)throw new AttentionConflict("Primero debe existir un resultado publicado.")
  await tx.$queryRaw`SELECT id FROM "ResultadoPublicado" WHERE id=${publication.id}::uuid FOR UPDATE`
  const account=await tx.cuentaEquipo.findUnique({where:{id:actor.id}})
  if(!account?.active||account.role!=="KINESIOLOGO"||account.version!==actor.version)throw new AttentionConflict("Tu acceso cambió. Vuelve a ingresar.")
  const previous=await tx.cambioResultado.findUnique({where:{id:input.id}})
  if(previous){if(previous.publicacionId!==publication.id||previous.actorId!==actor.id||previous.solicitudHash!==hash)throw new AttentionConflict("Esta solicitud ya corresponde a otro cambio. Actualiza antes de continuar.");return {repetida:true,enviosEnCurso:previous.enviosEnCurso}}
  if(publication.revisionControl!==input.revisionControl)throw new AttentionConflict("La publicación cambió en otra pantalla. Recarga la versión vigente antes de continuar.")
  if(action==="RETIRAR"&&publication.estado==="RETIRADO")throw new AttentionConflict("El resultado ya está retirado.")
  const base=latest(publication).datos
  await tx.versionResultado.createMany({data:[{id:publication.id,publicacionId:publication.id,numero:1,revisionEvaluacion:publication.revision,datos:publication.datos as Prisma.InputJsonValue,motivo:"Publicación inicial",actorId:publication.publicadoPorId,createdAt:publication.publicadoAt}],skipDuplicates:true})
  let newVersion:number|null=null
  if(action==="CORREGIR") {
   const family=recipient(row)
   if(!family || family.id!==publication.apoderadoId)throw new AttentionConflict("La vinculación familiar debe estar verificada y corresponder a la publicación antes de republicar.")
   await requireDataConsent(tx,row.autorizacionId??row.fila?.inscripcion.autorizacionId,row.pacienteId,family.id)
   if(!measures)throw new InvalidEvaluation("Revisa las medidas corregidas.")
   if(publication.estado==="VIGENTE"&&Object.entries(base.medidas).every(([key,value])=>measures[key as keyof typeof base.medidas]===value))throw new InvalidEvaluation("Modifica al menos una medición antes de publicar una corrección.")
   const snapshot:ResultSnapshot={...base,medidas:{ap:measures.ap,bp:measures.bp,di:measures.di,dd:measures.dd},indiceCraneal:measures.indiceCraneal,indiceAsimetria:measures.indiceAsimetria,diagnostico:measures.diagnostico,recomendacion:measures.recomendacion}
   const updated=await tx.evaluacion.update({where:{id},data:{...measureData(measures),revision:{increment:1}}})
   await tx.revisionEvaluacion.create({data:{evaluacionId:id,revision:updated.revision,autorId:actor.id,anterior:base,nueva:snapshot}})
   newVersion=publication.versionActual+1
   await tx.versionResultado.create({data:{publicacionId:publication.id,numero:newVersion,revisionEvaluacion:updated.revision,datos:snapshot,motivo:input.motivo,actorId:actor.id}})
  }
  const running=await cancelVersionMail(tx,publication.id,publication.versionActual)
  await tx.resultadoPublicado.update({where:{id:publication.id},data:{estado:action==="RETIRAR"?"RETIRADO":"VIGENTE",...(newVersion?{versionActual:newVersion}:{}),revisionControl:{increment:1}}})
  if(newVersion)await draftMailPlan(tx,publication.id,newVersion)
  await tx.cambioResultado.create({data:{id:input.id,publicacionId:publication.id,actorId:actor.id,accion:action,versionAnterior:publication.versionActual,versionNueva:newVersion,revisionControl:publication.revisionControl+1,motivo:input.motivo,solicitudHash:hash,enviosEnCurso:running}})
  await trace(tx,{id:actor.id,role:"KINESIOLOGO"},action,"PUBLICACION",publication.id)
  return {repetida:false,enviosEnCurso:running}
 },{timeout:15000})
}
export async function publicationHistory(staffId:string,id:string,page:number) {
 return prisma.$transaction(async tx=>{
  const owned=await tx.evaluacion.findFirst({where:{id,autorId:staffId},select:{publicacion:{select:{id:true,versionActual:true,estado:true}}}})
  if(!owned?.publicacion)return null
  const publication=owned.publicacion
  const [versions,changes]=await Promise.all([tx.versionResultado.findMany({where:{publicacionId:publication.id},orderBy:{numero:"desc"},skip:(page-1)*10,take:11}),tx.cambioResultado.findMany({where:{publicacionId:publication.id},orderBy:{revisionControl:"desc"},skip:(page-1)*10,take:11})])
  await trace(tx,{id:staffId,role:"KINESIOLOGO"},"CONSULTAR_HISTORIAL","PUBLICACION",publication.id)
  return {pagina:page,hayMas:versions.length>10||changes.length>10,estado:publication.estado,versionActual:publication.versionActual,versiones:versions.slice(0,10).map(row=>({version:row.numero,revisionEvaluacion:row.revisionEvaluacion,fecha:row.createdAt.toISOString(),motivo:row.motivo,actorId:row.actorId,datos:parseSnapshot(row.datos)})),cambios:changes.slice(0,10).map(row=>({accion:row.accion,motivo:row.motivo,actorId:row.actorId,fecha:row.createdAt.toISOString(),versionAnterior:row.versionAnterior,versionNueva:row.versionNueva,revisionControl:row.revisionControl,enviosEnCurso:row.enviosEnCurso}))}
 },{isolationLevel:"RepeatableRead"})
}
export const familyResultScope=(familyId:string):Prisma.ResultadoPublicadoWhereInput=>({apoderadoId:familyId,apoderado:{activo:true},evaluacion:{paciente:{apoderadoId:familyId},fila:{is:{estado:"ATENDIDO",inscripcion:{apoderadoId:familyId}}}}})
const familyInclude={correo:true,versiones:{orderBy:{numero:"desc" as const},take:1},ordenesCorreo:{where:{etapa:"INICIAL"},select:{version:true,estado:true,disponibleAt:true}}} satisfies Prisma.ResultadoPublicadoInclude
function familySummary(row:Prisma.ResultadoPublicadoGetPayload<{include:typeof familyInclude}>) {
 const current=latest(row)
 return {id:row.id,publicadoAt:current.fecha.toISOString(),estado:row.estado,version:row.versionActual,nombreBebe:current.datos.nombreBebe,evento:current.datos.evento,numero:current.datos.numero,datos:row.estado==="VIGENTE"?current.datos:null,correo:publicationMail(row)}
}
export async function familyPublishedResults(familyId:string,page:number) {
 const where=familyResultScope(familyId)
 const [total,rows]=await prisma.$transaction([prisma.resultadoPublicado.count({where}),prisma.resultadoPublicado.findMany({where,orderBy:[{publicadoAt:"desc"},{id:"desc"}],skip:(page-1)*20,take:20,include:familyInclude})])
 await trace(prisma,{id:`familia:${familyId}`,role:"APODERADO"},"CONSULTAR_LISTA","PUBLICACIONES",`pagina:${page}`)
 return {total,pagina:page,hayMas:page*20<total,resultados:rows.map(familySummary)}
}
export async function familyPublishedResult(familyId:string,id:string) {
 const row=await prisma.resultadoPublicado.findFirst({where:{id,...familyResultScope(familyId)},include:familyInclude})
 if(row)await trace(prisma,{id:`familia:${familyId}`,role:"APODERADO"},"CONSULTAR","PUBLICACION",row.id)
 return row?familySummary(row):null
}
