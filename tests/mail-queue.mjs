import assert from "node:assert/strict"
import {randomUUID,randomBytes} from "node:crypto"
import {readFile,readdir} from "node:fs/promises"
import {PGlite} from "@electric-sql/pglite"
import {PGLiteSocketServer} from "@electric-sql/pglite-socket"
import {PrismaClient} from "@prisma/client"
import {PrismaPg} from "@prisma/adapter-pg"
import {protocolGate} from "./pglite-protocol-gate.mjs"
import {draftMailPlan,prepareMailPlan,processMailBatch,recordDeliveryEvent,reconcileDeliveryEvents} from "../src/lib/mail-queue/store.ts"
import {recordBrevoEvents} from "../src/lib/mail/webhook-store.ts"
import {parseBrevoEvents} from "../src/lib/mail/webhook-policy.ts"
import {DeliveryFailure,LEASE_MS} from "../src/lib/mail-queue/policy.ts"
import {PRIVACY_VERSION} from "../src/lib/privacy/policy.ts"
const embedded=new PGlite(), socket=new PGLiteSocketServer({db:embedded,host:"127.0.0.1",port:0,maxConnections:20})
let gate,db,second
const now=new Date("2026-01-31T15:00:00Z"),secret=randomBytes(32).toString("base64url")
const policy={version:"calendario-ficticio-1",protocolo:"protocolo-ficticio-1",plantillasAprobadas:true,zona:"America/Santiago",hora:9,tardios:"OMITIR"}
const mixed={plagiocefalia:"NORMAL",forma:"ALTERADA"},normal={plagiocefalia:"NORMAL",forma:"NORMAL"}
const options=(date=now,limit=10)=>({policyVersion:policy.version,secret,now:date,limit})
let sent=[],serial=0
const transport={name:"simulado",idempotencyWindowMs:24*3600000,async send(message,key){sent.push({message,key});return `local-${++serial}`}}
async function fixture({consent=true,followup=true,evaluated=now,published=now,legacySent=false}={}) {
 const family=await db.apoderado.create({data:{correo:`${randomUUID()}@example.com`,nombre:"Familia ficticia"}})
 const baby=await db.paciente.create({data:{nombre:"Bebé ficticio",fechaNacimiento:new Date("2026-01-01"),apoderadoId:family.id}})
 const event=await db.evento.create({data:{nombre:"Evento ficticio",fecha:now,lugar:"Prueba local",cupos:10,inscritos:1,ultimoNumero:1,creadoPorId:"fixture"}})
 const authorization=await db.autorizacionPrivacidad.create({data:{ambito:`evento:${event.id}:bebe:${baby.id}`,pacienteId:baby.id,eventoId:event.id,apoderadoId:family.id,datos:consent,correoResultados:consent,seguimiento:consent&&followup,versionTexto:PRIVACY_VERSION}})
 const inscription=await db.inscripcion.create({data:{id:randomUUID(),solicitudHash:"fixture",eventoId:event.id,pacienteId:baby.id,apoderadoId:family.id,autorizacionId:authorization.id,numero:1,qrToken:randomUUID()}})
 const attention=await db.entradaFila.create({data:{eventoId:event.id,inscripcionId:inscription.id,orden:1,estado:"ATENDIDO",confirmadoPorId:"fixture",profesionalId:"kine-ficticia",reservaId:randomUUID(),llamadaAt:now,finalizadaAt:now}})
 const evaluation=await db.evaluacion.create({data:{pacienteId:baby.id,filaId:attention.id,autorId:"kine-ficticia",autorizacionId:authorization.id,anteroposterior:140,biparietal:120,diagonalIzq:150,diagonalDer:130,indiceCraneal:85.71,indiceAsimetria:20,diagnostico:"Resultado ficticio",recomendacion:"Indicación revisada ficticia",kinesiologa:"Profesional ficticia",createdAt:evaluated}})
 const snapshot={nombreBebe:baby.nombre,fechaNacimiento:"2026-01-01",profesional:"Profesional ficticia",evento:event.nombre,numero:1,fechaEvaluacion:evaluated.toISOString(),medidas:{ap:140,bp:120,di:150,dd:130},indiceCraneal:85.71,indiceAsimetria:20,diagnostico:"Resultado ficticio",recomendacion:"Indicación revisada ficticia"}
 const publication=await db.resultadoPublicado.create({data:{evaluacionId:evaluation.id,apoderadoId:family.id,publicadoPorId:"kine-ficticia",revision:1,datos:snapshot,publicadoAt:published,versiones:{create:{numero:1,revisionEvaluacion:1,datos:snapshot,motivo:"Publicación inicial ficticia",actorId:"kine-ficticia",createdAt:published}},correo:{create:{destinatario:family.correo,estado:legacySent?"ENVIADO":"PENDIENTE",...(legacySent?{enviadoAt:now,proveedorId:"anterior-ficticio"}:{})}}}})
 await db.$transaction(tx=>draftMailPlan(tx,publication.id))
 return {publication,family,baby,authorization,event}
}
const orders=id=>db.ordenCorreo.findMany({where:{publicacionId:id},orderBy:{etapa:"asc"}})
async function clearReady(){await db.ordenCorreo.updateMany({where:{estado:"PENDIENTE"},data:{estado:"CANCELADO",motivo:"FIN_CASO_FICTICIO"}})}
try {
 await embedded.waitReady
 for(const migration of (await readdir("prisma/migrations")).filter(name=>/^\d/.test(name)).sort()) {
  let legacy
  if(migration==="20261112000200_versiones_resultados") {
   const familyId=randomUUID(),publicationId=randomUUID(),mailId=randomUUID()
   const snapshot={nombreBebe:"Histórico ficticio",fechaNacimiento:"2026-01-01",profesional:"Profesional ficticia",evento:null,numero:null,fechaEvaluacion:now.toISOString(),medidas:{ap:140,bp:120,di:150,dd:130},indiceCraneal:85.71,indiceAsimetria:20,diagnostico:"Diagnóstico histórico ficticio",recomendacion:"Recomendación histórica ficticia"}
   await embedded.query(`INSERT INTO "Apoderado" (id,correo,"updatedAt") VALUES ($1,'migracion-versiones@example.com',CURRENT_TIMESTAMP)`,[familyId])
   await embedded.exec(`INSERT INTO "Paciente" (id,nombre,"fechaNacimiento") VALUES ('version-legacy-baby','Histórico ficticio','2026-01-01'); INSERT INTO "Evaluacion" (id,"pacienteId",anteroposterior,biparietal,"diagonalIzq","diagonalDer","indiceCraneal","indiceAsimetria",diagnostico,recomendacion,kinesiologa) VALUES ('version-legacy-eval','version-legacy-baby',140,120,150,130,85.71,20,'Histórico','Histórico','Profesional ficticia');`)
   await embedded.query(`INSERT INTO "ResultadoPublicado" (id,"evaluacionId","apoderadoId","publicadoPorId",revision,datos) VALUES ($1,'version-legacy-eval',$2,'autor-historico',1,$3::jsonb)`,[publicationId,familyId,JSON.stringify(snapshot)])
   await embedded.query(`INSERT INTO "CorreoResultado" (id,"publicacionId",destinatario,estado,"proveedorId","enviadoAt","updatedAt") VALUES ($1,$2,'migracion-versiones@example.com','ENVIADO','historico-ficticio',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,[mailId,publicationId])
   await embedded.query(`INSERT INTO "OrdenCorreo" (id,"publicacionId",etapa,estado,"claveIdempotencia","updatedAt") VALUES ($1,$2,'INICIAL','ACEPTADO','historico-ficticio',CURRENT_TIMESTAMP)`,[mailId,publicationId])
   legacy={publicationId,snapshot,pub:(await embedded.query(`SELECT to_jsonb(t) data FROM "ResultadoPublicado" t WHERE id=$1`,[publicationId])).rows[0].data,mail:(await embedded.query(`SELECT to_jsonb(t) data FROM "CorreoResultado" t WHERE id=$1`,[mailId])).rows[0].data}
  }
  await embedded.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,"utf8"))
  if(legacy) {
   assert.deepEqual((await embedded.query(`SELECT to_jsonb(t)-'estado'-'versionActual'-'revisionControl' data FROM "ResultadoPublicado" t WHERE id=$1`,[legacy.publicationId])).rows[0].data,legacy.pub)
   assert.deepEqual((await embedded.query(`SELECT to_jsonb(t) data FROM "CorreoResultado" t WHERE "publicacionId"=$1`,[legacy.publicationId])).rows[0].data,legacy.mail)
   const version=(await embedded.query(`SELECT * FROM "VersionResultado" WHERE "publicacionId"=$1`,[legacy.publicationId])).rows[0]
   assert.equal(version.numero,1);assert.deepEqual(version.datos,legacy.snapshot);assert.equal(version.actorId,"autor-historico")
   assert.equal((await embedded.query(`SELECT count(*)::int n FROM "OrdenCorreo" WHERE "publicacionId"=$1`,[legacy.publicationId])).rows[0].n,1)
   assert.equal((await embedded.query(`SELECT count(*)::int n FROM "CambioResultado"`)).rows[0].n,0)
   console.log("OK migración de versiones: conserva publicación, fecha, autor, correo aceptado y orden anterior; crea su copia inicial sin nuevos envíos.")
  }
 }
 await socket.start();gate=await protocolGate({host:"127.0.0.1",port:Number(socket.getServerConn().split(":").at(-1))})
 const adapter=()=>new PrismaPg({connectionString:`postgresql://postgres:postgres@127.0.0.1:${gate.port}/postgres?sslmode=disable`})
 db=new PrismaClient({adapter:adapter()});second=new PrismaClient({adapter:adapter()})
 const first=await fixture()
 assert.equal((await orders(first.publication.id)).length,3)
 assert((await orders(first.publication.id)).every(row=>row.estado==="BLOQUEADO"&&row.mensaje===null&&row.programadoAt===null))
 assert.equal((await processMailBatch(db,transport,options())).reclamados,0)
 await db.$transaction(tx=>draftMailPlan(tx,first.publication.id));assert.equal((await orders(first.publication.id)).length,3)
 await prepareMailPlan(db,first.publication.id,{plagiocefalia:"PENDIENTE",forma:"NORMAL"},policy,now)
 assert((await orders(first.publication.id)).every(row=>row.estado==="BLOQUEADO"))
 await prepareMailPlan(db,first.publication.id,mixed,policy,now)
 let jobs=await orders(first.publication.id);assert(jobs.every(row=>row.estado==="PENDIENTE"));assert.equal(jobs.find(row=>row.etapa==="MES").programadoAt.toISOString(),"2026-02-28T12:00:00.000Z")
 const parallel=await Promise.all([processMailBatch(db,transport,options(now,1)),processMailBatch(second,transport,options(now,1))])
 assert.equal(parallel.reduce((sum,row)=>sum+row.aceptados,0),1);assert.equal(sent.length,1)
 jobs=await orders(first.publication.id);const initial=jobs.find(row=>row.etapa==="INICIAL")
 assert.equal(initial.estado,"ACEPTADO");assert.equal(initial.entrega,"SIN_CONFIRMAR")
 assert.equal(sent[0].key,initial.claveIdempotencia)
 assert.equal((await db.correoResultado.findUnique({where:{publicacionId:first.publication.id}})).estado,"ENVIADO")
 // Retirada del seguimiento: el resultado inicial ya enviado se conserva, el semanal no sale.
 await db.autorizacionPrivacidad.update({where:{id:first.authorization.id},data:{seguimiento:false}})
 let result=await processMailBatch(db,transport,options(new Date("2026-02-08T12:00:00Z")))
 assert.equal(result.cancelados,1);assert.equal(sent.length,1)
 await clearReady()
 const skipped=await fixture();await prepareMailPlan(db,skipped.publication.id,normal,policy,now)
 assert((await orders(skipped.publication.id)).every(row=>row.estado==="OMITIDO"&&row.motivo==="CLASIFICACION_NORMAL"))
 const noConsent=await fixture({consent:false});await prepareMailPlan(db,noConsent.publication.id,mixed,policy,now);assert((await orders(noConsent.publication.id)).every(row=>row.motivo==="PRIVACIDAD"))
 const already=await fixture({legacySent:true});await prepareMailPlan(db,already.publication.id,mixed,policy,now);assert.equal((await orders(already.publication.id)).find(row=>row.etapa==="INICIAL").motivo,"ENVIO_INICIAL_EXISTENTE");await clearReady()
 console.log("OK planificación: tres etapas bloqueadas, sin aprobación implícita ni duplicación, caso mixto, normalidad explícita, calendario y consentimiento por finalidad.")
 const retry=await fixture();await prepareMailPlan(db,retry.publication.id,mixed,policy,now)
 const retryJob=(await orders(retry.publication.id)).find(row=>row.etapa==="INICIAL"), payload=JSON.stringify(retryJob.mensaje)
 const transient={...transport,async send(){throw new DeliveryFailure("TRANSITORIO")}}
 await processMailBatch(db,transient,options(now,1));let row=await db.ordenCorreo.findUnique({where:{id:retryJob.id}});assert.equal(row.estado,"PENDIENTE");assert.equal(row.intentos,1);assert.equal(row.disponibleAt.getTime(),now.getTime()+60000)
 assert.equal((await processMailBatch(db,transport,options(now,1))).reclamados,0)
 await processMailBatch(db,transport,options(new Date(now.getTime()+60000),1));row=await db.ordenCorreo.findUnique({where:{id:retryJob.id}})
 assert.equal(row.estado,"ACEPTADO");assert.equal(row.intentos,2);assert.equal(JSON.stringify(row.mensaje),payload);assert.equal(sent.at(-1).key,retryJob.claveIdempotencia)
 await clearReady()
 const unknown=await fixture();await prepareMailPlan(db,unknown.publication.id,mixed,policy,now)
 await processMailBatch(db,{...transport,async send(){throw new Error("timeout ficticio")}},options(now,1))
 assert.equal((await orders(unknown.publication.id)).find(row=>row.etapa==="INICIAL").estado,"REVISION");await clearReady()
 const limit=await fixture();await prepareMailPlan(db,limit.publication.id,mixed,policy,now)
 for(let attempt=0;attempt<5;attempt++)await processMailBatch(db,transient,options(new Date(now.getTime()+attempt*3600000),1))
 assert.equal((await orders(limit.publication.id)).find(row=>row.etapa==="INICIAL").estado,"AGOTADO");assert.equal((await db.intentoCorreo.count({where:{ordenId:(await orders(limit.publication.id)).find(row=>row.etapa==="INICIAL").id}})),5);await clearReady()
 const restart=await fixture();await prepareMailPlan(db,restart.publication.id,mixed,policy,now)
 const interrupted=(await orders(restart.publication.id)).find(row=>row.etapa==="INICIAL")
 await db.ordenCorreo.update({where:{id:interrupted.id},data:{estado:"ENVIANDO",proveedor:"simulado",intentos:1,primerIntentoAt:now,bloqueoToken:randomUUID(),bloqueoHasta:new Date(now.getTime()+LEASE_MS)}})
 await db.intentoCorreo.create({data:{ordenId:interrupted.id,numero:1}})
 await processMailBatch(db,{...transport,idempotencyWindowMs:0},options(new Date(now.getTime()+LEASE_MS+1),1))
 assert.equal((await db.ordenCorreo.findUnique({where:{id:interrupted.id}})).estado,"REVISION");await clearReady()
 console.log("OK trabajador: dos procesos sin duplicados, reintentos con espera y límite, contenido y clave estables, tiempo de espera desconocido e interrupción sin garantía pasan a revisión.")

 const recovered=await fixture();await prepareMailPlan(db,recovered.publication.id,mixed,policy,now)
 const recoveredJob=(await orders(recovered.publication.id)).find(row=>row.etapa==="INICIAL")
 await db.ordenCorreo.update({where:{id:recoveredJob.id},data:{estado:"ENVIANDO",proveedor:"simulado",intentos:1,primerIntentoAt:now,bloqueoToken:randomUUID(),bloqueoHasta:new Date(now.getTime()+LEASE_MS)}})
 await db.intentoCorreo.create({data:{ordenId:recoveredJob.id,numero:1}})
 let recoveredCalls=0
 await processMailBatch(db,{...transport,async send(message,key){assert.equal(key,recoveredJob.claveIdempotencia);assert.deepEqual(message,{...recoveredJob.mensaje,to:recoveredJob.destinatario});recoveredCalls++;return "aceptado-antes-interrupcion"}},options(new Date(now.getTime()+LEASE_MS+1),1))
 assert.equal(recoveredCalls,1);assert.equal((await db.ordenCorreo.findUnique({where:{id:recoveredJob.id}})).estado,"ACEPTADO")
 assert.equal((await db.intentoCorreo.findUnique({where:{ordenId_numero:{ordenId:recoveredJob.id,numero:1}}})).resultado,"INTERRUMPIDO")
 await clearReady()
 const revoked=await fixture();await prepareMailPlan(db,revoked.publication.id,mixed,policy,now)
 await db.apoderado.update({where:{id:revoked.family.id},data:{correo:"nuevo-"+revoked.family.correo}})
 const sentBefore=sent.length
 assert.equal((await processMailBatch(db,transport,options(now,1))).cancelados,1);assert.equal(sent.length,sentBefore);await clearReady()
 const legacyRace=await fixture();await prepareMailPlan(db,legacyRace.publication.id,mixed,policy,now)
 await db.correoResultado.update({where:{publicacionId:legacyRace.publication.id},data:{estado:"ENVIADO",enviadoAt:now,proveedorId:randomUUID()}})
 assert.equal((await processMailBatch(db,transport,options(now,1))).aceptados,1);assert.equal(sent.length,sentBefore);await clearReady()
 const stale=await fixture();await prepareMailPlan(db,stale.publication.id,mixed,policy,now)
 const staleJob=(await orders(stale.publication.id)).find(row=>row.etapa==="INICIAL"),foreignToken=randomUUID()
 const staleResult=await processMailBatch(db,{...transport,async send(){await db.ordenCorreo.update({where:{id:staleJob.id},data:{bloqueoToken:foreignToken}});return randomUUID()}},options(now,1))
 assert.equal(staleResult.aceptados,0);assert.equal((await db.ordenCorreo.findUnique({where:{id:staleJob.id}})).bloqueoToken,foreignToken)
 await db.ordenCorreo.update({where:{id:staleJob.id},data:{estado:"REVISION",bloqueoToken:null,bloqueoHasta:null}});await clearReady()
 console.log("OK recuperación: misma clave y contenido tras interrupción, cambios de destinatario bloqueados, correo inicial previo no repetido y respuestas de reservas antiguas descartadas.")


 const cancelled=await fixture();await prepareMailPlan(db,cancelled.publication.id,mixed,policy,now)
 const cancelledJob=(await orders(cancelled.publication.id)).find(row=>row.etapa==="INICIAL")
 const acceptedAfterCancel=await processMailBatch(db,{...transport,async send(){
   await db.$transaction(async tx=>{
     await tx.resultadoPublicado.update({where:{id:cancelled.publication.id},data:{estado:"RETIRADO",revisionControl:{increment:1}}})
     await tx.ordenCorreo.updateMany({where:{publicacionId:cancelled.publication.id,estado:{in:["PENDIENTE","ENVIANDO"]}},data:{estado:"CANCELADO",motivo:"VERSION_NO_VIGENTE",bloqueoToken:null,bloqueoHasta:null}})
   })
   return "aceptado-mientras-se-retiraba"
 }},options(now,1))
 assert.equal(acceptedAfterCancel.aceptados,0)
 const cancelledSaved=await db.ordenCorreo.findUnique({where:{id:cancelledJob.id}})
 assert.equal(cancelledSaved.estado,"CANCELADO");assert.equal(cancelledSaved.proveedorId,"aceptado-mientras-se-retiraba")
 assert.equal((await db.intentoCorreo.findUnique({where:{ordenId_numero:{ordenId:cancelledJob.id,numero:1}}})).resultado,"ACEPTADO_TRAS_CANCELACION")
 await assert.rejects(prepareMailPlan(db,cancelled.publication.id,mixed,policy,now))
 await clearReady()
 const staleVersion=await fixture();await prepareMailPlan(db,staleVersion.publication.id,mixed,policy,now)
 await db.versionResultado.create({data:{publicacionId:staleVersion.publication.id,numero:2,revisionEvaluacion:2,datos:staleVersion.publication.datos,motivo:"Nueva versión ficticia",actorId:"kine-ficticia",createdAt:now}})
 await db.resultadoPublicado.update({where:{id:staleVersion.publication.id},data:{versionActual:2,revisionControl:{increment:1}}})
 const previousSent=sent.length
 assert.equal((await processMailBatch(db,transport,options(now,1))).cancelados,1);assert.equal(sent.length,previousSent)
 await db.$transaction(tx=>draftMailPlan(tx,staleVersion.publication.id,2))
 const v2Jobs=(await orders(staleVersion.publication.id)).filter(row=>row.version===2)
 assert.equal(v2Jobs.length,3);assert(v2Jobs.every(row=>row.estado==="BLOQUEADO"))
 await clearReady()
 console.log("OK versiones y correo: retiro durante un envío conserva aceptación tardía sin reactivar la orden; versión reemplazada bloqueada y claves nuevas por versión.")

 // Notificación antes de aceptación, repeticiones y orden invertido de eventos.
 const delivery=await fixture();await prepareMailPlan(db,delivery.publication.id,mixed,policy,now)
 const earlyId=`early-${randomUUID()}`, event={provider:"simulado",id:randomUUID(),messageId:earlyId,type:"REBOTE",occurredAt:now}
 await recordDeliveryEvent(db,event,secret);await recordDeliveryEvent(db,event,secret)
 await processMailBatch(db,{...transport,async send(){return earlyId}},options(now,1))
 const delivered=(await orders(delivery.publication.id)).find(row=>row.etapa==="INICIAL")
 assert.equal(delivered.entrega,"REBOTE");assert((await orders(delivery.publication.id)).filter(row=>row.etapa!=="INICIAL").every(row=>row.estado==="CANCELADO"))
 await recordDeliveryEvent(db,{...event,id:randomUUID(),type:"ENTREGADO"},secret)
 assert.equal((await db.ordenCorreo.findUnique({where:{id:delivered.id}})).entrega,"REBOTE")
 await recordDeliveryEvent(db,{...event,id:randomUUID(),type:"QUEJA"},secret)
 assert.equal((await db.ordenCorreo.findUnique({where:{id:delivered.id}})).entrega,"QUEJA")
 await assert.rejects(recordDeliveryEvent(db,{...event,type:"ENTREGADO"},secret))
 assert.equal(await db.notificacionCorreo.count({where:{eventoId:event.id}}),1)
 await reconcileDeliveryEvents(db,secret)
 assert.equal(await db.notificacionCorreo.count({where:{aplicadaAt:null}}),0)
 console.log("OK notificaciones: buzón separado de aceptación, correlación temprana, deduplicación, conflicto rechazado, rebotes/quejas no se borran con entregas tardías y bloquean futuros correos.")
 const brevo=await fixture();await prepareMailPlan(db,brevo.publication.id,mixed,policy,now)
 const brevoId=`clinical-${randomUUID()}@brevo.test`,brevoEvent=type=>parseBrevoEvents({event:type,email:brevo.family.correo,"message-id":brevoId,id:99,ts_event:1769871600},secret)
 await recordBrevoEvents(db,brevoEvent("soft_bounce"),secret)
 await processMailBatch(db,{name:"brevo",idempotencyWindowMs:0,async send(){return `<${brevoId}>`}},options(now,1))
 const brevoOrder=(await orders(brevo.publication.id)).find(row=>row.etapa==="INICIAL")
 assert.equal(brevoOrder.entrega,"REBOTE_TEMPORAL")
 assert((await orders(brevo.publication.id)).some(row=>row.estado==="PENDIENTE"))
 await recordBrevoEvents(db,brevoEvent("hard_bounce"),secret)
 await recordBrevoEvents(db,brevoEvent("delivered"),secret)
 assert.equal((await db.ordenCorreo.findUniqueOrThrow({where:{id:brevoOrder.id}})).entrega,"REBOTE")
 assert((await orders(brevo.publication.id)).filter(row=>row.etapa!=="INICIAL").every(row=>row.estado==="CANCELADO"))
 console.log("OK adaptador clínico simulado: correlación temprana con ID canónico, rebote temporal no suprime, rebote definitivo cancela recordatorios y entrega tardía no lo revierte.")
 console.log("Pruebas de infraestructura completas. Solo base temporal y transporte ficticio; sin Brevo ni envíos reales.")
} finally {if(db)await db.$disconnect();if(second)await second.$disconnect();if(gate)await gate.close();await socket.stop();await embedded.close()}
