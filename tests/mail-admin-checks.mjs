import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {familyConsent} from "./privacy-fixtures.mjs"
export async function mailAdminChecks({db,client,signIn,password,accounts,admin,anonymous,family,post,createEvent,mails,setMailFailure}){
 const root="/api/administracion/correos/mensajes",parent=await family("admin-mail-family@example.com"),event=await createEvent(admin,"Gestión correo ficticia",3)
 const requests=[anonymous,parent.request]
 for(const account of [accounts[0],accounts[2]]){const request=client();await signIn(request,"equipo",{email:account.email,password});requests.push(request)}
 for(const [index,request]of requests.entries())assert.equal((await request(root)).status,index<2?401:403)
 setMailFailure(true)
 const response=await parent.request("/api/familias/inscripciones",post({...familyConsent,id:randomUUID(),eventoId:event.id,nombreBebe:"BEBE_ADMIN_PRIVADO",fechaNacimiento:"2026-01-01",nombreApoderado:"FAMILIA_ADMIN_PRIVADA"}))
 setMailFailure(false);assert.equal(response.status,201);const inscription=(await response.json()).inscripcion
 const mail=(await db.query('SELECT * FROM "CorreoInscripcion" WHERE "inscripcionId"=$1',[inscription.id])).rows[0]
 const path=`${root}/CONFIRMACION/${mail.id}`
 const read=async()=>{const response=await admin(path);assert.equal(response.status,200);return response.json()}
 const get=async query=>{const response=await admin(root+query);assert.equal(response.status,200);return response.json()}
 const scoped=await get(`?eventoId=${event.id}`);assert.equal(scoped.total,1);assert.equal(scoped.correos[0].estado,"REINTENTABLE")
 for(const request of requests){assert([401,403].includes((await request(path)).status));assert([401,403].includes((await request(path,post({}))).status))}
 const before=(await db.query('SELECT count(*)::int n FROM "CambioGestionCorreo"')).rows[0].n
 let detail=await read();assert.equal((await db.query('SELECT count(*)::int n FROM "CambioGestionCorreo"')).rows[0].n,before)
 for(const value of ["BEBE_ADMIN_PRIVADO","FAMILIA_ADMIN_PRIVADA","admin-mail-family@example.com",inscription.qrToken].filter(Boolean))assert(!JSON.stringify({scoped,detail}).includes(value))
 assert(!JSON.stringify({scoped,detail}).match(/hashMensaje|destinatarioClave|bloqueoToken|codigoHash|correoCifrado|claveIdempotencia/))
 for(const query of ['?pagina=0','?tipo=INVALIDO','?estado=__proto__','?eventoId=falso'])assert.equal((await admin(root+query)).status,400)
 assert.equal((await admin(`${root}/CONFIRMACION/${randomUUID()}`)).status,404)
 assert.equal((await admin(path,{...post({}),headers:{"Content-Type":"application/json",origin:"https://otro.example"}})).status,403)
 const body=(accion='REVISAR',extra={})=>({id:randomUUID(),accion,motivo:"REVISION_PROVEEDOR",revision:detail.correo.revision,huella:detail.correo.huella,confirmado:true,...extra})
 assert.equal((await admin(path,post(body('DESBLOQUEAR')))).status,400)
 assert.equal((await admin(path,post(body('CERRAR',{confirmado:false})))).status,400)
 assert.equal((await admin(path,post(body('REVISAR',{motivo:'Datos clínicos no permitidos'})))).status,400)
 assert.equal((await admin(path,post(body('REINTENTAR_CONFIRMACION')))).status,409,"Respeta la espera antes de reintentar")
 await db.query(`UPDATE "CorreoInscripcion" SET "disponibleAt"=CURRENT_TIMESTAMP-interval '1 minute' WHERE id=$1`,[mail.id])
 await db.query(`UPDATE "EnvioTransaccional" SET "disponibleAt"=CURRENT_TIMESTAMP-interval '1 minute' WHERE clave=$1`,[`registration-${mail.id}`])
 detail=await read()
 const guardedBefore=mails.filter(row=>row.subject.startsWith('Inscripción confirmada')).length
 await db.exec(`CREATE FUNCTION admin_mail_revision_race() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion='REINTENTAR_CONFIRMACION' AND NEW.tipo='CONFIRMACION' THEN UPDATE "CorreoInscripcion" SET "revisionContenido"="revisionContenido"+1 WHERE id=NEW."destinoId"; END IF; RETURN NEW; END $$; CREATE TRIGGER admin_mail_revision_race AFTER INSERT ON "CambioGestionCorreo" FOR EACH ROW EXECUTE FUNCTION admin_mail_revision_race();`)
 assert.equal((await admin(path,post(body('REINTENTAR_CONFIRMACION')))).status,200)
 assert.equal(mails.filter(row=>row.subject.startsWith('Inscripción confirmada')).length,guardedBefore,"Un cambio de contenido tras auditar no envía otra versión")
 await db.exec('DROP TRIGGER admin_mail_revision_race ON "CambioGestionCorreo"; DROP FUNCTION admin_mail_revision_race();')
 await db.query(`UPDATE "CorreoInscripcion" SET "revisionContenido"=1 WHERE id=$1`,[mail.id])
 detail=await read()
 const retry=body('REINTENTAR_CONFIRMACION'),count=mails.filter(row=>row.subject.startsWith('Inscripción confirmada')).length
 const race=await Promise.all([admin(path,post(retry)),admin(path,post(retry))]);assert(race.every(row=>row.status===200))
 assert.equal(mails.filter(row=>row.subject.startsWith('Inscripción confirmada')).length,count+1)
 detail=await read();assert.equal(detail.correo.estado,'ACEPTADO');assert.equal(detail.historial.length,2)
 assert.equal((await admin(path,post(body('REINTENTAR_CONFIRMACION')))).status,409)
 const ledger=(await db.query('SELECT "destinatarioClave" FROM "EnvioTransaccional" WHERE clave=$1',[`registration-${mail.id}`])).rows[0]
 await db.query(`UPDATE "EnvioTransaccional" SET entrega='REBOTE' WHERE clave=$1`,[`registration-${mail.id}`])
 await db.query(`INSERT INTO "SupresionCorreo" (clave,motivo) VALUES ($1,'REBOTE')`,[ledger.destinatarioClave])
 detail=await read();assert(detail.correo.suprimido)
 assert.equal((await admin(path,post(body('CERRAR')))).status,200)
 detail=await read();assert.equal(detail.correo.seguimiento,'CERRADO');assert.equal(detail.correo.entrega,'REBOTE');assert(detail.correo.suprimido)
 await db.query(`UPDATE "EnvioTransaccional" SET "updatedAt"=CURRENT_TIMESTAMP WHERE clave=$1`,[`registration-${mail.id}`])
 assert.equal((await read()).correo.seguimiento,'CERRADO')
 await db.query(`UPDATE "EnvioTransaccional" SET entrega='QUEJA' WHERE clave=$1`,[`registration-${mail.id}`])
 detail=await read();assert.equal(detail.correo.seguimiento,'NUEVA_INCIDENCIA')
 assert.equal((await admin(path,post(body('REABRIR')))).status,200)
 assert.equal((await db.query('SELECT motivo FROM "SupresionCorreo" WHERE clave=$1',[ledger.destinatarioClave])).rows[0].motivo,'REBOTE')
 assert.equal((await admin('/administracion/correos')).status,200)
 const html=await (await admin('/administracion/correos')).text();assert(html.includes('Gestión de correos'));assert(html.includes('Estado'))
 console.log("OK gestión HTTP: permisos por perfil, lectura privada, filtros, revisión auditada, reintento único con espera y bloqueos conservados ante rebote/queja.")
 return {eventId:event.id,eventName:event.nombre,confirmationId:mail.id}
}
export async function disabledMailAdminChecks({db,request,post}){
 const id=randomUUID()
 await db.query(`INSERT INTO "EnvioTransaccional" (clave,finalidad,estado,"idGestion") VALUES ($1,'CONFIRMACION','REINTENTABLE',$2)`,[`disabled-admin-${randomUUID()}`,id])
 const root='/api/administracion/correos/mensajes',path=`${root}/TRANSACCIONAL/${id}`
 const listing=await request(root);assert.equal(listing.status,200);assert.equal((await listing.json()).reintentosHabilitados,false)
 const detail=await (await request(path)).json()
 const input={id:randomUUID(),accion:'REVISAR',motivo:'REVISION_PROVEEDOR',revision:detail.correo.revision,huella:detail.correo.huella,confirmado:true}
 assert.equal((await request(path,post(input))).status,200)
 const next=await (await request(path)).json()
 assert.equal((await request(path,post({...input,id:randomUUID(),accion:'REINTENTAR_CONFIRMACION',revision:next.correo.revision}))).status,409)
 assert.equal((await db.query('SELECT count(*)::int n FROM "CambioGestionCorreo" WHERE "destinoId"=$1',[id])).rows[0].n,1)
 console.log("OK administración sin Brevo: consulta y revisión disponibles; reintentos desactivados sin modificar estados del proveedor.")
}
