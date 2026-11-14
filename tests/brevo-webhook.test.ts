import test from "node:test"
import assert from "node:assert/strict"
import { canonicalMessageId, parseBrevoEvents, recipientKey, webhookAuthorized, WebhookInputError } from "../src/lib/mail/webhook-policy.ts"
import { handleBrevoWebhook } from "../src/lib/mail/webhook-http.ts"
const secret = "webhook-ficticio-de-mas-de-32-caracteres", recipientSecret = "supresion-ficticia-de-mas-de-32-caracteres"
const event = {event:"delivered",id:12,email:"familia@example.com","message-id":"<mensaje-ficticio@brevo.test>",ts_event:1794614400,subject:"Dato que no debe persistir",reason:"Dato privado"}
test("Webhook: autentica Bearer exacto y rechaza secretos ausentes, cortos o en URL",()=>{
  assert(webhookAuthorized(`Bearer ${secret}`,secret))
  for(const header of [null,"",`Basic ${secret}`,`Bearer ${secret}x`,`Bearer ${"ñ".repeat(secret.length)}`]) assert(!webhookAuthorized(header,secret))
  for(const key of ["","corto","x".repeat(257),"con espacios".repeat(5)])assert(!webhookAuthorized(`Bearer ${key}`,key))
})
test("Webhook: normaliza sin corchetes, fecha UTC y huella independiente del identificador del webhook",()=>{
  const [normalized] = parseBrevoEvents(event,recipientSecret)
  assert.equal(normalized.messageId,"mensaje-ficticio@brevo.test");assert.equal(normalized.type,"ENTREGADO")
  assert.equal(normalized.occurredAt.toISOString(),new Date(event.ts_event*1000).toISOString())
  assert.equal(normalized.recipient,recipientKey("FAMILIA@example.com",recipientSecret))
  assert.deepEqual(parseBrevoEvents({...event,id:999,"message-id":"mensaje-ficticio@brevo.test",subject:"Otro texto",reason:"Otro texto"},recipientSecret),[normalized])
  assert.notEqual(parseBrevoEvents({...event,event:"spam"},recipientSecret)[0].id,normalized.id)
  assert(!JSON.stringify(normalized).includes(event.email));assert(!JSON.stringify(normalized).includes(event.subject))
  assert.deepEqual(parseBrevoEvents({event:"opened",email:"ignorado"},recipientSecret),[])
  assert.equal(parseBrevoEvents({...event,event:"soft_bounce"},recipientSecret)[0].type,"REBOTE_TEMPORAL")
  assert.equal(parseBrevoEvents({...event,event:"hard_bounce"},recipientSecret)[0].type,"REBOTE")
})
test("Webhook: rechaza lotes y eventos malformados sin interpretar fechas locales ni guardar el motivo",()=>{
  for(const payload of [null,[],Array(51).fill(event),[event,null],{...event,email:"a@example.com\n"},{...event,"message-id":"<malformado"},{...event,ts_event:"1794614400"},{...event,ts_event:0},{...event,ts_event:Date.now()},{...event,ts_event:undefined,ts:undefined,date:"2026-11-14 12:00:00"}])assert.throws(()=>parseBrevoEvents(payload,recipientSecret),WebhookInputError)
  for(const id of ["", "<>","abc def","<abc><def>"])assert.throws(()=>canonicalMessageId(id),WebhookInputError)
})
test("Webhook HTTP: autenticación antes de cuerpo/base; límites, validación y errores sin filtrar",async()=>{
  const saved={BREVO_WEBHOOK_SECRET:process.env.BREVO_WEBHOOK_SECRET,BREVO_WEBHOOK_ENABLED:process.env.BREVO_WEBHOOK_ENABLED,CASKU_MAIL_SUPPRESSION_SECRET:process.env.CASKU_MAIL_SUPPRESSION_SECRET}
  Object.assign(process.env,{BREVO_WEBHOOK_SECRET:secret,BREVO_WEBHOOK_ENABLED:"1",CASKU_MAIL_SUPPRESSION_SECRET:recipientSecret})
  let calls=0
  const database=async()=>{calls++;throw new Error("Error privado de base")}
  const request=(body:string,headers:Record<string,string>={})=>new Request("http://localhost/api/webhooks/brevo",{method:"POST",headers:{authorization:`Bearer ${secret}`,"content-type":"application/json",...headers},body})
  try {
    assert.equal((await handleBrevoWebhook(request("no json",{authorization:""}),database)).status,401);assert.equal(calls,0)
    process.env.BREVO_WEBHOOK_ENABLED="0";assert.equal((await handleBrevoWebhook(request("{}"),database)).status,503)
    process.env.BREVO_WEBHOOK_ENABLED="1"
    assert.equal((await handleBrevoWebhook(request("{}",{"content-type":"text/plain"}),database)).status,415)
    assert.equal((await handleBrevoWebhook(request("{}",{"content-length":"131073"}),database)).status,413)
    assert.equal((await handleBrevoWebhook(request("x".repeat(131073)),database)).status,413)
    assert.equal((await handleBrevoWebhook(request("no json"),database)).status,400)
    assert.equal((await handleBrevoWebhook(request(JSON.stringify([event,null])),database)).status,400)
    assert.equal((await handleBrevoWebhook(request(JSON.stringify({event:"opened"})),database)).status,200)
    assert.equal(calls,0)
    const failure=await handleBrevoWebhook(request(JSON.stringify(event)),database)
    assert.equal(failure.status,503);assert.deepEqual(await failure.json(),{ok:false});assert.equal(calls,1)
  } finally {for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})
