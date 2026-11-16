import assert from "node:assert/strict"
import {createServer} from "node:http"
import {spawn} from "node:child_process"
import {randomBytes,randomUUID} from "node:crypto"
import {readFile,readdir} from "node:fs/promises"
import {setTimeout as pause} from "node:timers/promises"
import {PGlite} from "@electric-sql/pglite"
import {PGLiteSocketServer} from "@electric-sql/pglite-socket"
import {protocolGate} from "../tests/pglite-protocol-gate.mjs"
const check=process.argv.includes("--check"),email="apoderado@example.com",port=check?3127:Number(process.env.CASKU_FAMILY_DEMO_PORT||3125)
assert(Number.isInteger(port)&&port>=1024&&port<=65534,"Puerto de prueba inválido")
const base=`http://127.0.0.1:${port}`,secret=()=>randomBytes(32).toString("base64url"),messages=[],accepted=new Map()
const escape=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char])
let child,socket,gate,stopping=false,exited=false,failed=false,logs=""
const db=new PGlite()
const mailbox=createServer(async(request,response)=>{
 response.setHeader("Cache-Control","no-store")
 if(request.method==="GET"&&request.url==="/"){
  response.setHeader("Content-Type","text/html; charset=utf-8")
  response.end(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Buzón de prueba · Casku</title><style>body{font:16px/1.6 system-ui;max-width:750px;margin:36px auto;padding:0 20px;color:#14383e;background:#f7fbfb}article{background:white;padding:20px;border:1px solid #bdd8d8;border-radius:14px;margin:18px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}a,button{color:#075b66}button{padding:12px}</style><h1>Buzón simulado de Casku</h1><p>Solo pruebas locales: <strong>${email}</strong>. No se envían correos reales.</p><p><a href="${base}/login?portal=familias" target="_blank" rel="noopener">Abrir acceso de apoderado</a> · <a href="/">Actualizar buzón</a></p>${messages.length?messages.slice().reverse().map(message=>`<article><h2>${escape(message.subject)}</h2><pre>${escape(message.textContent)}</pre></article>`).join(""):"<p>Solicita el código en el portal y después actualiza este buzón.</p>"}</html>`)
  return
 }
 if(request.method!=="POST"||request.url!=="/v3/smtp/email"||request.headers["api-key"]!=="brevo_local_test_only"){response.writeHead(404);response.end();return}
 try{
  let size=0;const chunks=[]
  for await(const chunk of request){size+=chunk.length;if(size>1_000_000)throw new Error();chunks.push(chunk)}
  const message=JSON.parse(Buffer.concat(chunks).toString())
  if(message.sender?.email!=="test@example.com"||message.to?.length!==1||message.to[0].email!==email||typeof message.textContent!=="string"||typeof message.subject!=="string")throw new Error()
  const key=message.headers?.idempotencyKey;if(typeof key!=="string")throw new Error()
  if(!accepted.has(key)){accepted.set(key,`<demo-${randomUUID()}@brevo.test>`);messages.push(message);if(messages.length>30)messages.shift();console.log(`Correo simulado recibido: ${message.subject}`)}
  response.writeHead(201,{"Content-Type":"application/json"});response.end(JSON.stringify({messageId:accepted.get(key)}))
 }catch{response.writeHead(400,{"Content-Type":"application/json"});response.end(JSON.stringify({code:"invalid_parameter"}))}
})
async function stop(){if(stopping)return;stopping=true;if(child&&!exited){child.kill("SIGTERM");await Promise.race([new Promise(resolve=>child.once("exit",resolve)),pause(5000)])}mailbox.closeAllConnections();await new Promise(resolve=>mailbox.close(resolve));await gate?.close();await socket?.stop();await db.close()}
process.on("SIGINT",()=>{void stop()});process.on("SIGTERM",()=>{void stop()})
try{
 await db.waitReady
 for(const migration of (await readdir("prisma/migrations")).filter(name=>/^\d/.test(name)).sort())await db.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,"utf8"))
 await db.query(`INSERT INTO "Apoderado" (id,correo,nombre,"updatedAt") VALUES ($1,$2,'Apoderado de prueba',CURRENT_TIMESTAMP)`,[randomUUID(),email])
 await db.query(`INSERT INTO "Evento" (id,nombre,fecha,lugar,cupos,"creadoPorId","inscripcionesAbiertas","updatedAt") VALUES ($1,'Evento de prueba local',CURRENT_DATE+7,'Demostración local',20,'demo-local',true,CURRENT_TIMESTAMP)`,[randomUUID()])
 socket=new PGLiteSocketServer({db,host:"127.0.0.1",port:0,maxConnections:20});await socket.start();gate=await protocolGate({host:"127.0.0.1",port:Number(socket.getServerConn().split(":").at(-1))})
 await new Promise((resolve,reject)=>{mailbox.once("error",reject);mailbox.listen(check?0:port+1,"127.0.0.1",resolve)})
 const mailboxUrl=`http://127.0.0.1:${mailbox.address().port}`
 child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port",String(port)],{stdio:["ignore","pipe","pipe"],env:{...process.env,NODE_ENV:"development",CASKU_TEST_MODE:"1",CASKU_TEST_INSTANCE:"secondary",CASKU_PRODUCTION_TEST:"0",NODE_DISABLE_COMPILE_CACHE:"1",DATABASE_URL:`postgresql://postgres:postgres@127.0.0.1:${gate.port}/postgres?sslmode=disable`,AUTH_URL:base,NEXTAUTH_URL:base,AUTH_SECRET:secret(),NEXTAUTH_SECRET:secret(),AUTH_TRUST_HOST:"true",CASKU_TEAM_ACCOUNTS:"[]",BREVO_API_KEY:"brevo_local_test_only",BREVO_SENDER_EMAIL:"test@example.com",BREVO_SENDER_NAME:"Casku de prueba",BREVO_SENDER_VERIFIED:"1",CASKU_MAIL_ENABLED:"1",CASKU_MAIL_DELIVERY_SECRET:secret(),CASKU_MAIL_SUPPRESSION_SECRET:secret(),CASKU_TEST_MAIL_URL:mailboxUrl,CASKU_MAIL_AUTOMATION:"0",CASKU_MAIL_WORKER_SECRET:"",BREVO_WEBHOOK_ENABLED:"0",BREVO_WEBHOOK_SECRET:"",CASKU_PASSWORD_RECOVERY_ENABLED:"0",CASKU_PASSWORD_RECOVERY_QUEUE_KEY:"",CASKU_PASSWORD_RECOVERY_WORKER_SECRET:""}})
 child.stdout.on("data",data=>{logs=(logs+data).slice(-6000)});child.stderr.on("data",data=>{logs=(logs+data).slice(-6000)});child.on("exit",()=>{exited=true})
 let ready=false
 for(const started=Date.now();Date.now()-started<180000;){if(exited)throw new Error("No inició el servidor de prueba");try{if((await fetch(`${base}/api/auth/csrf`,{signal:AbortSignal.timeout(2000)})).ok){ready=true;break}}catch{}await pause(200)}
 if(!ready)throw new Error("El servidor no respondió")
 console.log(`\nCorreo de prueba: ${email}\nAcceso: ${base}/login?portal=familias\nBuzón simulado: ${mailboxUrl}\nSin contraseña: solicita el código y cópialo del buzón.\nBase temporal; se descarta al detener con Ctrl+C. No ejecutar otras pruebas mientras esta demo esté abierta.\n`)
 if(check){
  const cookies=new Map()
  async function request(path,init={}){const response=await fetch(base+path,{...init,headers:{...init.headers,cookie:[...cookies].map(([name,value])=>`${name}=${value}`).join("; ")}});for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(";")[0],i=pair.indexOf("=");cookies.set(pair.slice(0,i),pair.slice(i+1))}return response}
  const response=await request("/api/familias/acceso",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({correo:email})});assert.equal(response.status,200)
  const challenge=await response.json(),code=messages.at(-1).textContent.match(/es (\d{6})\./)[1]
  const csrf=await(await request("/api/auth/csrf")).json()
  await request("/api/auth/callback/familias",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","X-Auth-Return-Redirect":"1",origin:base},body:new URLSearchParams({csrfToken:csrf.csrfToken,...challenge,codigo:code,callbackUrl:base+"/familias"})})
  const session=await(await request("/api/auth/session")).json();assert.equal(session.user.role,"APODERADO");assert.equal(session.user.email,email)
  const inbox=await(await fetch(mailboxUrl)).text();assert(inbox.includes(code));assert.equal((await request("/familias")).status,200)
  assert.equal((await request("/api/administracion/correos/mensajes")).status,401)
  console.log("OK demo: código real del simulador, sesión de apoderado y permisos conservados; sin base ni correo reales.")
 }else await new Promise(resolve=>child.once("exit",resolve))
}catch(error){console.error("No se pudo preparar la prueba local:",error instanceof Error?error.message:"Error");if(logs)console.error(logs);failed=true}
finally{await stop()}

if(failed)process.exitCode=1
