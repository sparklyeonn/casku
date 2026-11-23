import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID,createHmac} from 'node:crypto'
import {calcularReferencia,REFERENCE_VERSION,LEGACY_REFERENCE_VERSION} from '../src/lib/craneometry-reference.ts'
import {reviewExpoResult,EXPO_BATCH_TIME} from '../src/lib/results/expo-batch-review.ts'
import {approvedExpoItem,validateResultBatch,expoResultKey} from '../src/lib/results/expo-scheduled-message.ts'
import {contactSnapshotHash} from '../src/lib/results/contact-policy.ts'
import {PRIVACY_VERSION} from '../src/lib/privacy/policy.ts'
import {brevoPayload} from '../src/lib/mail/brevo.ts'
import {recipientKey} from '../src/lib/mail/webhook-policy.ts'
import {scheduleResultBatch} from '../scripts/lib/result-batch-scheduler.mjs'
import {readPrivate} from '../scripts/lib/daily-reminders.mjs'
import {parseResultBatchArgs} from '../scripts/programar-resultados-expo.mjs'
const frozen=Date.parse('2026-11-23T02:00:00Z')
function source(n=0,historical=false){
 const m={ap:140,bp:120,di:135,dd:138,protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:125,distanciaPOEtragusIzq:128},v=calcularReferencia(m)
 return {id:'fake-eval-'+n,revision:1,pacienteId:'fake-patient-'+n,createdAt:'2026-11-22T15:00:00.000Z',autorId:'fake-author',anteroposterior:140,biparietal:120,diagonalIzq:135,diagonalDer:138,medicionesComplementarias:historical?{protocolo:LEGACY_REFERENCE_VERSION,desviacionDer:2,desviacionIzq:3}:{protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:125,distanciaPOEtragusIzq:128},indiceCraneal:v.ci,indiceAsimetria:v.cva,diagnostico:historical?'Orientación preliminar: Braquicefalia leve. Plagiocefalia: CVA leve; DPOE normal. CVAI y clasificación conjunta pendientes de confirmación clínica.':v.diagnostico,recomendacion:historical?'Texto histórico que no debe aparecer en este correo':v.recomendacion,kinesiologa:'Profesional ficticia',paciente:{nombre:'Bebé ficticio '+n,fechaNacimiento:'2026-01-01',apoderadoId:null,revisionDatos:1},autor:{id:'fake-author',name:'Profesional ficticia',active:true,role:'KINESIOLOGO',mustChangePassword:false},autorizacion:{id:'fake-authorization-'+n,revision:1,pacienteId:'fake-patient-'+n,eventoId:null,apoderadoId:null,datos:true,versionTexto:PRIVACY_VERSION,correoResultados:false},declarante:'Apoderado presente sin nombre',referenciaAutorizacion:null,canalAutorizacion:'CASILLA_PRESENCIAL',inscripcion:null,eventoNombre:null,correo:n===1?'family-0@example.test':`family-${n}@example.test`,publicacion:null,copias:[]}
}
const itemFor=s=>approvedExpoItem(s,reviewExpoResult(s,false,{omitUnconfirmed:true}))
function planFor(){const core={version:1,batchId:randomUUID(),scheduledAt:EXPO_BATCH_TIME,databaseFingerprint:'a'.repeat(64),approval:{confirmed:true,authority:'Equipo Casku, Administración',count:95,legacy:'SOLO_CI_CVA_ORIGINALES',omitUnconfirmed:true},items:Array.from({length:95},(_,n)=>itemFor(source(n,n<24)))};return {...core,hash:contactSnapshotHash(core)}}
test('lote final: históricos solo CI/CVA originales, sin convertir ni incluir otros indicadores',()=>{
 const s=source(0,true),before=structuredClone(s),x=itemFor(s)
 assert.deepEqual(x.datos.indicadores.map(i=>i.nombre),['CI','CVA']);assert.match(x.message.text,/85,7 %/);assert.match(x.message.text,/Clasificación: Braquicefalia leve/)
 assert(!x.message.text.includes('CVAI'));assert(!x.message.text.includes('DPOE'));assert(!x.message.html.includes('DPOE'));assert(!x.message.text.includes('Texto histórico'));assert.deepEqual(s,before)
})
test('lote final: también omite un CI histórico por confirmar y conserva al bebé con su CVA',()=>{
 const s=source(0,true);s.diagnostico=s.diagnostico.replace('Braquicefalia leve','Límite por confirmar con Casku')
 const x=itemFor(s);assert.deepEqual(x.datos.indicadores.map(i=>i.nombre),['CVA']);assert.deepEqual(x.indicadoresOmitidos,['CI']);assert(!x.message.text.includes('por confirmar'))
})
test('lote final: no recalcula una clasificación histórica ni admite cambios de fuente',()=>{
 const s=source(0,true);s.diagnostico=s.diagnostico.replace('Braquicefalia leve','Braquicefalia moderada')
 assert.equal(itemFor(s).datos.indicadores[0].clasificacion,'Braquicefalia moderada')
 const expected=reviewExpoResult(s);s.correo='other@example.test';assert.throws(()=>approvedExpoItem(s,expected),/SOURCE_CHANGED/)
})
test('lote final: revocación de datos y autoría inválida siguen bloqueadas pese a confirmación colectiva',()=>{
 for(const change of [s=>{s.autorizacion.datos=false},s=>{s.autor.active=false}]){const s=source();change(s);assert.throws(()=>itemFor(s),/SOURCE_NOT_ELIGIBLE/)}
})
test('lote final: 95 mensajes con un correo compartido, aprobación sellada y sin datos de más',()=>{
 const p=planFor();validateResultBatch(p);assert.equal(new Set(p.items.map(x=>x.correo)).size,94)
 assert(p.items.every(i=>!i.message.text.includes('Apoderado presente sin nombre')))
 assert(p.items.every(i=>!i.message.text.includes('2026-01-01')))
 assert.equal(p.items[0].key,expoResultKey(p.items[0].evaluacionId,1))
 p.approval.confirmed=false;p.hash=contactSnapshotHash(Object.fromEntries(Object.entries(p).filter(([k])=>k!=='hash')));assert.throws(()=>validateResultBatch(p),/MISSING_SCOPED/)
})
test('lote final: nombres se escapan y el cierre aprobado se conserva',()=>{
 const s=source();s.paciente.nombre='<img src=x onerror=evil>';const x=itemFor(s)
 assert(x.message.html.includes('&lt;img src=x onerror=evil&gt;'));assert(!x.message.html.includes('<img src=x onerror=evil>'))
 assert(x.message.text.endsWith('Si tienes dudas sobre el resultado o las indicaciones, puedes escribirnos a contacto@casku.cl.\n\nGracias por confiar en nosotros,\n\nEquipo Casku\nExpo Bebé-Niño · Noviembre 2026'))
})
async function context(t){
 t.mock.method(Date,'now',()=>frozen)
 const dir=await mkdtemp(join(tmpdir(),'expo-result-batch-test-'));t.after(()=>rm(dir,{recursive:true,force:true}))
 const plan=planFor(),rows=new Map(),suppressed=new Set(),posts=[]
 const config={baseUrl:'https://api.brevo.com',key:'fake',secret:'x'.repeat(40),suppressionSecret:'y'.repeat(40),sender:{email:'sender@example.test',name:'Casku'},testRecipients:['operator@example.test']}
 let uncertain=false,failDB=false,failSource=false,queueState='queued'
 const db={supresionCorreo:{findUnique:async({where})=>suppressed.has(where.clave)?{}:null},envioTransaccional:{findUnique:async({where})=>rows.get(where.clave)||null,updateMany:async({where,data})=>{const row=rows.get(where.clave);if(!row||where.hashMensaje&&where.hashMensaje!==row.hashMensaje||typeof where.estado==='string'&&where.estado!==row.estado||where.estado?.in&&!where.estado.in.includes(row.estado)||where.proveedorId!==undefined&&where.proveedorId!==row.proveedorId)return{count:0};Object.assign(row,data);return{count:1}}}}
 const fetcher=async(url,options)=>{if(options.method==='GET')return new Response(JSON.stringify({status:queueState,scheduledAt:plan.scheduledAt}));posts.push(JSON.parse(options.body));if(uncertain)throw Error('MOCK_TIMEOUT');return new Response(JSON.stringify({messageId:`<fake-${posts.length}@example.test>`}),{status:201})}
 const deliver=async(_db,message,key,purpose,cfg)=>{const payload=brevoPayload(message,cfg,key),row={estado:'ENVIANDO',intentos:1,proveedorId:null,finalidad:purpose,hashMensaje:createHmac('sha256',config.secret).update(JSON.stringify({purpose,payload})).digest('hex'),destinatarioClave:recipientKey(message.to,config.suppressionSecret)};rows.set(key,row);const response=await globalThis.fetch(config.baseUrl+'/v3/smtp/email',{method:'POST',body:JSON.stringify(payload)});const x=await response.json();assert.equal((await readPrivate(join(dir,'attempt-'+key+'.json'))).providerId,x.messageId);if(failDB){failDB=false;throw Error('MOCK_ACCEPTANCE_DB_FAILURE')};row.estado='ACEPTADO';row.proveedorId=x.messageId;return x.messageId}
 const run=overrides=>scheduleResultBatch({dir,plan,approval:plan.hash,db,config,deliver,payloadFor:brevoPayload,recipientFor:recipientKey,fetcher,revalidate:async()=>{if(failSource)throw Error('SOURCE_CHANGED')},revalidateItem:async()=>{},now:()=>frozen,...overrides})
 return{dir,db,plan,posts,rows,suppressed,config,run,uncertain:()=>{uncertain=true},failDB:()=>{failDB=true},failSource:()=>{failSource=true},unqueue:()=>{queueState='sent'}}
}
test('lote final: una supresión en el último caso bloquea todos los POST',async t=>{const c=await context(t);c.suppressed.add(recipientKey(c.plan.items[94].correo,c.config.suppressionSecret));await assert.rejects(c.run(),/RECIPIENT_SUPPRESSED/);assert.equal(c.posts.length,0)})
test('lote final: cambio de fuente y horario vencido nunca producen envío inmediato',async t=>{const c=await context(t);c.failSource();await assert.rejects(c.run(),/SOURCE_CHANGED/);assert.equal(c.posts.length,0);await assert.rejects(c.run({now:()=>Date.parse(EXPO_BATCH_TIME)}),/OUTSIDE_SCHEDULE_WINDOW/)})
test('lote final: 95 aceptaciones persistidas, programación exacta y reintento solo consulta',async t=>{const c=await context(t),original=globalThis.fetch;const first=await c.run();assert.equal(first.accepted,95);assert.equal(first.queued,95);assert.equal(globalThis.fetch,original);assert(c.posts.every(p=>p.to.length===1&&!p.cc&&!p.bcc&&p.scheduledAt===EXPO_BATCH_TIME&&p.batchId===c.plan.batchId));const second=await c.run();assert.equal(second.reused,95);assert.equal(c.posts.length,95);assert.equal(c.config.testRecipients.length,1)})
test('lote final: caída tras aceptación se recupera desde el recibo sin repetir el mensaje',async t=>{const c=await context(t);c.failDB();await assert.rejects(c.run(),/MOCK_ACCEPTANCE_DB_FAILURE/);assert.equal(c.posts.length,1);const x=await c.run();assert.equal(x.recovered,1);assert.equal(x.reused,1);assert.equal(c.posts.length,95)})
test('lote final: aceptación incierta impide otro POST y restaura el transporte',async t=>{const c=await context(t),original=globalThis.fetch;c.uncertain();await assert.rejects(c.run());assert.equal(c.posts.length,1);assert.equal(globalThis.fetch,original);await assert.rejects(c.run(),/ACCEPTANCE_UNCERTAIN/);assert.equal(c.posts.length,1)})
test('lote final: aprobación alterada y opciones ambiguas se rechazan',()=>{const p=planFor();p.items[0].message.to='other@example.test';assert.throws(()=>validateResultBatch(p),/APPROVAL_MISMATCH/);for(const args of [[],['--send-now'],['--schedule','--database-env','x','--approve','bad']])assert.throws(()=>parseResultBatchArgs(args));assert.equal(parseResultBatchArgs(['--schedule','--database-env','x','--approve','a'.repeat(64)]).mode,'schedule')})

test('lote final: cancelación individual confirmada libera edición y no envía ni cancela otros correos',async t=>{
 const c=await context(t);await c.run()
 const {cancelScheduledExpoItem}=await import('../scripts/lib/result-batch-scheduler.mjs')
 const item=c.plan.items[0],calls=[]
 const fetcher=async(url,options)=>{calls.push(options.method);return options.method==='GET'?new Response(JSON.stringify({status:'queued',scheduledAt:c.plan.scheduledAt})):new Response(null,{status:204})}
 const result=await cancelScheduledExpoItem({dir:c.dir,plan:c.plan,item,db:c.db,config:c.config,fetcher})
 assert.equal(result.status,'CANCELACION_VERIFICADA');assert.deepEqual(calls,['GET','DELETE']);assert.equal(c.posts.length,95)
 assert.equal(c.rows.get(item.key).estado,'RECHAZADO');assert.equal(c.rows.get(c.plan.items[1].key).estado,'ACEPTADO')
 await cancelScheduledExpoItem({dir:c.dir,plan:c.plan,item,db:c.db,config:c.config,fetcher});assert.deepEqual(calls,['GET','DELETE'])
})
