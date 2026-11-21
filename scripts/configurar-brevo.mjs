import assert from 'node:assert/strict'
import {readFile,writeFile,chmod} from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
import {parse} from 'dotenv'
import {encodeEnvironment} from './lib/brevo-env.mjs'
const root=new URL('../',import.meta.url),file=new URL('.env.brevo-activacion',root)
const origin='https://casku-craneometrias.vercel.app',callback=origin+'/api/webhooks/brevo'
const events=['delivered','hardBounce','softBounce','spam']
async function request(path,env,options={}) {
 const r=await fetch('https://api.brevo.com/v3'+path,{...options,headers:{'api-key':env.BREVO_API_KEY,Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},redirect:'error',signal:AbortSignal.timeout(20000)})
 if(r.status===204)return null
 const body=await r.json()
 // Brevo devuelve document_not_found si aún no existe ningún webhook.
 if(!r.ok){if(path==='/webhooks?type=transactional'&&r.status===400&&body.code==='document_not_found')return {webhooks:[]};throw new Error('BREVO_HTTP_'+r.status)}
 return body
}
try {
 const action=process.argv[2];assert(['--prepare','--inspect','--create','--verify'].includes(action),'Elige --prepare, --inspect, --create o --verify')
 if(action==='--prepare') {
  const local=parse(await readFile(new URL('.env.local',root)))
  assert(local.BREVO_API_KEY&&local.BREVO_SENDER_EMAIL==='contacto@casku.cl'&&local.BREVO_SENDER_VERIFIED==='1','Falta remitente o clave verificada')
  const previous=await readFile(file).then(parse).catch(e=>{if(e.code!=='ENOENT')throw e;return {}})
  const env={BREVO_API_KEY:local.BREVO_API_KEY,BREVO_SENDER_EMAIL:local.BREVO_SENDER_EMAIL,BREVO_SENDER_NAME:local.BREVO_SENDER_NAME||'Casku',BREVO_SENDER_VERIFIED:'1',CASKU_MAIL_ENABLED:'1',CASKU_MAIL_MODE:'produccion',CASKU_MAIL_DELIVERY_SECRET:local.CASKU_MAIL_DELIVERY_SECRET,CASKU_MAIL_SUPPRESSION_SECRET:local.CASKU_MAIL_SUPPRESSION_SECRET,CASKU_CLINICAL_MAIL_ENABLED:'1',CASKU_MAIL_AUTOMATION:'0',BREVO_WEBHOOK_ENABLED:'1',BREVO_WEBHOOK_SECRET:previous.BREVO_WEBHOOK_SECRET||randomBytes(32).toString('base64url')}
  for(const value of Object.values(env))assert(value&&!/[\r\n\0]/.test(value),'Configuración privada incompleta')
  assert(env.CASKU_MAIL_DELIVERY_SECRET.length>=32&&env.CASKU_MAIL_SUPPRESSION_SECRET.length>=32)
  await writeFile(file,encodeEnvironment(env),{mode:0o600});await chmod(file,0o600)
  console.log(JSON.stringify({estado:'CONFIGURACION_PRIVADA_PREPARADA',archivo:'.env.brevo-activacion',envios:0}));
 } else {
  const env=parse(await readFile(file));assert(env.BREVO_API_KEY&&/^[A-Za-z0-9_-]{32,256}$/.test(env.BREVO_WEBHOOK_SECRET))
  if(action==='--verify') {
   const send=auth=>fetch(callback,{method:'POST',headers:{'content-type':'application/json',Authorization:auth},body:JSON.stringify({event:'casku.health'}),redirect:'error',signal:AbortSignal.timeout(20000)})
   const valid=await send('Bearer '+env.BREVO_WEBHOOK_SECRET),invalid=await send('Bearer invalid')
   console.log(JSON.stringify({estado:valid.status===200&&invalid.status===401?'RECEPTOR_VERIFICADO':'PENDIENTE_CONFIGURACION',firmaValida:valid.status,firmaInvalida:invalid.status,envios:0}));assert(valid.status===200&&invalid.status===401,'Falta actualizar las variables de Vercel')
  } else {
   const senders=await request('/senders',env);assert(senders.senders?.some(x=>x.email==='contacto@casku.cl'&&x.active===true),'Remitente no activo')
   const listing=await request('/webhooks?type=transactional',env),matches=(listing.webhooks||[]).filter(x=>x.url===callback)
   if(action==='--inspect'){console.log(JSON.stringify({estado:'PROVEEDOR_VERIFICADO',remitenteActivo:true,webhooksCoincidentes:matches.length,envios:0}))}
   else {
    assert(matches.length<=1,'Hay receptores duplicados; revisar sin modificar otros webhooks')
    const check=await fetch(callback,{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+env.BREVO_WEBHOOK_SECRET},body:JSON.stringify({event:'casku.health'}),redirect:'error',signal:AbortSignal.timeout(20000)})
    assert(check.status===200,'Configura las variables en Vercel antes de crear el webhook')
    if(matches.length){const detail=await request('/webhooks/'+matches[0].id,env);assert(detail.auth?.type==='bearer'&&detail.auth.token===env.BREVO_WEBHOOK_SECRET&&events.every(x=>detail.events?.includes(x)),'El webhook existente necesita revisión; no se reemplazó')}
    else await request('/webhooks',env,{method:'POST',body:JSON.stringify({url:callback,type:'transactional',description:'Casku - Entregas, rebotes y quejas',events,auth:{type:'bearer',token:env.BREVO_WEBHOOK_SECRET}})})
    console.log(JSON.stringify({estado:matches.length?'WEBHOOK_EXISTENTE_VERIFICADO':'WEBHOOK_CREADO',envios:0}))
   }
  }
 }
} catch(e){console.error(JSON.stringify({estado:'PENDIENTE',motivo:e instanceof assert.AssertionError?e.message:/^BREVO_HTTP_\d+$/.test(e.message||'')?e.message:e.code||e.name}));process.exitCode=1}
