import {createHmac} from 'node:crypto'
import {join} from 'node:path'
import {validateResultBatch} from '../../src/lib/results/expo-scheduled-message.ts'
import {withLock,readPrivate,durableWrite,assertWindow,queued} from './daily-reminders.mjs'
const check=(ok,code)=>{if(!ok)throw new Error(code)}
export async function scheduleResultBatch({dir,plan,approval,db,config,deliver,payloadFor,recipientFor,fetcher,revalidate,revalidateItem,now=Date.now,onProgress=()=>{}}){
 return withLock(dir,async()=>{
  validateResultBatch(plan,approval);assertWindow(plan,now())
  await revalidate(plan)
  const approved={...config,testRecipients:[...new Set(plan.items.map(item=>item.correo))]}
  const entries=[]
  // Complete preflight for all 95 messages before the first network mutation.
  for(const item of plan.items){
   const message={...item.message,scheduledAt:plan.scheduledAt,batchId:plan.batchId}
   const payload=payloadFor(message,approved,item.key)
   check(payload.to.length===1&&payload.to[0].email===item.correo&&!payload.cc&&!payload.bcc,'RECIPIENT_CHANGED')
   const hashMensaje=createHmac('sha256',config.secret).update(JSON.stringify({purpose:'RESULTADO',payload})).digest('hex')
   const recipient=recipientFor(item.correo,config.suppressionSecret)
   check(!await db.supresionCorreo.findUnique({where:{clave:recipient}}),'RECIPIENT_SUPPRESSED')
   const existing=await db.envioTransaccional.findUnique({where:{clave:item.key}})
   if(existing)check(existing.hashMensaje===hashMensaje&&existing.finalidad==='RESULTADO'&&existing.destinatarioClave===recipient,'LEDGER_CHANGED')
   const file=join(dir,'attempt-'+item.key+'.json')
   let receipt;try{receipt=await readPrivate(file)}catch(error){if(error.code!=='ENOENT')throw error}
   if(receipt){
    check(receipt.hashMensaje===hashMensaje&&receipt.planHash===plan.hash&&receipt.databaseFingerprint===plan.databaseFingerprint,'RECEIPT_CHANGED')
    check(receipt.status==='ACCEPTED'&&receipt.providerId,'ACCEPTANCE_UNCERTAIN')
    check(existing&&['ACEPTADO','ENVIANDO','REVISION'].includes(existing.estado)&&(!existing.proveedorId||existing.proveedorId===receipt.providerId),'RECONCILIATION_UNSAFE')
   }else if(existing)check(existing.estado==='ACEPTADO'&&existing.proveedorId||existing.estado==='PENDIENTE'&&existing.intentos===0&&!existing.proveedorId,'DELIVERY_UNCERTAIN')
   const providerId=receipt?.providerId||existing?.proveedorId
   if(providerId)await queued(providerId,plan,config,fetcher)
   entries.push({item,message,payload,hashMensaje,recipient,existing,file,receipt,providerId})
  }
  let accepted=0,reused=0,recovered=0
  for(const entry of entries){
   assertWindow(plan,now())
   if(entry.providerId){
    if(entry.existing.estado!=='ACEPTADO'){
     const result=await db.envioTransaccional.updateMany({where:{clave:entry.item.key,hashMensaje:entry.hashMensaje,estado:{in:['ENVIANDO','REVISION']},proveedorId:null},data:{estado:'ACEPTADO',proveedorId:entry.providerId,aceptadoAt:new Date(),bloqueoToken:null,bloqueoHasta:null,motivo:`EXPO_PROGRAMADO:${entry.item.hashDatos}`,disponibleAt:new Date(plan.scheduledAt)}})
     check(result.count===1,'RECOVERY_DB_FAILED');recovered++
    }
    reused++;await onProgress({verified:accepted+reused,total:entries.length});continue
   }
   await revalidateItem(entry.item)
   const intent={key:entry.item.key,planHash:plan.hash,hashMensaje:entry.hashMensaje,databaseFingerprint:plan.databaseFingerprint,status:'ATTEMPTING',evaluacionId:entry.item.evaluacionId,revision:entry.item.revision}
   await durableWrite(entry.file,intent)
   const original=globalThis.fetch;let posted=false,saved=false
   globalThis.fetch=async(input,options)=>{
    check(!posted&&input===`${config.baseUrl}/v3/smtp/email`&&options?.method==='POST'&&options.body===JSON.stringify(entry.payload),'UNEXPECTED_TRANSPORT')
    assertWindow(plan,now());posted=true
    const response=await fetcher(input,options)
    if(response.ok){
     const body=await response.clone().json()
     check(typeof body.messageId==='string'&&body.messageId.length>0&&body.messageId.length<=1000&&!/[\s\0]/.test(body.messageId),'ACCEPTANCE_UNCERTAIN')
     // Native acceptance is fsynced before the delivery ledger acceptance write.
     await durableWrite(entry.file,{...intent,status:'ACCEPTED',providerId:body.messageId,scheduledAt:plan.scheduledAt,batchId:plan.batchId})
     saved=true
    }
    return response
   }
   let id
   try{id=await deliver(db,entry.message,entry.item.key,'RESULTADO',approved)}finally{globalThis.fetch=original}
   check(posted&&saved,'MISSING_NATIVE_ACCEPTANCE')
   check((await readPrivate(entry.file)).providerId===id,'PROVIDER_ID_MISMATCH')
   const tagged=await db.envioTransaccional.updateMany({where:{clave:entry.item.key,estado:'ACEPTADO',proveedorId:id},data:{motivo:`EXPO_PROGRAMADO:${entry.item.hashDatos}`,disponibleAt:new Date(plan.scheduledAt)}})
   check(tagged.count===1,'ACCEPTANCE_METADATA_FAILED')
   await queued(id,plan,config,fetcher);accepted++;await onProgress({verified:accepted+reused,total:entries.length})
  }
  return {status:'COLA_VERIFICADA',messages:entries.length,accepted,reused,recovered,queued:accepted+reused,scheduledAt:plan.scheduledAt,planHash:plan.hash}
 })
}

// Operator-only maintenance for one explicitly selected message. This is never
// invoked by scheduling and never changes the evaluation or its consent record.
export async function cancelScheduledExpoItem({dir,plan,item,db,config,fetcher}){
 validateResultBatch(plan)
 check(plan.items.some(x=>x.key===item.key&&x.evaluacionId===item.evaluacionId),'ITEM_OUTSIDE_APPROVED_BATCH')
 const file=join(dir,'attempt-'+item.key+'.json'),receipt=await readPrivate(file)
 check(receipt.planHash===plan.hash&&receipt.providerId&&receipt.key===item.key,'INVALID_NATIVE_RECEIPT')
 const row=await db.envioTransaccional.findUnique({where:{clave:item.key}})
 check(row?.proveedorId===receipt.providerId,'PROVIDER_ID_MISMATCH')
 const markCancelled=async()=>{
  const result=await db.envioTransaccional.updateMany({where:{clave:item.key,proveedorId:receipt.providerId,estado:{in:['ACEPTADO','REVISION']}},data:{estado:'RECHAZADO',motivo:'CANCELADO_EXPO_POR_SOLICITUD',bloqueoToken:null,bloqueoHasta:null}})
  check(result.count===1||row.estado==='RECHAZADO','CANCELLATION_DB_FAILED')
  return {status:'CANCELACION_VERIFICADA',evaluacionId:item.evaluacionId,nuevosEnvios:0}
 }
 if(receipt.status==='CANCELLED')return markCancelled()
 check(receipt.status==='ACCEPTED','CANCELLATION_UNCERTAIN')
 await queued(receipt.providerId,plan,config,fetcher)
 const locked=await db.envioTransaccional.updateMany({where:{clave:item.key,proveedorId:receipt.providerId,estado:'ACEPTADO'},data:{estado:'REVISION',motivo:'CANCELACION_EXPO_EN_CURSO'}})
 check(locked.count===1,'CANCELLATION_ALREADY_IN_PROGRESS')
 await durableWrite(file,{...receipt,status:'CANCEL_ATTEMPTING'})
 const response=await fetcher(config.baseUrl+'/v3/smtp/email/'+encodeURIComponent(receipt.providerId),{method:'DELETE',headers:{'api-key':config.key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)})
 check(response.status===204,'CANCELLATION_NOT_CONFIRMED')
 await durableWrite(file,{...receipt,status:'CANCELLED',cancelledAt:new Date().toISOString()})
 return markCancelled()
}
