import assert from "node:assert/strict"
import {randomBytes,randomUUID,createHmac} from "node:crypto"
import {readFile,readdir} from "node:fs/promises"
import {setTimeout as pause} from "node:timers/promises"
import {PGlite} from "@electric-sql/pglite"
import {PGLiteSocketServer} from "@electric-sql/pglite-socket"
import {PrismaClient} from "@prisma/client"
import {PrismaPg} from "@prisma/adapter-pg"
import {protocolGate} from "./pglite-protocol-gate.mjs"
import {realPostgresFixture} from "./real-postgres-fixture.mjs"
import {enqueueRecoveryRequest,processRecoveryBatch,cleanRecoveryQueue} from "../src/lib/team-passwords/recovery-queue.ts"
import {recoveryAddressHash} from "../src/lib/team-passwords/queue-crypto.ts"
import {MailUnavailable} from "../src/lib/mail/brevo.ts"
const real=process.argv.includes("--postgres"),embedded=real?null:new PGlite(),key=randomBytes(32),authKey=randomBytes(32)
let raw=embedded,fixturePool,socket,gate,db,second,url,release
const accountId=randomUUID(),email="recovery-worker@example.com",mails=[]
const hash=value=>createHmac("sha256",authKey).update(value).digest("hex")
const options={key,origin:"http://localhost:3120",hash,limit:1,deliver:async(to,link,id)=>{mails.push({to,link,id});return `<${id}@brevo.test>`}}
const enqueue=async(address=email)=>{await enqueueRecoveryRequest(db,address,key);return db.solicitudRecuperacion.findFirstOrThrow({where:{destinatarioHash:recoveryAddressHash(address,key)},orderBy:{orden:"desc"}})}
const run=(changes={},client=db)=>processRecoveryBatch(client,{...options,...changes})
const token=()=>mails.at(-1).link.split("#token=")[1]
const challenge=()=>db.recuperacionClave.findUniqueOrThrow({where:{tokenHash:hash(`team-recovery:${token()}`)}})
try {
 if(real){const fixture=await realPostgresFixture();raw=fixture.db;fixturePool=fixture.pool;url=fixture.url}else await embedded.waitReady
 for(const migration of (await readdir("prisma/migrations")).filter(name=>/^\d/.test(name)).sort())await raw.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,"utf8"))
 if(!real){socket=new PGLiteSocketServer({db:embedded,host:"127.0.0.1",port:0,maxConnections:20});await socket.start();gate=await protocolGate({host:"127.0.0.1",port:Number(socket.getServerConn().split(":").at(-1))});url=`postgresql://postgres:postgres@127.0.0.1:${gate.port}/postgres?sslmode=disable`}
 db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});second=new PrismaClient({adapter:new PrismaPg({connectionString:url})})
 await db.cuentaEquipo.create({data:{id:accountId,email,name:"Equipo ficticio",role:"RECEPCION",passwordHash:"hash-ficticio",active:true}})
 const known=await enqueue(),unknown=await enqueue("missing-worker@example.com")
 assert.equal(known.estado,unknown.estado);assert(known.correoCifrado);assert(unknown.correoCifrado)
 assert.equal(mails.length,0);assert.equal(await db.recuperacionClave.count(),0)
 let held=false
 const pending=run({deliver:async(...args)=>{held=true;await new Promise(resolve=>{release=resolve});return options.deliver(...args)}});pending.catch(()=>{})
 for(const start=Date.now();!held&&Date.now()-start<20000;)await pause(20)
 assert(held)
 // Otro proceso omite la cuenta inexistente y jamás reclama el envío reservado.
 const skipped=await run({},second);assert.equal(skipped.omitidas,1);assert.equal(mails.length,0)
 const intakeWhileHeld=await enqueue("while-provider-waits@example.com");assert.equal(intakeWhileHeld.estado,"PENDIENTE")
 release();assert.equal((await pending).enviadas,1);await run()
 const active=await challenge();assert.equal(active.estado,"ACTIVA")
 assert.equal((await db.solicitudRecuperacion.findUniqueOrThrow({where:{id:known.id}})).correoCifrado,null)
 assert.equal((await db.solicitudRecuperacion.findUniqueOrThrow({where:{id:unknown.id}})).correoCifrado,null)
 console.log("OK cola: solicitud uniforme sin consultar cuentas ni enviar; dos clientes, proveedor retenido, nuevas solicitudes independientes y reserva única.")
 await enqueue();assert.equal((await run({deliver:async()=>{throw new MailUnavailable("TRANSITORIO")}})).fallidas,1)
 assert.equal((await db.recuperacionClave.findUniqueOrThrow({where:{id:active.id}})).estado,"ACTIVA")
 await enqueue();assert.equal((await run({deliver:async()=>{throw new MailUnavailable("INCIERTO")}})).revision,1)
 assert.equal((await db.recuperacionClave.findUniqueOrThrow({where:{id:active.id}})).estado,"ACTIVA")
 const expired=await enqueue();await db.$executeRaw`UPDATE "SolicitudRecuperacion" SET "expiraAt"=CURRENT_TIMESTAMP-interval '1 second' WHERE id=${expired.id}::uuid`
 const before=mails.length;await run();assert.equal(mails.length,before);assert.equal((await db.solicitudRecuperacion.findUniqueOrThrow({where:{id:expired.id}})).motivo,"VENCIDA")
 const corrupt=await enqueue();await db.solicitudRecuperacion.update({where:{id:corrupt.id},data:{correoCifrado:"manipulado"}});assert.equal((await run()).fallidas,1);assert.equal(mails.length,before)
 await enqueue();await db.cuentaEquipo.update({where:{id:accountId},data:{active:false}});assert.equal((await run()).omitidas,1);assert.equal(mails.length,before)
 await db.cuentaEquipo.update({where:{id:accountId},data:{active:true}})
 console.log("OK fallos: rechazo, aceptación incierta, solicitud vencida/cifrado manipulado/cuenta desactivada no invalidan el enlace anterior ni reenvían.")
 // La antigüedad depende de la solicitud, no del orden de respuesta de Brevo.
 const older=await enqueue();let oldEntered=false
 const oldRun=run({deliver:async(...args)=>{oldEntered=true;await new Promise(resolve=>{release=resolve});return options.deliver(...args)}});oldRun.catch(()=>{})
 for(const start=Date.now();!oldEntered&&Date.now()-start<20000;)await pause(20)
 assert(oldEntered);await enqueue();await run({},second)
 const newer=await challenge();release();await oldRun
 assert.equal((await db.recuperacionClave.findUniqueOrThrow({where:{id:newer.id}})).estado,"ACTIVA")
 assert.equal((await db.solicitudRecuperacion.findUniqueOrThrow({where:{id:older.id}})).estado,"OMITIDO")
 assert.equal((await db.recuperacionClave.findUniqueOrThrow({where:{id:active.id}})).estado,"ANULADA")
 // Una caída después de reservar no desencadena un segundo envío.
 const abandoned=await enqueue();await db.$executeRaw`UPDATE "SolicitudRecuperacion" SET estado='ENVIANDO',"bloqueoToken"=${randomUUID()}::uuid,"bloqueoHasta"=CURRENT_TIMESTAMP-interval '1 minute' WHERE id=${abandoned.id}::uuid`
 const sentBefore=mails.length;await run();assert.equal(mails.length,sentBefore)
 assert.equal((await db.solicitudRecuperacion.findUniqueOrThrow({where:{id:abandoned.id}})).estado,"REVISION")
 const versioned=await enqueue();await run({deliver:async(...args)=>{await db.cuentaEquipo.update({where:{id:accountId},data:{version:{increment:1}}});return options.deliver(...args)}})
 assert.equal((await db.solicitudRecuperacion.findUniqueOrThrow({where:{id:versioned.id}})).estado,"OMITIDO")
 console.log("OK carreras: respuesta vieja no reemplaza enlace nuevo, bloqueo vencido va a revisión y cambio de cuenta durante envío impide activación.")
 // Limpieza acotada en SQL, incluso con más pendientes que el tamaño del lote.
 await db.$executeRaw`INSERT INTO "SolicitudRecuperacion" (id,"destinatarioHash","correoCifrado","expiraAt") SELECT gen_random_uuid(),'fixture-expired-'||n,'cifrado-vencido',CURRENT_TIMESTAMP-interval '1 minute' FROM generate_series(1,101) n`
 await cleanRecoveryQueue(db)
 assert.equal(await db.solicitudRecuperacion.count({where:{destinatarioHash:{startsWith:"fixture-expired-"},estado:"PENDIENTE"}}),1)
 await cleanRecoveryQueue(db)
 assert.equal(await db.solicitudRecuperacion.count({where:{estado:"PENDIENTE"}}),0)
 console.log("OK mantenimiento: más de cien solicitudes vencidas se limpian por lotes sin proveedor y sin invalidar enlaces activos.")
 const audit=JSON.stringify(await db.solicitudRecuperacion.findMany(),(_,value)=>typeof value==="bigint"?String(value):value)
 for(const secret of [email,key.toString("base64url"),...mails.map(mail=>mail.link),...mails.map(mail=>mail.link.split("#token=")[1])])assert(!audit.includes(secret))
 assert((await db.solicitudRecuperacion.findMany()).every(row=>row.correoCifrado===null))
 console.log("OK privacidad: cifrado temporal eliminado al terminar, solo hash de token, ninguna URL/token/correo en cola o respuestas.")
} finally {release?.();await db?.$disconnect();await second?.$disconnect();await fixturePool?.end();await gate?.close();await socket?.stop();await embedded?.close()}
