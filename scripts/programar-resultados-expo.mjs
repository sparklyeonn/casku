import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {resolve,dirname,basename} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash,randomUUID} from 'node:crypto'
import {parse} from 'dotenv'
import {Client,types as pgTypes} from 'pg'
import {EXPO_REVIEW_SQL} from './preparar-resultados-expo.mjs'
import {approvedExpoItem,validateResultBatch,EXPO_TEMPLATE,EXPO_LOGO} from '../src/lib/results/expo-scheduled-message.ts'
import {EXPO_BATCH_TIME} from '../src/lib/results/expo-batch-review.ts'
import {contactSnapshotHash} from '../src/lib/results/contact-policy.ts'
import {withLock,readPrivate,durableWrite,privateDir,assertWindow} from './lib/daily-reminders.mjs'
import {scheduleResultBatch} from './lib/result-batch-scheduler.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dir=resolve(root,'test-results/resultados-expo-20261123/programacion')
const check=(ok,code)=>{if(!ok)throw new Error(code)}
export function parseResultBatchArgs(args){
 if(args.length===7&&args[0]==='--prepare'&&args[1]==='--database-env'&&args[3]==='--review-file'&&args[5]==='--confirmation-file')return {mode:'prepare',databaseFile:args[2],reviewFile:args[4],confirmationFile:args[6]}
 if(args.length===5&&args[0]==='--schedule'&&args[1]==='--database-env'&&args[3]==='--approve'&&/^[a-f0-9]{64}$/.test(args[4]))return {mode:'schedule',databaseFile:args[2],hash:args[4]}
 throw new Error('INVALID_ARGUMENTS')
}
export async function currentSources(db,id){
 await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
 try{
  const sql=id?EXPO_REVIEW_SQL.replace('ORDER BY e."autorId",e."createdAt",e.id','AND e.id=$1 ORDER BY e."autorId",e."createdAt",e.id'):EXPO_REVIEW_SQL
  if(id)check(sql!==EXPO_REVIEW_SQL,'SINGLE_SOURCE_QUERY_INVALID')
  const result=await db.query(sql,id?[id]:undefined)
  await db.query('COMMIT')
  return result.rows.map(row=>({...row,createdAt:row.createdAt.toISOString()}))
 }catch(error){await db.query('ROLLBACK');throw error}
}
function sameItem(source,item){
 const next=approvedExpoItem(source,item)
 check(contactSnapshotHash(next)===contactSnapshotHash(item),'SOURCE_OR_TEMPLATE_CHANGED')
}
export async function main(args=process.argv.slice(2)){
 const options=parseResultBatchArgs(args)
 check(basename(options.databaseFile)==='.env.vercel-ensayo','EXPECTED_OPERATIONAL_DATABASE_FILE')
 const connectionString=parse(await readFile(resolve(root,options.databaseFile))).DATABASE_URL
 check(connectionString,'EXPLICIT_DATABASE_REQUIRED')
 const fingerprint=createHash('sha256').update(connectionString).digest('hex')
 const marker=JSON.parse(await readFile('/private/tmp/casku-ensayo-verified.json','utf8'))
 check(fingerprint===marker.target,'OPERATIONAL_DATABASE_CHANGED')
 const pg=new Client({connectionString,types:{getTypeParser:(oid,format)=>oid===1114&&format!=='binary'?value=>new Date(value.replace(' ','T')+'Z'):pgTypes.getTypeParser(oid,format)},connectionTimeoutMillis:15000,application_name:'casku_programacion_lote_resultados'})
 await pg.connect()
 try{
  await privateDir(dir)
  if(options.mode==='prepare')return await withLock(dir,async()=>{
   const review=await readPrivate(resolve(root,options.reviewFile)),{digest,...original}=review
   check(createHash('sha256').update(JSON.stringify(original)).digest('hex')===digest,'REVIEW_CHANGED')
   const confirmation=await readPrivate(resolve(root,options.confirmationFile))
   check(confirmation.alcanceEvaluaciones===95&&confirmation.responsableDeclarado==='Equipo Casku, Administración'&&confirmation.huellaRevision===digest,'COLLECTIVE_DECLARATION_SCOPE_CHANGED')
   check(review.summary.total===95&&review.databaseFingerprint===fingerprint,'REVIEW_SCOPE_CHANGED')
   const sources=await currentSources(pg);check(sources.length===95,'COHORT_CHANGED')
   const expected=new Map(review.rows.map(row=>[row.evaluacionId,row]));check(expected.size===95,'DUPLICATE_EVALUATION')
   const items=sources.map(source=>{check(expected.has(source.id),'UNKNOWN_EVALUATION');return approvedExpoItem(source,expected.get(source.id))})
   let prior;try{prior=await readPrivate(resolve(dir,'plan.json'))}catch(error){if(error.code!=='ENOENT')throw error}
   if(prior){validateResultBatch(prior);check(prior.databaseFingerprint===fingerprint&&contactSnapshotHash(prior.items)===contactSnapshotHash(items),'FROZEN_BATCH_CHANGED');return {estado:'PLAN_EXISTENTE_VERIFICADO',hash:prior.hash,mensajes:95,programados:0}}
   const core={version:1,batchId:randomUUID(),scheduledAt:EXPO_BATCH_TIME,zona:'America/Santiago',template:EXPO_TEMPLATE,databaseFingerprint:fingerprint,createdAt:new Date().toISOString(),approval:{confirmed:true,authority:confirmation.responsableDeclarado,count:95,legacy:'SOLO_CI_CVA_ORIGINALES',omitUnconfirmed:true,source:'CONFIRMACION_USUARIO_EN_CHAT',declaration:confirmation.textoDeclarado,reviewHash:digest,confirmationHash:contactSnapshotHash(confirmation),finalInstruction:'De acuerdo, para esas 24 enviemos solo CI y CVA con los resultados originales. Mantén omitidos los indicadores «por confirmar» y sigamos con la programación de los 95 correos para mañana lunes a las 10:00.'},items}
   const plan={...core,hash:contactSnapshotHash(core)};validateResultBatch(plan);assertWindow(plan)
   await durableWrite(resolve(dir,'plan.json'),plan)
   return {estado:'PLAN_CONGELADO',hash:plan.hash,mensajes:95,direcciones:new Set(items.map(i=>i.correo)).size,historicos:items.filter(i=>i.datos.protocolo==='casku-pdf-borrador-v1').length,casosConIndicadoresOmitidos:items.filter(i=>i.indicadoresOmitidos.length).length,indicadoresOmitidos:items.reduce((n,i)=>n+i.indicadoresOmitidos.length,0),programadoAtUTC:plan.scheduledAt,envios:0}
  })
  const plan=await readPrivate(resolve(dir,'plan.json'));validateResultBatch(plan,options.hash);assertWindow(plan)
  check(plan.databaseFingerprint===fingerprint,'DATABASE_TARGET_CHANGED')
  const env=parse(await readFile(resolve(root,'.env.brevo-activacion'))),local=parse(await readFile(resolve(root,'.env.local')))
  for(const name of ['BREVO_API_KEY','BREVO_SENDER_EMAIL','BREVO_SENDER_NAME','BREVO_SENDER_VERIFIED','CASKU_MAIL_DELIVERY_SECRET','CASKU_MAIL_SUPPRESSION_SECRET','CASKU_CLINICAL_MAIL_ENABLED','BREVO_WEBHOOK_ENABLED','BREVO_WEBHOOK_SECRET'])process.env[name]=env[name]??local[name]??''
  process.env.BREVO_API_KEY=local.BREVO_API_KEY||env.BREVO_API_KEY
  Object.assign(process.env,{CASKU_MAIL_ENABLED:'1',CASKU_MAIL_MODE:'pruebas',CASKU_MAIL_TEST_RECIPIENTS:'connygonzalezlizama@gmail.com,cons.gonzalezl@duocuc.cl',CASKU_MAIL_AUTOMATION:'0'})
  const [{PrismaClient},{PrismaPg},{mailConfig,brevoPayload},{deliverOnce},{recipientKey}]=await Promise.all([import('@prisma/client'),import('@prisma/adapter-pg'),import('../src/lib/mail/brevo.ts'),import('../src/lib/mail/delivery-store.ts'),import('../src/lib/mail/webhook-policy.ts')])
  const config=mailConfig('RESULTADO');check(config.baseUrl==='https://api.brevo.com'&&config.sender.email==='contacto@casku.cl','INVALID_PROVIDER_RUNTIME')
  check(process.env.CASKU_TEST_MODE!=='1'&&process.env.CASKU_PRODUCTION_TEST!=='1','SIMULATOR_NOT_ALLOWED')
  const fetcher=globalThis.fetch
  const get=async path=>{const r=await fetcher(config.baseUrl+'/v3'+path,{method:'GET',headers:{'api-key':config.key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});check(r.ok,'BREVO_PREFLIGHT_GET_FAILED');return r.json()}
  const account=await get('/account');check(account.relay?.enabled===true&&account.plan?.some(p=>p.creditsType==='sendLimit'&&p.type!=='sms'&&Number(p.credits)>=95),'INSUFFICIENT_CONFIRMED_CREDITS')
  const senders=await get('/senders');check(senders.senders?.some(s=>s.email==='contacto@casku.cl'&&s.active===true),'SENDER_NOT_VERIFIED')
  const logo=await fetcher(EXPO_LOGO,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)});check(logo.ok&&logo.headers.get('content-type')?.includes('image/png'),'LOGO_UNAVAILABLE');await logo.arrayBuffer()
  const db=new PrismaClient({adapter:new PrismaPg({connectionString}),transactionOptions:{maxWait:15000,timeout:20000}})
  try{
   await db.$connect()
   await db.accesoPrivado.create({data:{actorId:'operacion:resultados-expo-20261123',perfilActor:'OPERACION_AUTORIZADA_CASKU',accion:'PROGRAMAR_LOTE_APROBADO',recurso:'LOTE_RESULTADOS',recursoId:plan.batchId}})
   const revalidate=async()=>{const sources=await currentSources(pg);check(sources.length===95,'COHORT_CHANGED');const map=new Map(sources.map(s=>[s.id,s]));for(const item of plan.items){check(map.has(item.evaluacionId),'EVALUATION_MISSING');sameItem(map.get(item.evaluacionId),item)}}
   const revalidateItem=async item=>{const sources=await currentSources(pg,item.evaluacionId);check(sources.length===1,'EVALUATION_MISSING');sameItem(sources[0],item)}
   const outcome=await scheduleResultBatch({dir,plan,approval:options.hash,db,config,deliver:deliverOnce,payloadFor:brevoPayload,recipientFor:recipientKey,fetcher,revalidate,revalidateItem,onProgress:({verified,total})=>{if(verified%10===0||verified===total)console.log(JSON.stringify({estado:"PROGRAMACION_EN_CURSO",verificados:verified,total}))}})
   await revalidate()
   await db.accesoPrivado.createMany({data:plan.items.map(item=>({actorId:'operacion:resultados-expo-20261123',perfilActor:'OPERACION_AUTORIZADA_CASKU',accion:'RESULTADO_PROGRAMADO_EXPO',recurso:'EVALUACION',recursoId:item.evaluacionId}))})
   await durableWrite(resolve(dir,'programacion-verificada.json'),{...outcome,verifiedAt:new Date().toISOString(),clinicalSourcesUnchanged:true})
   return {...outcome,clinicalSourcesUnchanged:true,cuentasFamiliaresCreadas:0,autorizacionesIndividualesModificadas:0}
  }finally{await db.$disconnect()}
 }finally{await pg.end()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(x=>console.log(JSON.stringify(x))).catch(error=>{console.error(JSON.stringify({estado:'DETENIDO_REVISAR_RECIBOS',motivo:error instanceof assert.AssertionError?error.message:error.code||error.name==='Error'&&error.message||error.name,programados:'CONSULTAR_RECIBOS_PRIVADOS'}));process.exitCode=1})
