import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {readFile,readdir} from "node:fs/promises"
import {PGlite} from "@electric-sql/pglite"
import {PGLiteSocketServer} from "@electric-sql/pglite-socket"
import {PrismaClient} from "@prisma/client"
import {PrismaPg} from "@prisma/adapter-pg"
import {protocolGate} from "./pglite-protocol-gate.mjs"
import {realPostgresFixture} from "./real-postgres-fixture.mjs"
import {listAdminMail,adminMailDetail,actOnAdminMail} from "../src/lib/mail-admin/store.ts"
import {cleanRecoveryQueue} from "../src/lib/team-passwords/recovery-queue.ts"
import {mailAction,mailFilters,MailAdminError} from "../src/lib/mail-admin/input.ts"
const real=process.argv.includes("--postgres"),embedded=real?null:new PGlite()
let raw=embedded,fixturePool,socket,gate,db,second,url
const adminId=randomUUID(),sessionId=randomUUID(),actor={id:adminId,version:1,sessionId},options={canRetry:false}
const filters=(value="")=>mailFilters(new URLSearchParams(value))
const command=(row,accion="REVISAR",extra={})=>mailAction({id:randomUUID(),accion,motivo:"REVISION_PROVEEDOR",revision:row.revision,huella:row.huella,confirmado:true,...extra})
try {
 if(real){const fixture=await realPostgresFixture();raw=fixture.db;fixturePool=fixture.pool;url=fixture.url}else await embedded.waitReady
 for(const migration of (await readdir("prisma/migrations")).filter(name=>/^\d/.test(name)).sort())await raw.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,"utf8"))
 if(!real){socket=new PGLiteSocketServer({db:embedded,host:"127.0.0.1",port:0,maxConnections:20});await socket.start();gate=await protocolGate({host:"127.0.0.1",port:Number(socket.getServerConn().split(":").at(-1))});url=`postgresql://postgres:postgres@127.0.0.1:${gate.port}/postgres?sslmode=disable`}
 db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});second=new PrismaClient({adapter:new PrismaPg({connectionString:url})})
 await db.cuentaEquipo.create({data:{id:adminId,email:"admin-mail@example.com",name:"Administración ficticia",role:"ADMIN",passwordHash:"hash-ficticio",active:true}})
 await db.$executeRaw`INSERT INTO "SesionEquipo" (id,"cuentaId","secretoHash",version,"expiraAt") VALUES (${sessionId}::uuid,${adminId},${randomUUID()},1,CURRENT_TIMESTAMP+interval '8 hours')`
 const family=await db.apoderado.create({data:{correo:"privado-mail@example.com",nombre:"FAMILIA_PRIVADA"}})
 const baby=await db.paciente.create({data:{nombre:"BEBE_PRIVADO",fechaNacimiento:new Date("2026-01-01"),apoderadoId:family.id}})
 const event=await db.evento.create({data:{nombre:"Evento ficticio",fecha:new Date("2026-12-01"),lugar:"Prueba",cupos:10,inscritos:1,ultimoNumero:1,creadoPorId:adminId}})
 const inscription=await db.inscripcion.create({data:{id:randomUUID(),solicitudHash:randomUUID(),eventoId:event.id,pacienteId:baby.id,apoderadoId:family.id,numero:1,qrToken:"QR_PRIVADO"}})
 const confirmation=await db.correoInscripcion.create({data:{inscripcionId:inscription.id,estado:"FALLIDO"}})
 const ledger=await db.envioTransaccional.create({data:{clave:`registration-${confirmation.id}`,finalidad:"CONFIRMACION",estado:"REINTENTABLE",motivo:"TRANSITORIO",destinatarioClave:"destinatario-hmac-ficticio"}})
 await db.$executeRaw`UPDATE "CorreoInscripcion" SET "disponibleAt"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')-interval '1 minute' WHERE id=${confirmation.id}::uuid`
 await db.$executeRaw`UPDATE "EnvioTransaccional" SET "disponibleAt"=CURRENT_TIMESTAMP-interval '1 minute' WHERE clave=${ledger.clave}`
 const fila=await db.entradaFila.create({data:{inscripcionId:inscription.id,eventoId:event.id,orden:1,estado:"ATENDIDO",confirmadoPorId:adminId}})
 const evaluation=await db.evaluacion.create({data:{pacienteId:baby.id,filaId:fila.id,anteroposterior:140,biparietal:120,diagonalIzq:130,diagonalDer:130,indiceCraneal:85.71,indiceAsimetria:0,diagnostico:"DIAGNOSTICO_PRIVADO",recomendacion:"RECOMENDACION_PRIVADA",kinesiologa:"Profesional ficticia"}})
 const publication=await db.resultadoPublicado.create({data:{evaluacionId:evaluation.id,apoderadoId:family.id,publicadoPorId:"profesional",revision:1,datos:{privado:"CONTENIDO_PRIVADO"},correo:{create:{destinatario:family.correo}}}})
 const legacy=await db.correoResultado.findUniqueOrThrow({where:{publicacionId:publication.id}})
 const order=await db.ordenCorreo.create({data:{publicacionId:publication.id,etapa:"INICIAL",claveIdempotencia:`result-${legacy.id}`,estado:"REVISION",entrega:"QUEJA",destinatario:family.correo,mensaje:{html:"CONTENIDO_PRIVADO"},proveedor:"brevo",proveedorId:"<clinical-admin@brevo.test>"}})
 const recovery=await db.solicitudRecuperacion.create({data:{id:randomUUID(),destinatarioHash:"hash-recuperacion",correoCifrado:"CIFRADO_PRIVADO"}})
 const rows=await Promise.all(Array.from({length:25},(_,n)=>db.envioTransaccional.create({data:{clave:`access-${randomUUID()}`,finalidad:"ACCESO",estado:n===0?"REVISION":"ACEPTADO",entrega:n===1?"ENTREGADO":"SIN_CONFIRMAR"}})))
 const listed=await listAdminMail(db,filters());assert.equal(listed.total,28);assert.equal(listed.correos.length,20);assert(listed.hayMas)
 const page2=await listAdminMail(db,filters("pagina=2"));assert.equal(page2.correos.length,8)
 const scoped=await listAdminMail(db,filters(`eventoId=${event.id}`));assert.equal(scoped.total,2);assert.equal(scoped.resumen.quejas,1)
 assert.equal((await listAdminMail(db,filters("estado=ENTREGADOS"))).total,1)
 const clinical=await adminMailDetail(db,"CLINICO",order.id);assert.equal(clinical.correo.entrega,"QUEJA")
 for(const value of [family.correo,"BEBE_PRIVADO","FAMILIA_PRIVADA","DIAGNOSTICO_PRIVADO","RECOMENDACION_PRIVADA","CONTENIDO_PRIVADO","QR_PRIVADO","CIFRADO_PRIVADO",ledger.clave])assert(!JSON.stringify({listed,page2,scoped,clinical}).includes(value))
 console.log("OK consulta: fuentes unificadas sin duplicar, estados de entrega separados, paginación y filtro por evento sin datos clínicos ni destinatarios.")
 let detail=await adminMailDetail(db,"TRANSACCIONAL",rows[0].idGestion),cmd=command(detail.correo)
 await actOnAdminMail(db,actor,"TRANSACCIONAL",rows[0].idGestion,cmd,options)
 assert((await actOnAdminMail(second,actor,"TRANSACCIONAL",rows[0].idGestion,cmd,options)).repetida)
 assert.equal(await db.cambioGestionCorreo.count(),1)
 detail=await adminMailDetail(db,"TRANSACCIONAL",rows[0].idGestion)
 await actOnAdminMail(db,actor,"TRANSACCIONAL",rows[0].idGestion,command(detail.correo,"CERRAR"),options)
 detail=await adminMailDetail(db,"TRANSACCIONAL",rows[0].idGestion);assert.equal(detail.correo.seguimiento,"CERRADO");assert.equal(detail.correo.estado,"REVISION")
 await db.envioTransaccional.update({where:{clave:rows[0].clave},data:{entrega:"REBOTE"}})
 detail=await adminMailDetail(db,"TRANSACCIONAL",rows[0].idGestion);assert.equal(detail.correo.seguimiento,"NUEVA_INCIDENCIA")
 assert.equal((await listAdminMail(db,filters("seguimiento=NUEVA_INCIDENCIA"))).total,1)
 await actOnAdminMail(db,actor,"TRANSACCIONAL",rows[0].idGestion,command(detail.correo,"CERRAR"),options)
 await db.envioTransaccional.update({where:{clave:rows[0].clave},data:{entrega:"REBOTE"}})
 assert.equal((await adminMailDetail(db,"TRANSACCIONAL",rows[0].idGestion)).correo.seguimiento,"CERRADO","Una notificación repetida no reabre la revisión")
 console.log("OK seguimiento: intención idempotente, cierre sin alterar entrega, novedades posteriores visibles y notificaciones repetidas sin falsas incidencias.")
 const racing=await adminMailDetail(db,"RECUPERACION",recovery.id)
 const race=await Promise.allSettled([actOnAdminMail(db,actor,"RECUPERACION",recovery.id,command(racing.correo),options),actOnAdminMail(second,actor,"RECUPERACION",recovery.id,command(racing.correo),options)])
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert(race.some(r=>r.status==='rejected'&&r.reason instanceof MailAdminError&&r.reason.status===409))
 const beforeAudit=await db.cambioGestionCorreo.count()
 const failing={$transaction:fn=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,property){if(property==='cambioGestionCorreo')return new Proxy(target.cambioGestionCorreo,{get(model,method){if(method==='create')return async()=>{throw new Error('Fallo de auditoría ficticio')};return Reflect.get(model,method)}});return Reflect.get(target,property)}})))}
 let confirmations=await adminMailDetail(db,"CONFIRMACION",confirmation.id),called=0
 await assert.rejects(actOnAdminMail(failing,actor,"CONFIRMACION",confirmation.id,command(confirmations.correo,'REINTENTAR_CONFIRMACION'),{canRetry:true,retry:async()=>{called++}}),/Fallo de auditoría ficticio/)
 assert.equal(called,0);assert.equal(await db.cambioGestionCorreo.count(),beforeAudit)
 await assert.rejects(actOnAdminMail(db,actor,"CONFIRMACION",confirmation.id,command(confirmations.correo,'REINTENTAR_CONFIRMACION'),{canRetry:false,retry:async()=>{called++}}),e=>e instanceof MailAdminError&&e.status===409)
 const retryCommand=command(confirmations.correo,'REINTENTAR_CONFIRMACION'),retryOptions={canRetry:true,retry:async(inscripcionId,revisionContenido)=>{assert.equal(inscripcionId,inscription.id);assert.equal(revisionContenido,1);called++;await db.envioTransaccional.update({where:{clave:ledger.clave},data:{estado:"ACEPTADO",proveedorId:"<confirmed-admin@brevo.test>"}})}}
 await actOnAdminMail(db,actor,"CONFIRMACION",confirmation.id,retryCommand,retryOptions)
 await actOnAdminMail(second,actor,"CONFIRMACION",confirmation.id,retryCommand,retryOptions);assert.equal(called,1)
 confirmations=await adminMailDetail(db,"CONFIRMACION",confirmation.id)
 await assert.rejects(actOnAdminMail(db,actor,"CONFIRMACION",confirmation.id,command(confirmations.correo,'REINTENTAR_CONFIRMACION'),retryOptions),e=>e instanceof MailAdminError&&e.status===409)
 for(const target of [clinical,await adminMailDetail(db,'RECUPERACION',recovery.id),await adminMailDetail(db,'TRANSACCIONAL',rows[0].idGestion)])await assert.rejects(actOnAdminMail(db,actor,target.correo.tipo,target.correo.id,command(target.correo,'REINTENTAR_CONFIRMACION'),retryOptions),MailAdminError)
 assert.equal(called,1)
 await db.correoInscripcion.update({where:{id:confirmation.id},data:{revisionContenido:2}})
 const historical=await listAdminMail(db,filters(`eventoId=${event.id}`));assert.equal(historical.total,3)
 assert(historical.correos.some(row=>row.tipo==='TRANSACCIONAL'&&row.id===ledger.idGestion&&row.estado==='ACEPTADO'))
 await db.$executeRaw`UPDATE "SolicitudRecuperacion" SET estado='OMITIDO',"correoCifrado"=NULL,"terminadoAt"=CURRENT_TIMESTAMP-interval '8 days' WHERE id=${recovery.id}::uuid`
 await cleanRecoveryQueue(db);assert(await db.solicitudRecuperacion.findUnique({where:{id:recovery.id}}))
 console.log("OK históricos: confirmaciones anteriores conservan su evento y la limpieza no elimina solicitudes con gestión auditada.")
 console.log("OK acciones: concurrencia y pestañas obsoletas, rollback auditado y reintento de confirmación único; códigos, recuperaciones y clínica no se reenvían.")
 await db.cuentaEquipo.update({where:{id:adminId},data:{role:"RECEPCION"}})
 const target=await adminMailDetail(db,'TRANSACCIONAL',rows[2].idGestion)
 await assert.rejects(actOnAdminMail(db,actor,'TRANSACCIONAL',target.correo.id,command(target.correo),options),e=>e instanceof MailAdminError&&e.status===403)
 await db.cuentaEquipo.update({where:{id:adminId},data:{role:"ADMIN"}})
 await db.sesionEquipo.update({where:{id:sessionId},data:{revocadaAt:new Date(),motivo:"PRUEBA"}})
 await assert.rejects(actOnAdminMail(db,actor,'TRANSACCIONAL',target.correo.id,command(target.correo),options),e=>e instanceof MailAdminError&&e.status===403)
 await assert.rejects(raw.exec('DELETE FROM "CambioGestionCorreo"'))
 await assert.rejects(raw.exec(`UPDATE "CambioGestionCorreo" SET motivo='CAMBIO'`))
 const count=(await raw.query('SELECT count(*)::int n FROM "CambioGestionCorreo"')).rows[0].n;assert(count>0)
 console.log("OK permisos: perfil y sesión se revalidan al escribir; historial inmutable conserva actor y motivo sin modificar estados ni bloqueos del proveedor.")
} finally {await db?.$disconnect();await second?.$disconnect();await fixturePool?.end();await gate?.close();await socket?.stop();await embedded?.close()}
