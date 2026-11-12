import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {familyConsent} from "./privacy-fixtures.mjs"
export async function resultVersionChecks({db,client,signIn,password,accounts,admin,anonymous,f1,f2,post,createEvent,mails,setResultFailure}) {
 const kine=client(),other=client(),rec=client()
 for(const [request,account]of [[kine,accounts[2]],[other,accounts[3]],[rec,accounts[0]]])await signIn(request,"equipo",{email:account.email,password})
 const active=(await (await kine("/api/kinesiologia/atencion")).json()).atencion
 if(active)await kine("/api/kinesiologia/devolver",post({atencionId:active.id,reservaId:active.reservaId}))
 async function json(request,path,options,status=200){const response=await request(path,options),body=await response.json();assert.equal(response.status,status,`${path}: ${JSON.stringify(body)}`);return body}
 const event=await createEvent(admin,"Versiones clínicas ficticias",2),profile=(await json(f1.request,"/api/familias/inscripciones")).perfil
 const receipt=(await json(f1.request,"/api/familias/inscripciones",post({...familyConsent,privacidad:{...familyConsent.privacidad,seguimiento:true},id:randomUUID(),eventoId:event.id,nombreBebe:"Bebé versiones <ficticio>",fechaNacimiento:"2026-01-01",nombreApoderado:profile.nombre,revisionApoderado:profile.revisionDatos,rutApoderado:profile.rut,telefono:profile.telefono}),201)).inscripcion
 await json(rec,"/api/recepcion/llegadas",post({eventoId:event.id,inscripcionId:receipt.id}),201)
 const attention=(await json(kine,"/api/kinesiologia/llamar",post({id:randomUUID(),eventoId:event.id}))).atencion
 const measures={ap:140,bp:120,di:150,dd:130}
 const saved=await json(kine,"/api/evaluaciones",post({atencionId:attention.id,reservaId:attention.reservaId,...measures}),201),root=`/api/kinesiologia/resultados/${saved.evaluacionId}`
 setResultFailure(true)
 const initial=(await json(kine,root+"/publicar",post({revision:1}),201)).resultado
 setResultFailure(false)
 assert.equal(initial.publicacion.version,1);assert.equal(initial.publicacion.revisionControl,1)
 const publication=initial.publicacion.id,familyPath=`/api/familias/resultados/${publication}`,reason="Corrección de una medición registrada durante la evaluación"
 const body={id:randomUUID(),revisionControl:1,motivo:reason,confirmar:true,...measures,ap:142,diagnostico:"No confiar en este diagnóstico enviado por el cliente"}
 for(const [request,status]of [[anonymous,401],[f1.request,401],[admin,403],[rec,403],[other,404]])for(const suffix of ["corregir","retirar","historial"])await json(request,`${root}/${suffix}`,suffix==="historial"?undefined:post(body),status)
 for(const invalid of [{...body,motivo:""},{...body,motivo:"x".repeat(501)},{...body,confirmar:false},{...body,revisionControl:0},{...body,id:"incorrecto"},{...body,ap:0}])await json(kine,root+"/corregir",post(invalid),400)
 await json(kine,root+"/corregir",post({...body,ap:140}),400)
 assert.equal((await db.query('SELECT count(*)::int n FROM "VersionResultado" WHERE "publicacionId"=$1',[publication])).rows[0].n,1)
 const original=(await db.query('SELECT datos FROM "ResultadoPublicado" WHERE id=$1',[publication])).rows[0].datos
 // Un envío en curso se detiene para nuevos intentos; su respuesta tardía no puede reactivar la versión vieja.
 const token=randomUUID()
 await db.query(`UPDATE "OrdenCorreo" SET estado='ENVIANDO',destinatario=$2,mensaje='{"subject":"Prueba","text":"Prueba","html":"Prueba"}'::jsonb,"politicaVersion"='ficticia',"programadoAt"=CURRENT_TIMESTAMP,"disponibleAt"=CURRENT_TIMESTAMP,"limiteAt"=CURRENT_TIMESTAMP+interval '72 hours',intentos=1,"bloqueoToken"=$3,"bloqueoHasta"=CURRENT_TIMESTAMP+interval '2 minutes' WHERE "publicacionId"=$1 AND etapa='SEMANA'`,[publication,f1.user.email,token])
 const mailCount=mails.length
 const corrected=await json(kine,root+"/corregir",post(body)),v2=corrected.resultado
 assert.equal(corrected.cambio.enviosEnCurso,1);assert.equal(v2.publicacion.version,2);assert.equal(v2.publicacion.revisionControl,2);assert.equal(v2.revision,2)
 assert.equal(v2.datos.medidas.ap,142);assert.equal(v2.datos.indiceCraneal,120/142*100);assert.notEqual(v2.datos.diagnostico,body.diagnostico)
 assert.equal(mails.length,mailCount,"Corregir no envía automáticamente una nueva copia")
 assert.deepEqual((await db.query('SELECT datos FROM "ResultadoPublicado" WHERE id=$1',[publication])).rows[0].datos,original)
 assert.deepEqual((await db.query('SELECT datos FROM "VersionResultado" WHERE "publicacionId"=$1 AND numero=1',[publication])).rows[0].datos,original)
 const oldOrders=(await db.query('SELECT * FROM "OrdenCorreo" WHERE "publicacionId"=$1 AND version=1',[publication])).rows
 assert(oldOrders.every(row=>row.estado==="CANCELADO"));assert(oldOrders.every(row=>row.bloqueoToken===null))
 assert.equal((await db.query('SELECT "ultimoError" FROM "CorreoResultado" WHERE "publicacionId"=$1',[publication])).rows[0].ultimoError,"VERSION_NO_VIGENTE")
 const newOrders=(await db.query('SELECT * FROM "OrdenCorreo" WHERE "publicacionId"=$1 AND version=2',[publication])).rows
 assert.equal(newOrders.length,3);assert(newOrders.every(row=>row.estado==="BLOQUEADO"));assert(!newOrders.some(row=>oldOrders.some(old=>old.claveIdempotencia===row.claveIdempotencia)))
 const current=(await json(f1.request,familyPath)).resultado
 assert.equal(current.version,2);assert.deepEqual(current.datos,v2.datos);assert(!JSON.stringify(current).includes(reason));assert.equal(current.estado,"VIGENTE")
 assert.equal((await json(f1.request,familyPath+"?version=1")).resultado.version,2)
 await json(f2.request,familyPath,undefined,404)
 await json(f1.request,familyPath+"/correo",post({}),409);await json(kine,root+"/correo",post({}),409)
 const replay=await json(kine,root+"/corregir",post(body));assert(replay.cambio.repetida);assert.equal(replay.resultado.publicacion.version,2)
 await json(kine,root+"/corregir",post({...body,motivo:"Otro motivo con el mismo identificador"}),409)
 await json(kine,root+"/retirar",post({...body,id:randomUUID()}),409)
 const history=await json(kine,root+"/historial");assert.equal(history.versiones.length,2);assert.equal(history.cambios[0].motivo,reason);assert.equal(history.cambios[0].actorId,accounts[2].id)
 const retire={id:randomUUID(),revisionControl:2,motivo:"Retirar para revisar la toma de mediciones",confirmar:true}
 const withdrawn=(await json(kine,root+"/retirar",post(retire))).resultado
 assert.equal(withdrawn.publicacion.estado,"RETIRADO");assert.equal(withdrawn.publicacion.version,2);assert.equal(withdrawn.publicacion.revisionControl,3)
 assert((await db.query('SELECT estado FROM "OrdenCorreo" WHERE "publicacionId"=$1 AND version=2',[publication])).rows.every(row=>row.estado==="CANCELADO"))
 const tombstone=(await json(f1.request,familyPath)).resultado
 assert.equal(tombstone.estado,"RETIRADO");assert.equal(tombstone.datos,null);assert(!JSON.stringify(tombstone).includes("medidas"));assert(!JSON.stringify(tombstone).includes(retire.motivo))
 const listed=(await json(f1.request,"/api/familias/resultados")).resultados.find(row=>row.id===publication);assert.equal(listed.datos,null);assert.equal(listed.estado,"RETIRADO")
 const html=await (await f1.request(`/familias/resultados/${publication}`)).text();assert(html.includes("Resultado retirado"));assert(!html.includes(v2.datos.recomendacion))
 await json(f1.request,familyPath+"/correo",post({}),409);await json(kine,root+"/publicar",post({revision:2}),409)
 assert((await json(kine,root+"/retirar",post(retire))).cambio.repetida)
 assert.equal((await json(kine,"/api/kinesiologia/resultados?estado=RETIRADO")).resultados.filter(row=>row.id===saved.evaluacionId).length,1)
 const overview=await json(admin,`/api/eventos/${event.id}/resumen`);assert.equal(overview.totales.resultadosRetirados,1);assert.equal(overview.totales.resultadosPublicados,0)
 const resume={...body,id:randomUUID(),revisionControl:3,motivo:"Revisión terminada y nueva publicación de las medidas corregidas",ap:142}
 const restored=(await json(kine,root+"/corregir",post(resume))).resultado;assert.equal(restored.publicacion.version,3);assert.equal(restored.publicacion.estado,"VIGENTE")
 assert.equal((await json(f1.request,familyPath)).resultado.version,3)
 assert((await json(kine,root+"/corregir",post(body))).cambio.repetida);assert.equal((await json(kine,root)).resultado.publicacion.version,3,"Repetir una solicitud antigua no restaura una versión vieja")
 // Auditoría fallida: se revierten nueva versión, evaluación, cancelaciones y puntero.
 const before=(await db.query('SELECT to_jsonb(t) data FROM "OrdenCorreo" t WHERE "publicacionId"=$1 ORDER BY id',[publication])).rows
 await db.exec(`CREATE FUNCTION fail_result_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER result_change_failure BEFORE INSERT ON "CambioResultado" FOR EACH ROW EXECUTE FUNCTION fail_result_change();`)
 await json(kine,root+"/corregir",post({...body,id:randomUUID(),revisionControl:4,ap:143}),503)
 assert.equal((await json(kine,root)).resultado.publicacion.version,3)
 assert.deepEqual((await db.query('SELECT to_jsonb(t) data FROM "OrdenCorreo" t WHERE "publicacionId"=$1 ORDER BY id',[publication])).rows,before)
 await db.exec('DROP TRIGGER result_change_failure ON "CambioResultado"; DROP FUNCTION fail_result_change();')
 const competing=await Promise.all([kine(root+"/corregir",post({...body,id:randomUUID(),revisionControl:4,ap:144})),kine(root+"/retirar",post({...retire,id:randomUUID(),revisionControl:4}))])
 assert.deepEqual(competing.map(row=>row.status).sort(),[200,409])
 const currentReview=(await json(kine,root)).resultado
 const currentCount=(await db.query('SELECT count(*)::int n FROM "VersionResultado" WHERE "publicacionId"=$1',[publication])).rows[0].n
 assert.equal(currentCount,currentReview.publicacion.version)
 for(const sql of [`UPDATE "VersionResultado" SET motivo='Cambio indebido' WHERE "publicacionId"=$1`,`DELETE FROM "VersionResultado" WHERE "publicacionId"=$1`,`UPDATE "CambioResultado" SET motivo='Cambio indebido' WHERE "publicacionId"=$1`,`DELETE FROM "CambioResultado" WHERE "publicacionId"=$1`,`UPDATE "ResultadoPublicado" SET datos='{}'::jsonb WHERE id=$1`])await assert.rejects(db.query(sql,[publication]),error=>error.code==="23514")
 const versionPage=await kine(`/kinesiologia/resultados/${saved.evaluacionId}`);assert.equal(versionPage.status,200);assert((await versionPage.text()).includes("Control de la publicación"))
 await json(kine,root+"/historial?pagina=0",undefined,400)
 assert.equal(mails.length,mailCount)
 console.log("OK versiones: autoría y permisos, motivo/confirmación, recálculo en servidor, historial inmutable, copia original intacta, familia solo ve vigente, retiro sin datos clínicos y republicación explícita.")
 console.log("OK consistencia: solicitudes repetidas, pestañas antiguas, corrección/retiro concurrentes, rollback auditado, correos por versión cancelados, nuevas órdenes bloqueadas y aviso de envío en curso.")
}
