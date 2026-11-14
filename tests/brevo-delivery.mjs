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
  configuration={key:"brevo_local_test_only",sender:{email:"test@example.com",name:"Casku"},secret:randomBytes(32).toString("base64url"),baseUrl:`http://127.0.0.1:${server.address().port}`}
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
  const technical=JSON.stringify(await db.envioTransaccional.findMany())
  for(const value of [message.to,message.text,message.html,configuration.secret])assert(!technical.includes(value))
  assert.equal((await db.envioTransaccional.findUniqueOrThrow({where:{clave:"lost-save"}})).estado,"REVISION")
  console.log("OK recuperación segura: fallo tras aceptación pasa a revisión al vencer la reserva; registro sin cuerpos, códigos, enlaces ni correos.")
} catch(error){console.error(error);if(db)console.error(await db.envioTransaccional.findMany({select:{clave:true,estado:true,intentos:true,motivo:true,disponibleAt:true}}));failed=true}
finally {
  release?.();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
  await db?.$disconnect();await second?.$disconnect();await fixturePool?.end();await gate?.close();await socket?.stop();await embedded?.close()
}
if(failed)process.exitCode=1
