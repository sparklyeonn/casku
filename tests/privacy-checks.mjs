import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {paperConsent} from "./privacy-fixtures.mjs"
export async function privacyChecks({db,client,signIn,password,accounts,admin,anonymous,f1,f2,post,createEvent,mails,setResultFailure}){
 const rec=client(),kine=client();for(const [request,account]of [[rec,accounts[0]],[kine,accounts[2]]])await signIn(request,"equipo",{email:account.email,password})
 const permissions="/api/familias/privacidad",staff="/api/privacidad/inscripciones",audit="/api/administracion/privacidad"
 const noMail={version:"2026-11-11.1",datos:true,correoResultados:false,seguimiento:false},all={...noMail,correoResultados:true,seguimiento:true}
 const owner=f1.user.id.replace(/^familia:/,"")
 async function json(request,path,options,expected=200){const response=await request(path,options),body=await response.json();assert.equal(response.status,expected,`${path}: ${JSON.stringify(body)}`);return body}
 const event=await createEvent(admin,"Privacidad ficticia",8),profile=(await json(f1.request,"/api/familias/inscripciones")).perfil
 const payload={id:randomUUID(),eventoId:event.id,nombreBebe:"Bebé privacidad",fechaNacimiento:"2026-01-01",nombreApoderado:profile.nombre,rutApoderado:profile.rut,telefono:profile.telefono,revisionApoderado:profile.revisionDatos}
 const patientCount=(await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n
 for(const privacy of [undefined,{...noMail,datos:false},{...noMail,version:"antigua"},{...noMail,seguimiento:true},{...noMail,datos:"true"}])await json(f1.request,"/api/familias/inscripciones",post({...payload,privacidad:privacy}),400)
 assert.equal((await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n,patientCount)
 const receipt=(await json(f1.request,"/api/familias/inscripciones",post({...payload,privacidad:noMail,actorId:"intruso",perfilActor:"ADMIN"}),201)).inscripcion
 async function findPermission(patientId,eventId) {
   for(let page=1;page<100;page++) {
     const list=await json(f1.request,`${permissions}?pagina=${page}`)
     const found=list.autorizaciones.find(row=>row.eventoId===eventId&&row.pacienteId===patientId)
     if(found)return found
     if(!list.hayMas)break
   }
   assert.fail("La autorización propia debe aparecer en la lista paginada")
 }
 async function own(){return findPermission(receipt.bebe.id,event.id)}
 async function change(choice,revision){const row=await own();return f1.request(permissions,post({eventoId:event.id,pacienteId:receipt.bebe.id,revision:revision??row.autorizacion?.revision??0,privacidad:choice}))}
 let row=await own();const authorization=row.autorizacion.id
 assert.equal(row.autorizacion.revision,1);assert.equal(row.autorizacion.correoResultados,false)
 const record=(await db.query('SELECT * FROM "CambioPrivacidad" WHERE "autorizacionId"=$1',[authorization])).rows[0]
 assert.equal(record.perfilActor,"APODERADO");assert.equal(record.actorId,f1.user.id);assert.equal(record.canal,"CUENTA_VERIFICADA");assert.equal(record.versionTexto,noMail.version);assert(record.textos.datos);assert(!JSON.stringify(record).includes("intruso"))
 for(const request of [anonymous,rec,kine,admin])assert.equal((await request(permissions)).status,401)
 assert(!(await json(f2.request,permissions)).autorizaciones.some(value=>value.pacienteId===receipt.bebe.id))
 await json(f2.request,permissions,post({eventoId:event.id,pacienteId:receipt.bebe.id,revision:1,privacidad:all}),404)
 await json(f2.request,`/api/familias/privacidad/${authorization}/historial`,undefined,404)
 for(const [request,status]of [[anonymous,401],[f1.request,401],[rec,403],[kine,403]])assert.equal((await request(audit)).status,status)
 assert.equal((await kine(`${staff}?eventoId=${event.id}&inscripcionId=${receipt.id}`)).status,403)
 await json(rec,staff,post({eventoId:event.id,inscripcionId:receipt.id,revision:1,declaracion:{documentada:true}}),400)
 assert.equal((await change(all)).status,200)
 row=await own();const revision=row.autorizacion.revision
 const race=await Promise.all([change({...noMail,datos:false},revision),change({...all,seguimiento:false},revision)])
 assert.deepEqual(race.map(value=>value.status).sort(),[200,409]);assert.equal((await own()).autorizacion.revision,revision+1)
 assert.equal((await change(noMail)).status,200)
 // A withdrawal blocks new capture even for a previously arrived family.
 await json(rec,"/api/recepcion/llegadas",post({eventoId:event.id,inscripcionId:receipt.id}),201)
 const existing=(await json(kine,"/api/kinesiologia/atencion")).atencion;if(existing)await json(kine,"/api/kinesiologia/devolver",post({atencionId:existing.id,reservaId:existing.reservaId}))
 let attention=(await json(kine,"/api/kinesiologia/llamar",post({id:randomUUID(),eventoId:event.id}))).atencion
 assert(attention)
 assert.equal((await change({...noMail,datos:false})).status,200)
 const measures={ap:140,bp:120,di:150,dd:130}
 await json(kine,"/api/evaluaciones",post({atencionId:attention.id,reservaId:attention.reservaId,...measures}),409)
 await json(kine,"/api/kinesiologia/devolver",post({atencionId:attention.id,reservaId:attention.reservaId}))
 assert.equal((await json(kine,"/api/kinesiologia/llamar",post({id:randomUUID(),eventoId:event.id}))).atencion,null)
 assert.equal((await change(noMail)).status,200)
 attention=(await json(kine,"/api/kinesiologia/llamar",post({id:randomUUID(),eventoId:event.id}))).atencion
 const saved=await json(kine,"/api/evaluaciones",post({atencionId:attention.id,reservaId:attention.reservaId,...measures}),201)
 const detail=`/api/kinesiologia/resultados/${saved.evaluacionId}`
 const resultBefore=mails.filter(value=>value.subject==="Tu resultado de craneometría en Casku").length
 const published=(await json(kine,detail+"/publicar",post({revision:1}),201)).resultado
 const publication=published.publicacion.id
 assert.equal(published.publicacion.correo.estado,"CANCELADO")
 assert.equal(mails.filter(value=>value.subject==="Tu resultado de craneometría en Casku").length,resultBefore)
 const familyResult=`/api/familias/resultados/${publication}`
 assert.equal((await f1.request(familyResult)).status,200)
 await json(f1.request,familyResult+"/correo",post({}))
 assert.equal(mails.filter(value=>value.subject==="Tu resultado de craneometría en Casku").length,resultBefore)
 assert.equal((await f2.request(familyResult)).status,404)
 assert.equal((await admin(detail)).status,403)
 // Audit failures roll back a change, including its permissions and pending-mail effects.
 const before=(await own()).autorizacion.revision
 await db.exec(`CREATE FUNCTION fail_privacy_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'local fixture'; END $$; CREATE TRIGGER privacy_failure BEFORE INSERT ON "CambioPrivacidad" FOR EACH ROW EXECUTE FUNCTION fail_privacy_audit();`)
 assert.equal((await change(all,before)).status,503)
 assert.equal((await own()).autorizacion.revision,before)
 assert.equal((await db.query('SELECT estado FROM "CorreoResultado" WHERE "publicacionId"=$1',[publication])).rows[0].estado,"CANCELADO")
 await db.exec('DROP TRIGGER privacy_failure ON "CambioPrivacidad"; DROP FUNCTION fail_privacy_audit();')
 assert.equal((await change(all)).status,200)
 await db.query(`UPDATE "OrdenCorreo" SET estado='PENDIENTE',destinatario=$2,mensaje='{"subject":"Prueba","text":"Prueba","html":"Prueba"}'::jsonb,"politicaVersion"='prueba',"programadoAt"=CURRENT_TIMESTAMP,"disponibleAt"=CURRENT_TIMESTAMP,"limiteAt"=CURRENT_TIMESTAMP+interval '72 hours' WHERE "publicacionId"=$1 AND etapa='SEMANA'`,[publication,f1.user.email])
 setResultFailure(true);await json(f1.request,familyResult+"/correo",post({}));setResultFailure(false)
 assert.equal((await db.query('SELECT estado FROM "CorreoResultado" WHERE "publicacionId"=$1',[publication])).rows[0].estado,"FALLIDO")
 assert.equal((await change(noMail)).status,200)
 assert.equal((await db.query(`SELECT estado FROM "OrdenCorreo" WHERE "publicacionId"=$1 AND etapa='SEMANA'`,[publication])).rows[0].estado,"CANCELADO","Retirar permisos cancela el seguimiento pendiente en la misma transacción")
 await json(f1.request,familyResult+"/correo",post({}))
 assert.equal(mails.filter(value=>value.subject==="Tu resultado de craneometría en Casku").length,resultBefore)
 assert.equal((await change({...all,seguimiento:false})).status,200)
 await json(f1.request,familyResult+"/correo",post({}))
 assert.equal(mails.filter(value=>value.subject==="Tu resultado de craneometría en Casku").length,resultBefore+1)
 assert.equal((await own()).autorizacion.seguimiento,false)
 assert.equal((await change({...noMail,datos:false})).status,200)
 assert.equal((await f1.request(familyResult)).status,200,"La retirada conserva el acceso al resultado histórico publicado")
 console.log("OK privacidad: aceptación versionada, opciones separadas, permisos/propiedad, retirada, CAS, captura bloqueada, publicación sin correo, reintentos y rollback auditado.")
 // Legacy reservations are pending; staff can record fresh documented data consent only.
 const legacyEvent=await createEvent(admin,"Consentimiento histórico ficticio",3),patient=randomUUID(),inscription=randomUUID()
 await db.query(`INSERT INTO "Paciente" (id,nombre,"fechaNacimiento","apoderadoId","nombreNormalizado") VALUES ($1,'Bebé histórico privado','2026-01-01',$2,'bebé histórico privado')`,[patient,owner])
 await db.query(`INSERT INTO "Inscripcion" (id,"eventoId","pacienteId","apoderadoId",numero,"qrToken","solicitudHash",origen) VALUES ($1,$2,$3,$4,1,$5,'fixture','PREVIA')`,[inscription,legacyEvent.id,patient,owner,randomUUID()])
 await db.query('UPDATE "Evento" SET inscritos=1,"ultimoNumero"=1 WHERE id=$1',[legacyEvent.id])
 const lookup=`${staff}?eventoId=${legacyEvent.id}&inscripcionId=${inscription}`
 assert.equal((await json(rec,lookup)).estado,"PENDIENTE")
 await json(rec,"/api/recepcion/llegadas",post({eventoId:legacyEvent.id,inscripcionId:inscription}),409)
 const evidence={...paperConsent.declaracion,referencia:"DOC-HISTORICO-NUEVO"},proof={eventoId:legacyEvent.id,inscripcionId:inscription,revision:0,declaracion:evidence,privacidad:all}
 await json(rec,staff,post(proof))
 let legacyPermission=(await findPermission(patient,legacyEvent.id)).autorizacion
 assert.equal(legacyPermission.correoResultados,false);assert.equal(legacyPermission.seguimiento,false)
 const withdrawal={eventoId:legacyEvent.id,pacienteId:patient,revision:legacyPermission.revision,privacidad:{...noMail,datos:false}}
 await json(f1.request,permissions,post(withdrawal))
 await json(rec,staff,post({...proof,revision:legacyPermission.revision}),409)
 await json(rec,staff,post({...proof,revision:legacyPermission.revision+1}),409,"El mismo documento no revive una autorización retirada")
 await json(rec,staff,post({...proof,revision:legacyPermission.revision+1,declaracion:{...evidence,referencia:"DOC-HISTORICO-RENOVADO"}}))
 for(let index=0;index<12;index++)assert.equal((await change(index%2?noMail:{...all,seguimiento:false})).status,200)
 const history=await json(f1.request,`/api/familias/privacidad/${authorization}/historial`)
 assert.equal(history.cambios.length,10);assert(history.hayMas)
 const history2=await json(f1.request,`/api/familias/privacidad/${authorization}/historial?pagina=2`);assert(history2.cambios.length>0)
 assert(!JSON.stringify(history).includes(owner));assert(!JSON.stringify(history).includes("declarante"));assert(!JSON.stringify(history).includes("referencia"))
 for(const sql of [`UPDATE "CambioPrivacidad" SET canal='FALSO' WHERE "autorizacionId"=$1`,'DELETE FROM "CambioPrivacidad" WHERE "autorizacionId"=$1'])await assert.rejects(db.query(sql,[authorization]),error=>error.code==="23514")
 const ledger=(await db.query('SELECT id FROM "AccesoPrivado" LIMIT 1')).rows[0].id
 await assert.rejects(db.query('DELETE FROM "AccesoPrivado" WHERE id=$1',[ledger]),error=>error.code==="23514")
 const auditResult=await json(admin,audit)
 assert(auditResult.accesos.length>0);assert(auditResult.accesos.some(value=>value.accion==="CONSULTAR"))
 for(const key of ["diagnostico","recomendacion","qrToken","destinatario","rut","medidas"])assert(!JSON.stringify(auditResult).includes('"'+key+'"'))
 await db.exec(`CREATE FUNCTION fail_access_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion='CONSULTAR' AND NEW.recurso='PUBLICACION' THEN RAISE EXCEPTION 'local fixture'; END IF; RETURN NEW; END $$; CREATE TRIGGER access_failure BEFORE INSERT ON "AccesoPrivado" FOR EACH ROW EXECUTE FUNCTION fail_access_audit();`)
 const protectedRead=await f1.request(familyResult);assert.equal(protectedRead.status,503);assert(!(await protectedRead.text()).includes("diagnostico"))
 await db.exec('DROP TRIGGER access_failure ON "AccesoPrivado"; DROP FUNCTION fail_access_audit();')
 assert.equal((await f1.request("/familias/privacidad")).status,200);assert.equal((await admin("/administracion/privacidad")).status,200)
 await json(f1.request,permissions+"?pagina=0",undefined,400)
 console.log("OK trazabilidad: históricos pendientes, evidencia documental sin correo por terceros, formulario antiguo/documento revocado bloqueados, historial paginado e inmutable, auditoría sin contenido clínico y lectura que falla cerrada.")
}
