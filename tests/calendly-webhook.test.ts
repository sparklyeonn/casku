import test from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { validCalendlySignature, parseCalendlyNotice, inviteeReference, hookConfig, webhookHealth, WEBHOOK_MAX_BYTES } from "../src/lib/calendly/webhook-policy.ts"
const key="k".repeat(43),now=Date.parse("2026-11-20T12:00:00Z"),stamp=String(now/1000)
const uri="https://api.calendly.com/scheduled_events/event/invitees/guest"
const payload={event:"invitee.created",created_at:"2026-11-20T12:00:00Z",payload:{uri,event:"https://api.calendly.com/scheduled_events/event",name:"Nombre privado",email:"privado@example.test",questions_and_answers:[{answer:"NO_GUARDAR"}]}}
const bytes=Buffer.from(JSON.stringify(payload))
const signature=(raw:Uint8Array,t=stamp)=>`t=${t},v1=${createHmac("sha256",key).update(t+".").update(raw).digest("hex")}`
test("Calendly firma: bytes originales, ventana temporal, múltiples firmas y comparación sin aceptar cambios",()=>{
 assert(validCalendlySignature(bytes,signature(bytes),key,now))
 assert(validCalendlySignature(bytes,signature(bytes)+",v1="+"0".repeat(64),key,now))
 for(const header of [null,"",signature(bytes).replace("v1=","v2="),signature(bytes)+",t="+stamp,signature(bytes, String(now/1000-181)),signature(bytes,String(now/1000+181))])assert(!validCalendlySignature(bytes,header,key,now))
 assert(!validCalendlySignature(Buffer.from(JSON.stringify(payload,null,2)),signature(bytes),key,now))
 assert(!validCalendlySignature(bytes,signature(bytes),"otra-clave".repeat(4),now))
 assert(!validCalendlySignature(Buffer.alloc(WEBHOOK_MAX_BYTES+1),signature(bytes),key,now))
})
test("Calendly avisos: minimiza datos e identifica duplicados independientemente de nombre o correo",()=>{
 const notice=parseCalendlyNotice(bytes)!
 assert.deepEqual(Object.keys(notice).sort(),["creadoAt","id","invitadoUri","tipo"])
 assert(!JSON.stringify(notice).includes("privado"));assert(!JSON.stringify(notice).includes("NO_GUARDAR"))
 assert.equal(parseCalendlyNotice(Buffer.from(JSON.stringify({...payload,payload:{...payload.payload,name:"Otro",email:"otra@example.test"}})))!.id,notice.id)
 assert.notEqual(parseCalendlyNotice(Buffer.from(JSON.stringify({...payload,event:"invitee.canceled"})))!.id,notice.id)
 assert.equal(parseCalendlyNotice(Buffer.from(JSON.stringify({...payload,event:"routing_form_submission.created"}))),null)
 for(const bad of [null,[],{}, {...payload,created_at:"ayer"},{...payload,payload:{...payload.payload,event:"https://ajeno.test"}}])assert.throws(()=>parseCalendlyNotice(Buffer.from(JSON.stringify(bad))))
 for(const bad of ["https://ajeno.test/scheduled_events/event/invitees/guest",uri+"?secret=x",uri+"/",uri.replace("guest","../guest")])assert.throws(()=>inviteeReference(bad))
})
test("Calendly conexión: requiere HTTPS y claves privadas; la salud vence y no se acredita por activar una variable",()=>{
 const env={CALENDLY_ENABLED:"1",CALENDLY_API_TOKEN:"pat-falso",CALENDLY_WEBHOOK_ENABLED:"1",CALENDLY_WEBHOOK_SIGNING_KEY:key,CALENDLY_WEBHOOK_SUBSCRIPTION_ID:"hook",AUTH_URL:"https://app.example.test"}
 const config=hookConfig(env)!
 assert(config);assert.equal(config.callback,"https://app.example.test/api/calendly/webhook")
 for(const change of [{CALENDLY_ENABLED:"0"},{CALENDLY_WEBHOOK_ENABLED:"0"},{CALENDLY_WEBHOOK_SIGNING_KEY:"corta"},{AUTH_URL:"http://app.example.test"},{CALENDLY_WEBHOOK_SUBSCRIPTION_ID:"../hook"}])assert.equal(hookConfig({...env,...change}),null)
 const state={huella:config.huella,conectadaAt:new Date(now),verificadaAt:new Date(now),fallo:false}
 assert(webhookHealth(state,config.huella,new Date(now)))
 for(const change of [{fallo:true},{huella:"otra"},{conectadaAt:null},{verificadaAt:new Date(now-27*3600000)},{verificadaAt:new Date(now+1)}])assert(!webhookHealth({...state,...change},config.huella,new Date(now)))
})
