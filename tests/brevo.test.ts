import test from "node:test"
import assert from "node:assert/strict"
import { mailConfig, brevoPayload, providerKey, postBrevo, MailUnavailable } from "../src/lib/mail/brevo.ts"
const settings={NODE_ENV:"production",CASKU_TEST_MODE:"0",CASKU_PRODUCTION_TEST:"0",CASKU_MAIL_ENABLED:"1",BREVO_SENDER_VERIFIED:"1",BREVO_API_KEY:"clave-ficticia-no-utilizable",BREVO_SENDER_EMAIL:"contacto@example.com",BREVO_SENDER_NAME:"Casku",CASKU_MAIL_DELIVERY_SECRET:"secreto-estable-ficticio-de-32-caracteres",CASKU_TEST_MAIL_URL:"http://127.0.0.1:9999"}
function environment<T>(values:Record<string,string>,run:()=>T) {
  const saved=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]))
  Object.assign(process.env,values)
  try {return run()}finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
}
const message={to:"familia@example.com",subject:"Confirmación ficticia",text:"Tu número es 001.",html:"<p>Tu número es 001.</p>"}
const configured=()=>environment(settings,()=>mailConfig("CONFIRMACION"))
test("Brevo: exige activación, clave, remitente verificado y secreto; ignora el proveedor anterior",()=>{
  for(const change of [{CASKU_MAIL_ENABLED:"0"},{BREVO_API_KEY:""},{BREVO_SENDER_VERIFIED:"0"},{BREVO_SENDER_EMAIL:""},{CASKU_MAIL_DELIVERY_SECRET:"corto"},{BREVO_SENDER_EMAIL:"correo\r\n@example.com"}])environment({...settings,...change},()=>assert.throws(()=>mailConfig(),MailUnavailable))
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
