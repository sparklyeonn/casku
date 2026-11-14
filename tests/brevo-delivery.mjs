import assert from "node:assert/strict"
import { createServer } from "node:http"
import { randomBytes,randomUUID } from "node:crypto"
import { readFile,readdir } from "node:fs/promises"
import { setTimeout as pause } from "node:timers/promises"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { protocolGate } from "./pglite-protocol-gate.mjs"
import { realPostgresFixture } from "./real-postgres-fixture.mjs"
import { deliverOnce } from "../src/lib/mail/delivery-store.ts"
import { recordBrevoEvents } from "../src/lib/mail/webhook-store.ts"
import { parseBrevoEvents, recipientKey } from "../src/lib/mail/webhook-policy.ts"
import { MailUnavailable } from "../src/lib/mail/brevo.ts"
const real=process.argv.includes("--postgres"), embedded=real?null:new PGlite()
let raw=embedded,fixturePool,socket,gate,db,second,url,failed=false,behavior="accept",release
const calls=[]
const server=createServer(async(request,response)=>{
  const chunks=[];for await(const chunk of request)chunks.push(chunk)
  const payload=JSON.parse(Buffer.concat(chunks).toString());calls.push(payload)
  assert.equal(request.url,"/v3/smtp/email");assert.equal(request.headers["api-key"],"brevo_local_test_only")
  if(behavior==="hold")await new Promise(resolve=>{release=resolve})
  if(behavior==="drop"){request.socket.destroy();return}
  response.setHeader("Content-Type","application/json")
  if(behavior==="retry"){response.writeHead(429,{"Retry-After":"0"});response.end(JSON.stringify({code:"too_many_requests"}));return}
  if(behavior==="duplicate"){response.writeHead(400);response.end(JSON.stringify({code:"duplicate_parameter"}));return}
  if(behavior==="invalid"){response.writeHead(400);response.end(JSON.stringify({code:"invalid_parameter"}));return}
  if(behavior==="server"){response.writeHead(503);response.end(JSON.stringify({code:"internal_error"}));return}
  response.writeHead(201);response.end(JSON.stringify({messageId:`<ficticio-${calls.length}@brevo.test>`}))
})
const message={to:"familia@example.com",subject:"Prueba de entrega",text:"Código ficticio 123456",html:"<p>Código ficticio 123456</p>"}
const send=(key,client=db,changes={})=>deliverOnce(client,{...message,...changes},key,"CONFIRMACION",configuration)
const rejectKind=kind=>error=>error instanceof MailUnavailable&&error.kind===kind
let configuration
const webhook = (id,event="delivered",email=message.to) => parseBrevoEvents({event,id:7,email,"message-id":id,ts_event:1794614400},configuration.suppressionSecret)
try {
  if(real){const fixture=await realPostgresFixture();raw=fixture.db;fixturePool=fixture.pool;url=fixture.url}else await embedded.waitReady
  const legacyId=randomUUID(),eventId=randomUUID(),parentId=randomUUID(),inscriptionId=randomUUID()
  let before
  for(const migration of (await readdir("prisma/migrations")).filter(name=>/^\d/.test(name)).sort()) {
    if(migration==="20261114000100_brevo_transaccional") {
      await raw.query(`INSERT INTO "Apoderado" (id,correo,nombre,"updatedAt") VALUES ($1,'legacy-brevo@example.com','Familia ficticia',CURRENT_TIMESTAMP)`,[parentId])
      await raw.query(`INSERT INTO "Paciente" (id,nombre,"fechaNacimiento","apoderadoId") VALUES ('brevo-legacy-baby','Bebé ficticio','2026-01-01',$1)`,[parentId])
      await raw.query(`INSERT INTO "Evento" (id,nombre,fecha,lugar,cupos,"creadoPorId","updatedAt") VALUES ($1,'Evento ficticio','2026-12-01','Prueba',5,'fixture',CURRENT_TIMESTAMP)`,[eventId])
      await raw.query(`INSERT INTO "Inscripcion" (id,"solicitudHash","eventoId","pacienteId","apoderadoId",numero,"qrToken") VALUES ($1,'fixture',$2,'brevo-legacy-baby',$3,1,'qr-ficticio')`,[inscriptionId,eventId,parentId])
      await raw.query(`INSERT INTO "CorreoInscripcion" (id,"inscripcionId",estado,intentos,"revisionContenido","updatedAt") VALUES ($1,$2,'FALLIDO',1,2,CURRENT_TIMESTAMP)`,[legacyId,inscriptionId])
      before=(await raw.query(`SELECT to_jsonb(t) data FROM "CorreoInscripcion" t WHERE id=$1`,[legacyId])).rows[0].data
    }
    await raw.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,"utf8"))
  }
  assert.deepEqual((await raw.query('SELECT to_jsonb(t) data FROM "CorreoInscripcion" t WHERE id=$1',[legacyId])).rows[0].data,before)
  if(!real){socket=new PGLiteSocketServer({db:embedded,host:"127.0.0.1",port:0,maxConnections:20});await socket.start();gate=await protocolGate({host:"127.0.0.1",port:Number(socket.getServerConn().split(":").at(-1))});url=`postgresql://postgres:postgres@127.0.0.1:${gate.port}/postgres?sslmode=disable`}
  db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});second=new PrismaClient({adapter:new PrismaPg({connectionString:url})})
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
  configuration={key:"brevo_local_test_only",sender:{email:"test@example.com",name:"Casku"},secret:randomBytes(32).toString("base64url"),suppressionSecret:randomBytes(32).toString("base64url"),baseUrl:`http://127.0.0.1:${server.address().port}`}
  await assert.rejects(send(`registration-${legacyId}-revision-2`),rejectKind("INCIERTO"));assert.equal(calls.length,0)
  assert.equal((await db.envioTransaccional.findUniqueOrThrow({where:{clave:`registration-${legacyId}-revision-2`}})).motivo,"PROVEEDOR_ANTERIOR")
  console.log("OK migración Brevo: conserva el correo anterior y bloquea reintentos inciertos del proveedor anterior.")
  behavior="hold";const pending=send("concurrent");pending.catch(()=>{})
  for(const start=Date.now();!release&&Date.now()-start<15000;)await pause(20)
  assert(release);await assert.rejects(send("concurrent",second),rejectKind("TRANSITORIO"));assert.equal(calls.length,1)
  release();const accepted=await pending;behavior="accept"
  assert.equal(await send("concurrent",second),accepted);assert.equal(calls.length,1)
  await assert.rejects(send("concurrent",db,{to:"otra@example.com"}),rejectKind("PERMANENTE"));assert.equal(calls.length,1)
  console.log("OK entrega: dos clientes, una aceptación, reintentos sin POST adicional y cambio de destinatario bloqueado.")
  behavior="retry";await assert.rejects(send("retry"),rejectKind("TRANSITORIO"));const retryBody=calls.at(-1)
  await db.$executeRaw`UPDATE "EnvioTransaccional" SET "disponibleAt"=CURRENT_TIMESTAMP-interval '1 minute' WHERE clave='retry'`
  behavior="accept";await send("retry");assert.deepEqual(calls.at(-1),retryBody)
  for(const mode of ["duplicate","invalid","server","drop"]){
    behavior=mode;const initial=calls.length
    await assert.rejects(send(mode),rejectKind(mode==="invalid"?"PERMANENTE":"INCIERTO"))
    behavior="accept";await assert.rejects(send(mode),MailUnavailable);assert.equal(calls.length,initial+1)
    assert.equal((await db.envioTransaccional.findUniqueOrThrow({where:{clave:mode}})).estado,mode==="invalid"?"RECHAZADO":"REVISION")
  }
  console.log("OK fallos Brevo: 429 recuperable con misma clave/contenido; duplicado, 5xx y respuesta perdida no se repiten a ciegas.")
  await raw.exec(`CREATE FUNCTION brevo_accept_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.estado='ACEPTADO' THEN RAISE EXCEPTION 'fallo ficticio'; END IF; RETURN NEW; END $$; CREATE TRIGGER brevo_accept_fail_trigger BEFORE UPDATE ON "EnvioTransaccional" FOR EACH ROW EXECUTE FUNCTION brevo_accept_fail();`)
  const previous=calls.length;await assert.rejects(send("lost-save"))
  await raw.exec('DROP TRIGGER brevo_accept_fail_trigger ON "EnvioTransaccional"; DROP FUNCTION brevo_accept_fail();')
  await db.$executeRaw`UPDATE "EnvioTransaccional" SET "bloqueoHasta"=CURRENT_TIMESTAMP-interval '3 days' WHERE clave='lost-save'`
  await assert.rejects(send("lost-save"),rejectKind("INCIERTO"));assert.equal(calls.length,previous+1)
  // Guardar una notificación antes de la aceptación y probar ambos clientes a la vez.
  const earlyId=`ficticio-${calls.length+1}@brevo.test`
  await recordBrevoEvents(db,webhook(earlyId),configuration.suppressionSecret)
  assert.equal((await db.notificacionCorreo.findFirstOrThrow({where:{mensajeId:earlyId}})).aplicadaEnvioAt,null)
  const earlyAccepted=await send("early")
  assert.equal(earlyAccepted,`<${earlyId}>`)
  assert.equal((await db.envioTransaccional.findUniqueOrThrow({where:{clave:"early"}})).entrega,"ENTREGADO")
  const n=await db.notificacionCorreo.count()
  await Promise.all([recordBrevoEvents(db,webhook(earlyId),configuration.suppressionSecret),recordBrevoEvents(second,webhook(`<${earlyId}>`),configuration.suppressionSecret)])
  assert.equal(await db.notificacionCorreo.count(),n)
  await recordBrevoEvents(db,webhook(earlyId,"soft_bounce"),configuration.suppressionSecret)
  assert.equal((await db.envioTransaccional.findUniqueOrThrow({where:{clave:"early"}})).entrega,"ENTREGADO")
  assert.equal(await db.supresionCorreo.count(),0)
  await recordBrevoEvents(db,webhook(earlyId,"spam","otra@example.com"),configuration.suppressionSecret)
  assert.equal(await db.supresionCorreo.count(),0)
  await recordBrevoEvents(db,webhook("externo@brevo.test","spam"),configuration.suppressionSecret)
  assert.equal(await db.supresionCorreo.count(),0)
  await recordBrevoEvents(db,webhook(earlyId,"hard_bounce"),configuration.suppressionSecret)
  await recordBrevoEvents(db,[...webhook(earlyId,"spam"),...webhook(earlyId)],configuration.suppressionSecret)
  assert.equal((await db.envioTransaccional.findUniqueOrThrow({where:{clave:"early"}})).entrega,"QUEJA")
  assert.equal((await db.envioTransaccional.findUniqueOrThrow({where:{clave:"early"}})).estado,"ACEPTADO")
  await recordBrevoEvents(db,webhook(accepted,"hard_bounce"),configuration.suppressionSecret)
  const suppression=await db.supresionCorreo.findUniqueOrThrow({where:{clave:recipientKey(message.to,configuration.suppressionSecret)}})
  assert.equal(suppression.motivo,"QUEJA")
  const beforeBlocked=calls.length
  for(const purpose of ["ACCESO","CONFIRMACION","RECUPERACION"])await assert.rejects(deliverOnce(db,message,`suppressed-${purpose}`,purpose,configuration),rejectKind("PERMANENTE"))
  assert.equal(calls.length,beforeBlocked)
  assert.equal(await send("early"),earlyAccepted);assert.equal(calls.length,beforeBlocked)
  console.log("OK webhooks: evento temprano, deduplicación concurrente, IDs con/sin corchetes, destinatario protegido, rebote temporal sin supresión y queja definitiva sin reenviar.")
  // La persistencia de eventos y su aplicación es atómica ante fallos.
  if(real)await raw.exec(`CREATE FUNCTION webhook_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entrega='QUEJA' THEN RAISE EXCEPTION 'fallo ficticio'; END IF; RETURN NEW; END $$; CREATE TRIGGER webhook_fail_trigger BEFORE UPDATE ON "EnvioTransaccional" FOR EACH ROW EXECUTE FUNCTION webhook_fail();`)
  const rollbackEvent=parseBrevoEvents({event:"spam",email:message.to,"message-id":earlyId,ts_event:1794614401},configuration.suppressionSecret)
  const beforeFail=await db.notificacionCorreo.count()
  const failing=real?db:{$transaction:fn=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,property){if(property==="envioTransaccional")return new Proxy(target.envioTransaccional,{get(model,method){if(method==="update")return async()=>{throw new Error("Fallo de escritura ficticio")};return Reflect.get(model,method)}});return Reflect.get(target,property)}})))}
  await assert.rejects(recordBrevoEvents(failing,rollbackEvent,configuration.suppressionSecret))
  assert.equal(await db.notificacionCorreo.count(),beforeFail)
  if(real)await raw.exec('DROP TRIGGER webhook_fail_trigger ON "EnvioTransaccional"; DROP FUNCTION webhook_fail();')
  await recordBrevoEvents(db,rollbackEvent,configuration.suppressionSecret)
  assert.equal(await db.notificacionCorreo.count(),beforeFail+1)
  const technical=JSON.stringify({mail:await db.envioTransaccional.findMany(),events:await db.notificacionCorreo.findMany(),suppression:await db.supresionCorreo.findMany()})
  for(const value of [message.to,message.text,message.html,configuration.secret])assert(!technical.includes(value))
  assert.equal((await db.envioTransaccional.findUniqueOrThrow({where:{clave:"lost-save"}})).estado,"REVISION")
  console.log("OK recuperación segura: fallo tras aceptación pasa a revisión al vencer la reserva; registro sin cuerpos, códigos, enlaces ni correos.")
} catch(error){console.error(error);if(db)console.error(await db.envioTransaccional.findMany({select:{clave:true,estado:true,intentos:true,motivo:true,disponibleAt:true}}));failed=true}
finally {
  release?.();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
  await db?.$disconnect();await second?.$disconnect();await fixturePool?.end();await gate?.close();await socket?.stop();await embedded?.close()
}
if(failed)process.exitCode=1
