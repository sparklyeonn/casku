import test from "node:test"
import assert from "node:assert/strict"
import { mailConfig, brevoPayload, providerKey, postBrevo, MailUnavailable } from "../src/lib/mail/brevo.ts"
const settings={BREVO_WEBHOOK_ENABLED:"1",BREVO_WEBHOOK_SECRET:"webhook-ficticio-independiente-32-caracteres",CASKU_CLINICAL_MAIL_ENABLED:"0",CASKU_MAIL_MODE:"produccion",CASKU_MAIL_TEST_RECIPIENTS:"",NODE_ENV:"production",CASKU_TEST_MODE:"0",CASKU_PRODUCTION_TEST:"0",CASKU_MAIL_ENABLED:"1",BREVO_SENDER_VERIFIED:"1",BREVO_API_KEY:"clave-ficticia-no-utilizable",BREVO_SENDER_EMAIL:"contacto@example.com",BREVO_SENDER_NAME:"Casku",CASKU_MAIL_DELIVERY_SECRET:"secreto-estable-ficticio-de-32-caracteres",CASKU_MAIL_SUPPRESSION_SECRET:"supresion-estable-ficticia-de-32-caracteres",CASKU_TEST_MAIL_URL:"http://127.0.0.1:9999"}
function environment<T>(values:Record<string,string>,run:()=>T) {
  const saved=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]))
  Object.assign(process.env,values)
  try {return run()}finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
}
const message={to:"familia@example.com",subject:"Confirmación ficticia",text:"Tu número es 001.",html:"<p>Tu número es 001.</p>"}
const configured=()=>environment(settings,()=>mailConfig("CONFIRMACION"))
test("Brevo: exige activación, clave, remitente verificado y secreto; ignora el proveedor anterior",()=>{
  for(const change of [{CASKU_MAIL_ENABLED:"0"},{BREVO_API_KEY:""},{BREVO_SENDER_VERIFIED:"0"},{BREVO_SENDER_EMAIL:""},{CASKU_MAIL_DELIVERY_SECRET:"corto"},{CASKU_MAIL_SUPPRESSION_SECRET:""},{BREVO_SENDER_EMAIL:"correo\r\n@example.com"}])environment({...settings,...change},()=>assert.throws(()=>mailConfig(),MailUnavailable))
  environment({...settings,BREVO_API_KEY:"",RESEND_API_KEY:"clave-anterior",RESEND_FROM:"anterior@example.com"},()=>assert.throws(()=>mailConfig(),MailUnavailable))
})
test("Brevo: URL oficial fija en producción, simulación solo de desarrollo y clínica real bloqueada",()=>{
  assert.equal(configured().baseUrl,"https://api.brevo.com")
  environment(settings,()=>assert.throws(()=>mailConfig("RESULTADO"),MailUnavailable))
  environment({...settings,NODE_ENV:"development",CASKU_TEST_MODE:"1",BREVO_API_KEY:"brevo_local_test_only",BREVO_SENDER_EMAIL:"test@example.com"},()=>assert.equal(mailConfig().baseUrl,"http://127.0.0.1:9999"))
  for(const value of ["https://example.com","http://localhost:9999","http://user:secret@127.0.0.1:9999","http://127.0.0.1:9999/proxy"])environment({...settings,NODE_ENV:"development",CASKU_TEST_MODE:"1",BREVO_API_KEY:"brevo_local_test_only",BREVO_SENDER_EMAIL:"test@example.com",CASKU_TEST_MAIL_URL:value},()=>assert.throws(()=>mailConfig(),MailUnavailable))
})
test("Brevo: número y QR adjunto se traducen al contrato del proveedor con UUID estable",()=>{
  const png=Buffer.from("PNG ficticio").toString("base64"),payload=brevoPayload({...message,attachments:[{filename:"casku-001.png",content:png}]},configured(),"registration-123")
  assert.deepEqual(payload.sender,{email:"contacto@example.com",name:"Casku"})
  assert.deepEqual(payload.to,[{email:message.to,contactPixelTrackingConsent:false}])
  assert.equal(payload.htmlContent,message.html);assert.equal(payload.textContent,message.text)
  assert.deepEqual(payload.attachment,[{name:"casku-001.png",content:png}])
  assert.equal(payload.headers.idempotencyKey,providerKey("registration-123"));assert.notEqual(providerKey("registration-123-revision-2"),providerKey("registration-123"))
  assert.match(payload.headers.idempotencyKey,/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
  for(const invalid of [{...message,to:"a@example.com\r\nb@example.com"},{...message,subject:"Hola\nBcc: intruso"},{...message,attachments:[{filename:"../qr.png",content:png}]},{...message,attachments:[{filename:"qr.png",content:"inválido"}]}])assert.throws(()=>brevoPayload(invalid,configured(),"registration-test"),MailUnavailable)
})
test("Brevo: aceptación requiere messageId, y los errores nunca filtran el cuerpo del proveedor",async()=>{
  const original=globalThis.fetch,config=configured(),payload=brevoPayload(message,config,"access-test")
  try {
    globalThis.fetch=async(input,init)=>{
      assert.equal(String(input),"https://api.brevo.com/v3/smtp/email")
      assert.equal(init?.method,"POST");assert.equal(init?.redirect,"error")
      assert.equal(new Headers(init?.headers).get("api-key"),config.key)
      assert.deepEqual(JSON.parse(String(init?.body)),payload)
      return Response.json({messageId:"<ficticio@brevo.test>"},{status:201})
    }
    assert.equal(await postBrevo(config,payload),"<ficticio@brevo.test>")
    for(const [status,body,kind] of [[429,{code:"too_many_requests"},"TRANSITORIO"],[401,{code:"unauthorized"},"TRANSITORIO"],[400,{code:"invalid_parameter"},"PERMANENTE"],[400,{code:"duplicate_parameter"},"INCIERTO"],[503,{message:"dato privado del proveedor"},"INCIERTO"],[201,{},"INCIERTO"],[201,null,"INCIERTO"]] as const){
      globalThis.fetch=async()=>Response.json(body,{status,headers:{"retry-after":"0"}})
      await assert.rejects(postBrevo(config,payload),error=>error instanceof MailUnavailable&&error.kind===kind&&!error.message.includes("dato privado"))
    }
    globalThis.fetch=async()=>{throw new Error("datos privados de red")}
    await assert.rejects(postBrevo(config,payload),error=>error instanceof MailUnavailable&&error.kind==="INCIERTO"&&!error.message.includes("privados"))
  }finally{globalThis.fetch=original}
})

test("Brevo: pruebas reales exigen lista explícita y rechazan destinatarios antes de la red",async()=>{
  for (const change of [{CASKU_MAIL_MODE:""},{CASKU_MAIL_MODE:"pruebas"},{CASKU_MAIL_MODE:"otro"},{CASKU_MAIL_MODE:"pruebas",CASKU_MAIL_TEST_RECIPIENTS:"familia@example.com,"},{CASKU_MAIL_MODE:"pruebas",CASKU_MAIL_TEST_RECIPIENTS:"familia@example.com\n"}]) environment({...settings,...change},()=>assert.throws(()=>mailConfig(),MailUnavailable))
  const config=environment({...settings,CASKU_MAIL_MODE:"pruebas",CASKU_MAIL_TEST_RECIPIENTS:" FAMILIA@example.com, segunda@example.com "},()=>mailConfig())
  const payload=brevoPayload(message,config,"test-recipient")
  assert.throws(()=>brevoPayload({...message,to:"otra@example.com"},config,"test-recipient"),MailUnavailable)
  assert.throws(()=>brevoPayload({...message,to:"familia+otro@example.com"},config,"test-recipient"),MailUnavailable)
  const saved=globalThis.fetch;let calls=0
  try {
    globalThis.fetch=async()=>{calls++;return Response.json({messageId:"<prueba@brevo.test>"},{status:201})}
    await assert.rejects(postBrevo(config,{...payload,to:[{email:"otra@example.com",contactPixelTrackingConsent:false}]}),MailUnavailable)
    assert.equal(calls,0)
    assert.equal(await postBrevo(config,payload),"<prueba@brevo.test>");assert.equal(calls,1)
  }finally{globalThis.fetch=saved}
  environment({...settings,CASKU_MAIL_MODE:"pruebas",CASKU_MAIL_TEST_RECIPIENTS:"familia@example.com"},()=>assert.throws(()=>mailConfig("RESULTADO"),MailUnavailable))
})

test("Brevo: programación explícita hasta 72 horas, sin convertir fechas vencidas en envíos inmediatos",()=>{
  const config=configured(),batchId="25b38367-372a-4fdb-aa7a-1af93a22ad61",future=new Date(Date.now()+60_000).toISOString()
  const payload=brevoPayload({...message,scheduledAt:future,batchId},config,"reminder-test")
  assert.equal(payload.scheduledAt,future);assert.equal(payload.batchId,batchId)
  for(const scheduledAt of [new Date(Date.now()-1000).toISOString(),new Date(Date.now()+73*60*60_000).toISOString(),"2026-11-18T19:00:00","invalida"])assert.throws(()=>brevoPayload({...message,scheduledAt,batchId},config,"reminder-test"),MailUnavailable)
  assert.throws(()=>brevoPayload({...message,batchId},config,"reminder-test"),MailUnavailable)
  assert.throws(()=>brevoPayload({...message,scheduledAt:future,batchId:"incorrecto"},config,"reminder-test"),MailUnavailable)
  const limited=environment({...settings,CASKU_MAIL_MODE:"pruebas",CASKU_MAIL_TEST_RECIPIENTS:"familia@example.com"},()=>mailConfig("RECORDATORIO_EVENTO"))
  assert.throws(()=>brevoPayload({...message,to:"otra@example.com",scheduledAt:future,batchId},limited,"reminder-test"),MailUnavailable)
})

test("Brevo: resultados requieren activación independiente y conservan la lista de pruebas",()=>{
  environment({...settings,CASKU_CLINICAL_MAIL_ENABLED:"1"},()=>assert.equal(mailConfig("RESULTADO").sender.email,"contacto@example.com"))
  const cfg=environment({...settings,CASKU_CLINICAL_MAIL_ENABLED:"1",CASKU_MAIL_MODE:"pruebas",CASKU_MAIL_TEST_RECIPIENTS:"familia@example.com"},()=>mailConfig("RESULTADO"))
  assert.throws(()=>brevoPayload({...message,to:"otro@example.com"},cfg,"clinical-denied"),MailUnavailable)
  assert.deepEqual(brevoPayload(message,cfg,"clinical-approved").to,[{email:"familia@example.com",contactPixelTrackingConsent:false}])
  environment({...settings,CASKU_CLINICAL_MAIL_ENABLED:"1",CASKU_MAIL_ENABLED:"0"},()=>assert.throws(()=>mailConfig("RESULTADO"),MailUnavailable))
})

test("Brevo: correo clínico real necesita configuración de entregas y supresiones",()=>{
 for(const change of [{BREVO_WEBHOOK_ENABLED:"0"},{BREVO_WEBHOOK_SECRET:""},{BREVO_WEBHOOK_SECRET:"corto"}])environment({...settings,CASKU_CLINICAL_MAIL_ENABLED:"1",...change},()=>assert.throws(()=>mailConfig("RESULTADO"),MailUnavailable))
})
