import assert from 'node:assert/strict'
import {readFile,readdir,realpath,mkdir,chmod,open,lstat} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash,randomUUID} from 'node:crypto'
import {parse} from 'dotenv'
import {Client,types as pgTypes} from 'pg'
import {EXPO_REVIEW_SQL,escape} from './preparar-resultados-expo.mjs'
import {validateResultBatch} from '../src/lib/results/expo-scheduled-message.ts'
import {contactSnapshotHash} from '../src/lib/results/contact-policy.ts'
import {recipientKey} from '../src/lib/mail/webhook-policy.ts'
import {readPrivate,durableWrite} from './lib/daily-reminders.mjs'
import {reviewFollowup,summarizeFollowup,reasons,FOLLOWUP_TIME,FOLLOWUP_WHATSAPP} from './lib/expo-followup-review.mjs'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
export function parseFollowupArgs(args){
 assert(args.length===2&&args[0]==='--database-env'&&args[1]==='.env.vercel-ensayo','Solo preparación: --database-env .env.vercel-ensayo. No hay opciones de envío o programación.')
 return {databaseFile:resolve(root,args[1])}
}
// Se reutiliza la consulta de alcance original; solo se amplían campos de lectura.
export const FOLLOWUP_SQL=EXPO_REVIEW_SQL
 .replace("'correoResultados',a.\"correoResultados\")","'correoResultados',a.\"correoResultados\",'seguimiento',a.seguimiento)")
 .replace("c.declarante,c.referencia", "(SELECT jsonb_build_object('revision',cp.revision,'nueva',cp.nueva) FROM \"CambioPrivacidad\" cp WHERE cp.\"autorizacionId\"=a.id AND cp.revision=a.revision LIMIT 1) \"evidenciaPrivacidad\", c.declarante,c.referencia")
 .replace("jsonb_build_object('estado',rp.estado)","jsonb_build_object('estado',rp.estado,'revision',rp.revision,'versionActual',rp.\"versionActual\")")
export const FOLLOWUP_ORDERS_SQL=`SELECT rp."evaluacionId",o.id,o.version,o.estado,o.etapa,o."proveedorId",o.entrega FROM "OrdenCorreo" o JOIN "ResultadoPublicado" rp ON rp.id=o."publicacionId" WHERE rp."evaluacionId"=ANY($1::text[]) AND o.etapa='SEMANA'`
export function followupHtml(manifest){
 const labels=codes=>codes.map(c=>escape(reasons[c]??c)).join('<br>')
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Revisión privada de seguimiento Casku</title><style>body{font:15px/1.6 Arial,sans-serif;color:#0d2123;background:#fffef8;max-width:1400px;margin:30px auto;padding:20px}h1,h2{color:#004e58}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d0dfdd;padding:12px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th,.box{background:#eff6f5}.box{padding:20px}.scroll{overflow:auto}</style></head><body><h1>Seguimiento Expo Bebé-Niño · Revisión privada</h1><p class="box"><strong>NO PROGRAMADO · NO ENVIADO · NO APROBADO</strong><br>Horario propuesto: lunes 30/11/2026, 10:00 America/Santiago (${escape(manifest.horarioPropuestoUTC)}).<br>WhatsApp oficial para uso posterior: ${escape(manifest.whatsappOficial)}.<br>Revisión: ${escape(manifest.preparadoAt)}.</p><p>${manifest.summary.evaluaciones} evaluaciones; ${manifest.summary.destinatariosValidos} correos distintos. ${manifest.summary.tecnicamenteDisponibles} casos técnicamente disponibles y ${manifest.summary.bloqueados} bloqueados. <strong>Elegibles para envío ahora: 0.</strong></p><p>La autorización colectiva y el contenido del 23/11 no se transfieren a esta comunicación. No se crean consentimientos. La coincidencia con ese lote acredita su alcance previo; las evaluaciones sin inscripción no se asignan retrospectivamente a un evento.</p><h2>Bloqueos técnicos</h2><ul>${Object.entries(manifest.summary.bloqueos).map(([k,n])=>`<li>${n}: ${escape(reasons[k])}</li>`).join('')}</ul><h2>Aprobaciones pendientes</h2><ul>${Object.entries(manifest.summary.aprobacionesPendientes).map(([k,n])=>`<li>${n}: ${escape(reasons[k])}</li>`).join('')}</ul><p>No se excluyen automáticamente resultados normales: el criterio clínico de destinatarios debe ser aprobado. No se recalculan fórmulas, históricos ni clasificaciones. Se conservan los indicadores originales de la copia anterior; los cambios de versión bloquean su utilización hasta revisión.</p><h2>Detalle privado</h2><div class="scroll"><table><thead><tr><th>Referencia y bebé</th><th>Destinatario</th><th>Resultado original</th><th>Envío anterior</th><th>Revisión</th></tr></thead><tbody>${manifest.rows.map(r=>`<tr><td>${escape(r.bebe)}<br>${escape(r.evaluacionId)} · r${r.revision}<br>${escape(r.fechaEvaluacion)}</td><td>${escape(r.correo??'No válido')}<br>${r.incidencias.includes('APODERADO_SIN_NOMBRE_REAL')?'Nombre real de apoderado no registrado':''}</td><td>${r.indicadores.map(i=>`${escape(i.nombre)}: ${escape(i.valor)} · ${escape(i.clasificacion)}`).join('<br>')}<br>Omitidos: ${r.indicadoresOmitidos.map(escape).join(', ')||'ninguno'}<br>${escape(r.protocolo??'Sin referencia')}</td><td>${escape(r.anterior?.estado??'Sin evidencia')} / ${escape(r.anterior?.entrega??'Sin evidencia')}<br>Revisión original: ${r.anterior?.revision??'—'}</td><td><strong>${escape(r.estado)}</strong><br>${labels(r.bloqueos)}<br>${labels(r.aprobacionesPendientes)}</td></tr>`).join('')}</tbody></table></div><p>Evaluaciones del lote anterior ausentes en la consulta actual: ${manifest.anterioresAusentes.length}. Consultar sus referencias en el JSON privado antes de decidir su inclusión.</p><p>Fuentes: transacción PostgreSQL de solo lectura, permisos actuales, supresiones y registros de entrega; las entregas no se vuelven a consultar en Brevo durante este preparador. Huella: ${escape(manifest.digest)}.</p></body></html>`
}
export async function main(args=process.argv.slice(2)){
 const options=parseFollowupArgs(args),priorDir=resolve(root,'test-results/resultados-expo-20261123/programacion')
 const plan=await readPrivate(resolve(priorDir,'plan.json'));validateResultBatch(plan)
 assert.equal(plan.hash,'31fc38b2af57bfe872b5c3ba2dced563aa01f15cff75b7ee8e91329242dc497f','La referencia anterior cambió')
 const receipts=await Promise.all((await readdir(priorDir)).filter(f=>/^attempt-.*\.json$/.test(f)).map(f=>readPrivate(resolve(priorDir,f))))
 assert.equal(receipts.length,plan.items.length);assert.equal(new Set(receipts.map(r=>r.key)).size,receipts.length)
 for(const r of receipts){assert.equal(r.planHash,plan.hash);assert.equal(r.databaseFingerprint,plan.databaseFingerprint);assert(plan.items.some(i=>i.key===r.key&&i.evaluacionId===r.evaluacionId&&i.revision===r.revision))}
 const env=parse(await readFile(options.databaseFile)),secret=parse(await readFile(resolve(root,'.env.brevo-activacion'))).CASKU_MAIL_SUPPRESSION_SECRET
 assert(secret?.length>=32,'Falta clave de supresiones');assert(env.DATABASE_URL,'Falta conexión explícita')
 assert.equal(createHash('sha256').update(env.DATABASE_URL).digest('hex'),plan.databaseFingerprint,'Destino operativo distinto al lote revisado')
 const db=new Client({connectionString:env.DATABASE_URL,types:{getTypeParser:(oid,format)=>oid===1114&&format!=='binary'?v=>new Date(v.replace(' ','T')+'Z'):pgTypes.getTypeParser(oid,format)},connectionTimeoutMillis:15000,application_name:'casku_preparar_seguimiento_SOLO_LECTURA'})
 let sources,ledger,suppressed,orders,newLedger
 try{
  await db.connect();await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'")
  assert.equal((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on')
  sources=(await db.query(FOLLOWUP_SQL)).rows.map(r=>({...r,createdAt:r.createdAt.toISOString()}))
  const recipientHashes=sources.filter(r=>typeof r.correo==='string').map(r=>recipientKey(r.correo,secret))
  ledger=(await db.query('SELECT clave,finalidad,estado,"proveedorId","destinatarioClave",entrega FROM "EnvioTransaccional" WHERE clave=ANY($1::text[])',[plan.items.map(i=>i.key)])).rows
  suppressed=(await db.query('SELECT clave,motivo FROM "SupresionCorreo" WHERE clave=ANY($1::text[])',[recipientHashes])).rows
  orders=(await db.query(FOLLOWUP_ORDERS_SQL,[sources.map(r=>r.id)])).rows
  newLedger=(await db.query('SELECT clave,estado,"proveedorId" FROM "EnvioTransaccional" WHERE clave LIKE $1',['expo-followup-20261130-%'])).rows
  await db.query('COMMIT')
 }finally{await db.end()}
 const draftId=randomUUID(),prior=new Map(plan.items.map(i=>[i.evaluacionId,i])),receiptMap=new Map(receipts.map(r=>[r.key,r])),mailMap=new Map(ledger.map(m=>[m.clave,m])),suppressionMap=new Map(suppressed.map(s=>[s.clave,s]))
 const rows=sources.map(row=>{const previous=prior.get(row.id),rh=typeof row.correo==='string'?recipientKey(row.correo,secret):null;return reviewFollowup({row,previous,receipt:receiptMap.get(previous?.key),mail:mailMap.get(previous?.key),suppression:suppressionMap.get(rh),recipientHash:rh,orders:[...orders.filter(o=>o.evaluacionId===row.id),...newLedger],draftId})})
 const summary=summarizeFollowup(rows),missing=plan.items.filter(i=>!sources.some(r=>r.id===i.evaluacionId)).map(i=>({evaluacionId:i.evaluacionId,motivo:'REFERENCIA_ANTERIOR_SIN_FICHA'}))
 assert(!rows.some(r=>plan.items.some(i=>i.key===r.candidateId)),'Identificadores reutilizados')
 const core={version:1,tipo:'REVISION_SEGUIMIENTO_SIN_ENVIO',draftId,etapa:'SEMANA',evento:'Expo Bebé-Niño Noviembre 2026',horarioPropuestoUTC:FOLLOWUP_TIME,zona:'America/Santiago',whatsappOficial:FOLLOWUP_WHATSAPP,preparadoAt:new Date().toISOString(),referenciaAnterior:{hash:plan.hash,lote:plan.batchId,mensajes:plan.items.length,soloReferencia:true},databaseFingerprint:plan.databaseFingerprint,aprobaciones:{contenidoClinico:null,autorizacionNuevaComunicacion:null,reglaDestinatarios:null},capacidades:{programar:false,enviar:false,modificarBase:false},summary,anterioresAusentes:missing,rows}
 const manifest={...core,digest:contactSnapshotHash(core)}
 const base=resolve(root,'test-results');await mkdir(base,{recursive:true});assert.equal(await realpath(base),base)
 const folder=resolve(base,'seguimiento-expo-20261130');await mkdir(folder,{recursive:true,mode:0o700});assert.equal(await realpath(folder),folder);assert(!(await lstat(folder)).isSymbolicLink());await chmod(folder,0o700)
 const stem=resolve(folder,'revision-'+draftId)
 for(const [ext,body] of [['json',JSON.stringify(manifest,null,2)],['html',followupHtml(manifest)]]){const h=await open(stem+'.'+ext,'wx',0o600);try{await h.writeFile(body);await h.sync()}finally{await h.close()}}
 await durableWrite(resolve(folder,'ultima-revision.json'),{archivo:stem+'.json',digest:manifest.digest,draftId,summary,programado:false,enviado:false})
 return {estado:'PREPARADO_NO_APROBADO_NO_PROGRAMADO',...summary,anterioresAusentes:missing.length,horarioPropuestoUTC:FOLLOWUP_TIME,informe:stem+'.html',huella:manifest.digest,modificacionesDB:0,envios:0}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(JSON.stringify({estado:'PREPARACION_DETENIDA',motivo:e instanceof assert.AssertionError?'VALIDACION_DE_FUENTES':e.code||e.name,modificacionesDB:0,envios:0}));process.exitCode=1})
