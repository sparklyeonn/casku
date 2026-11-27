import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {paperConsent} from './privacy-fixtures.mjs'
export async function evaluationContextChecks({db,kine,reception,admin,anonymous,family,post,createEvent,mails}){
 const a=await createEvent(admin,'Evaluación directa A',10,false),b=await createEvent(admin,'Evaluación directa B',10,false)
 const payload={...paperConsent,nombre:'Bebé contexto ficticio',rut:'37888999-1',fnac:'2026-01-01',correo:'contexto@example.test',ap:140,bp:120,di:135,dd:138,protocolo:'casku-craneometria-v2',distanciaPOEtragusDer:100,distanciaPOEtragusIzq:108}
 const beforePatients=(await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n,beforeMails=mails.length
 for(const eventoId of[undefined,null,'',randomUUID()])assert.equal((await kine('/api/evaluaciones',post({...payload,eventoId}))).status,400)
 assert.equal((await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n,beforePatients,'Sin evento válido no se crean fichas parciales')
 for(const [client,status]of[[anonymous,401],[family,401],[reception,403],[admin,403]])assert.equal((await client('/api/evaluaciones',post({...payload,eventoId:a.id}))).status,status)
 const response=await kine('/api/evaluaciones',post({...payload,eventoId:a.id,origen:'CALENDLY'}));assert.equal(response.status,201)
 const {evaluacionId}=await response.json(),stored=(await db.query('SELECT e."eventoId",e.origen,e."filaId",a."eventoId" consentimientoEvento,a."correoResultados",a.seguimiento FROM "Evaluacion" e JOIN "AutorizacionPrivacidad" a ON a.id=e."autorizacionId" WHERE e.id=$1',[evaluacionId])).rows[0]
 assert.equal(stored.eventoId,a.id);assert.equal(stored.origen,'DIRECTA_SIN_INSCRIPCION');assert.equal(stored.filaId,null);assert.equal(stored.consentimientoevento,a.id);assert.equal(stored.correoResultados,false);assert.equal(stored.seguimiento,false)
 const summary=await(await admin(`/api/eventos/${a.id}/resumen`)).json(),other=await(await admin(`/api/eventos/${b.id}/resumen`)).json()
 assert.equal(summary.totales.atendidos,1);assert.equal(summary.totales.inscritos,0);assert.equal(summary.totales.sinLlegada,0);assert.equal(summary.totales.resultadosPendientes,1)
 assert.equal(summary.evaluaciones.directas,1);assert.equal(summary.evaluaciones.total,1);assert.equal(other.evaluaciones.total,0);assert.equal(other.totales.atendidos,0)
 const {resultado:review}=await(await kine(`/api/kinesiologia/resultados/${evaluacionId}`)).json();assert.equal(review.origen,'DIRECTA_SIN_INSCRIPCION');assert.equal(review.datos.evento,a.nombre)
 const {contacto:contact}=await(await kine(`/api/kinesiologia/resultados/${evaluacionId}/contacto`)).json();assert.equal(contact.datos.evento,a.nombre)
 const listed=(await(await admin('/api/eventos')).json()).eventos.find(e=>e.id===a.id);assert.equal(listed.fechaProtegida,true)
 const nextDate=new Date(Date.parse(a.fecha+'T00:00:00Z')+86400000).toISOString().slice(0,10)
 const edited=await admin(`/api/eventos/${a.id}`,{...post({nombre:a.nombre,fecha:nextDate,lugar:a.lugar,cupos:a.cupos,revision:listed.revision}),method:'PATCH'});assert.equal(edited.status,409)
 assert.equal(mails.length,beforeMails,'Guardar contexto no publica ni envía correos')
 console.log('OK contexto: evento obligatorio, origen derivado, permisos, consentimiento contextual, totales directos sin duplicar inscripciones y fecha protegida; cero envíos.')
}
