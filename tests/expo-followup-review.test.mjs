import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {reviewFollowup,summarizeFollowup,sourceSnapshot,FOLLOWUP_TIME} from '../scripts/lib/expo-followup-review.mjs'
import {parseFollowupArgs,FOLLOWUP_SQL,FOLLOWUP_ORDERS_SQL,followupHtml} from '../scripts/preparar-seguimiento-expo.mjs'
import {contactSnapshotHash} from '../src/lib/results/contact-policy.ts'
import {PRIVACY_VERSION} from '../src/lib/privacy/policy.ts'
import {REFERENCE_VERSION,LEGACY_REFERENCE_VERSION} from '../src/lib/craneometry-reference.ts'

function fixture(){
 const row={id:'fake-evaluation',revision:1,pacienteId:'fake-baby',createdAt:'2026-11-20T14:00:00.000Z',autorId:'fake-kine',anteroposterior:140,biparietal:120,diagonalIzq:135,diagonalDer:138,medicionesComplementarias:{protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:125,distanciaPOEtragusIzq:128},indiceCraneal:85.71428571428571,indiceAsimetria:3,diagnostico:'Diagnóstico original guardado',recomendacion:'Texto original guardado',kinesiologa:'Profesional ficticia',paciente:{nombre:'Bebé ficticio',fechaNacimiento:'2026-01-01',apoderadoId:null,revisionDatos:1},autor:{id:'fake-kine',name:'Profesional ficticia',active:true,role:'KINESIOLOGO',mustChangePassword:false},autorizacion:{id:'fake-permission',revision:1,pacienteId:'fake-baby',eventoId:null,apoderadoId:null,datos:true,versionTexto:PRIVACY_VERSION,correoResultados:false,seguimiento:false},declarante:'Apoderado ficticio',evidenciaPrivacidad:{revision:1,nueva:{datos:true,correoResultados:false,seguimiento:false}},inscripcion:null,eventoNombre:null,correo:'family@example.test',publicacion:null,copias:[]}
 const hashDatos=contactSnapshotHash(sourceSnapshot(row)),contexto=contactSnapshotHash({id:row.id,revision:1,email:row.correo,guardian:row.declarante,hashDatos,contactRevision:null,patientRevision:1,authorizationId:row.autorizacion.id,authorizationRevision:1})
 const previous={evaluacionId:row.id,revision:1,key:'old-batch-key',correo:row.correo,hashDatos,contexto,datos:{protocolo:REFERENCE_VERSION,indicadores:[{nombre:'CI',valor:'85,7 %',clasificacion:'Braquicefalia leve'},{nombre:'CVA',valor:'3 mm',clasificacion:'Leve'}]},indicadoresOmitidos:[]}
 return {row,previous,receipt:{status:'ACCEPTED',key:previous.key,revision:1,providerId:'<fake@brevo.test>'},mail:{clave:previous.key,finalidad:'RESULTADO',estado:'ACEPTADO',proveedorId:'fake@brevo.test',destinatarioClave:'hash-ficticio',entrega:'ENTREGADO'},recipientHash:'hash-ficticio',draftId:'fake-new-draft'}
}
test('seguimiento: autorización anterior no se hereda y ningún caso queda listo para enviar',()=>{
 const f=fixture(),before=structuredClone(f),r=reviewFollowup(f)
 assert.equal(r.tecnicamenteDisponible,true);assert.equal(r.elegibleParaEnvio,false)
 assert(r.aprobacionesPendientes.includes('AUTORIZACION_SEGUIMIENTO_PENDIENTE'));assert(r.aprobacionesPendientes.includes('CONTENIDO_CLINICO_PENDIENTE'))
 assert.notEqual(r.candidateId,f.previous.key);assert.equal(r.candidateId.includes('20261130'),true);assert.deepEqual(f,before)
 assert.equal(Object.hasOwn(r,'message'),false);assert.equal(Object.hasOwn(r,'scheduledAt'),false);assert.equal(FOLLOWUP_TIME,'2026-11-30T13:00:00.000Z')
})
test('seguimiento: valores y etiquetas originales históricos se copian sin reclasificar ni inventar DPOE/CVAI',()=>{
 const f=fixture();f.previous.datos.protocolo=LEGACY_REFERENCE_VERSION
 const original=structuredClone(f.previous.datos.indicadores),r=reviewFollowup(f)
 assert.deepEqual(r.indicadores,original);assert.deepEqual(r.indicadores.map(i=>i.nombre),['CI','CVA'])
 f.previous.datos.indicadores.push({nombre:'DPOE',valor:'3 mm',clasificacion:'Normal'});assert(reviewFollowup(f).bloqueos.includes('SIN_INDICADORES_VALIDOS'))
})
test('seguimiento: omite solo indicadores pendientes y conserva los demás',()=>{
 const f=fixture();f.previous.datos.indicadores.push({nombre:'DPOE',valor:'5 mm',clasificacion:'Límite por confirmar'})
 const r=reviewFollowup(f);assert.equal(r.indicadores.length,2);assert.deepEqual(r.indicadoresOmitidos,['DPOE']);assert.equal(r.tecnicamenteDisponible,true)
 f.previous.datos.indicadores=[{nombre:'CI',valor:'x',clasificacion:'Pendiente'}];assert(reviewFollowup(f).bloqueos.includes('SIN_INDICADORES_VALIDOS'))
})
test('seguimiento: supresión, rebotes y quejas bloquean incluso con aceptación anterior',()=>{
 for(const [delivery,code] of [['REBOTE','REBOTE_PERMANENTE'],['REBOTE_TEMPORAL','REBOTE_TEMPORAL'],['QUEJA','QUEJA']]){const f=fixture();f.mail.entrega=delivery;const r=reviewFollowup(f);assert(r.bloqueos.includes(code));assert(!r.bloqueos.includes('ENVIO_ANTERIOR_NO_CONCILIADO'))}
 const f=fixture();f.suppression={motivo:'QUEJA'};assert(reviewFollowup(f).bloqueos.includes('DESTINATARIO_SUPRIMIDO'))
})
test('seguimiento: cambios de revisión, destinatario, identidad, medidas y contexto bloquean',()=>{
 for(const mutate of [f=>f.row.revision++,f=>{f.row.correo='another@example.test'},f=>{f.row.paciente.nombre='Otro nombre'},f=>f.row.diagonalIzq++,f=>f.row.paciente.revisionDatos++,f=>f.row.autorizacion.revision++]){const f=fixture();mutate(f);assert.equal(reviewFollowup(f).tecnicamenteDisponible,false)}
})
test('seguimiento: retiro, permisos revocados, profesional inactivo y entregas inciertas bloquean',()=>{
 for(const [mutate,code] of [[f=>{f.row.publicacion={estado:'RETIRADO',revision:1,versionActual:1}},'RESULTADO_RETIRADO'],[f=>{f.row.autorizacion.datos=false},'DATOS_NO_AUTORIZADOS'],[f=>{f.row.autor.active=false},'AUTORIA_NO_VIGENTE'],[f=>{f.mail.estado='REVISION'},'ENVIO_ANTERIOR_NO_CONCILIADO'],[f=>{f.receipt.providerId='other@brevo.test'},'ENVIO_ANTERIOR_NO_CONCILIADO'],[f=>{f.mail.destinatarioClave='otro'},'ENVIO_ANTERIOR_NO_CONCILIADO'],[f=>{f.orders=[{etapa:'SEMANA'}]},'SEGUIMIENTO_EXISTENTE']]){const f=fixture();mutate(f);assert(reviewFollowup(f).bloqueos.includes(code))}
})
test('seguimiento: compartir correo conserva bebés distintos, sin aprobarlos',()=>{
 const a=reviewFollowup(fixture()),b={...a,evaluacionId:'other',pacienteId:'other',candidateId:'other'};const s=summarizeFollowup([a,b]);assert.equal(s.evaluaciones,2);assert.equal(s.destinatariosTecnicos,1);assert.equal(s.tecnicamenteDisponibles,2);assert.equal(s.elegiblesParaEnvio,0);assert.throws(()=>summarizeFollowup([a,a]),/DUPLICATE/)
})
test('preparador: no acepta opciones de envío o cambios de base implícitos',()=>{
 for(const a of [[],['--send'],['--schedule'],['--database-env','.env.local'],['--database-env','.env.vercel-ensayo','--approve','yes']])assert.throws(()=>parseFollowupArgs(a))
 assert(parseFollowupArgs(['--database-env','.env.vercel-ensayo']).databaseFile.endsWith('.env.vercel-ensayo'))
})
test('informe: HTML privado escapado y sin aprobación o programación implícita',()=>{
 const r=reviewFollowup(fixture());r.bebe='<script>private</script>'
 const html=followupHtml({horarioPropuestoUTC:FOLLOWUP_TIME,whatsappOficial:'+56 9 5001 3333',preparadoAt:'2026-11-27',summary:summarizeFollowup([r]),rows:[r],anterioresAusentes:[],digest:'fake'})
 assert(html.includes('NO PROGRAMADO · NO ENVIADO · NO APROBADO'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>private'));assert(html.includes('Content-Security-Policy'))
})
test('consultas: esquema completo, permisos seguimiento, versiones, órdenes y transacción de solo lectura',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite()
 try{await db.waitReady;const base=new URL('../prisma/migrations/',import.meta.url);for(const x of(await readdir(base,{withFileTypes:true})).filter(x=>x.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await db.exec(await readFile(new URL(x.name+'/migration.sql',base),'utf8'))
 await db.exec('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.deepEqual((await db.query(FOLLOWUP_SQL)).rows,[]);assert.deepEqual((await db.query(FOLLOWUP_ORDERS_SQL,[[]])).rows,[]);assert.match(FOLLOWUP_SQL,/'seguimiento',a.seguimiento/);assert.match(FOLLOWUP_SQL,/versionActual/);await assert.rejects(db.query('UPDATE "Evento" SET nombre=nombre'),e=>e.code==='25006');await db.exec('ROLLBACK')
 }finally{await db.close()}
})
