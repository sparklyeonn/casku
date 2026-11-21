import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {CONTACT_CONSENT_VERSION,contactInput,contactSnapshotHash,contactDeliveryDecision,contactEmail} from "../src/lib/results/contact-policy.ts"
import {contactJson,contactOrigin} from "../src/lib/results/contact-http.ts"
import {contactMessage} from "../src/lib/results/contact-message.ts"
import {parseMeasurements} from "../src/lib/evaluation-input.ts"
const request={id:randomUUID(),revision:1,contexto:"a".repeat(64),correoRepetido:"CONTACTO@example.invalid",versionConsentimiento:CONTACT_CONSENT_VERSION,confirmarApoderado:true,autorizarCorreo:true}
test("contacto: exige dos confirmaciones y versión vigente, sin aceptar destino o nombre arbitrarios",()=>{
 assert.equal(contactInput(request).correoRepetido,"contacto@example.invalid")
 for(const change of [{confirmarApoderado:false},{autorizarCorreo:"true"},{versionConsentimiento:"vieja"},{revision:0},{id:"x"},{contexto:"x"},{destinatario:"intruso@example.invalid"},{nombreApoderado:"Inventado"},{motivo:"x"}])assert.throws(()=>contactInput({...request,...change}))
 assert.throws(()=>contactEmail("a@example.invalid\r\nbcc:otra"))
})
test("contacto: hash estable del snapshot y ninguna repetición ciega de aceptación incierta",()=>{
 assert.equal(contactSnapshotHash({b:2,a:{d:4,c:3}}),contactSnapshotHash({a:{c:3,d:4},b:2}))
 assert.notEqual(contactSnapshotHash({a:1}),contactSnapshotHash({a:2}))
 for(const estado of ["REVISION","ENVIANDO","RECHAZADO"])assert.equal(contactDeliveryDecision("PENDIENTE",{estado}).send,false)
 assert.equal(contactDeliveryDecision("PENDIENTE",{estado:"ACEPTADO",proveedorId:"p"}).send,false)
 assert.equal(contactDeliveryDecision("REVISION",null).send,false)
 assert.equal(contactDeliveryDecision("PENDIENTE",null).send,true)
 assert.equal(contactDeliveryDecision("REINTENTABLE",{estado:"REINTENTABLE",disponibleAt:new Date(100)},99).send,false)
 assert.equal(contactDeliveryDecision("REINTENTABLE",{estado:"REINTENTABLE",disponibleAt:new Date(100)},100).send,true)
})
test("contacto HTTP: mismo origen obligatorio, JSON acotado aunque falte content-length",async()=>{
 const make=(body:string,headers:Record<string,string>={})=>new Request("https://casku.invalid/api/contacto",{method:"POST",headers:{origin:"https://casku.invalid","content-type":"application/json",...headers},body})
 assert.deepEqual(await contactJson(make(JSON.stringify(request))),request)
 await assert.rejects(contactJson(make("{}",{origin:"https://other.invalid"})),/Casku/)
 await assert.rejects(contactJson(make("{}",{origin:""})),/Casku/)
 await assert.rejects(contactJson(make("{}",{"content-type":"text/plain"})),/JSON/)
 await assert.rejects(contactJson(make(" ".repeat(4097))),/tamaño/)
 await assert.rejects(contactJson(make("{}",{"content-length":"99999"})),/tamaño/)
 await assert.rejects(contactJson(make("[]")))
 assert.throws(()=>contactOrigin(new Request("https://casku.invalid",{headers:{"sec-fetch-site":"cross-site"}})))
})
test("contacto: contenido clínico directo, sin enlace ni promesa de cuenta ni campos privados",()=>{
 const calculated=parseMeasurements({ap:140,bp:120,di:135,dd:138})
 const snapshot={nombreBebe:"Bebé <ficticio>",fechaNacimiento:"2026-01-01",fechaEvaluacion:"2026-11-20T12:00:00Z",profesional:"Profesional ficticia",evento:null,numero:null,medidas:{ap:140,bp:120,di:135,dd:138},indiceCraneal:calculated.indiceCraneal,indiceAsimetria:calculated.indiceAsimetria,diagnostico:calculated.diagnostico,recomendacion:calculated.recomendacion}
 const message=contactMessage(snapshot,"contacto@example.invalid")
 assert.equal(message.to,"contacto@example.invalid");assert(message.text.includes(snapshot.diagnostico))
 assert.doesNotMatch(message.html,/<a |Publicamos|Puedes consultar este resultado en tu cuenta/)
 assert.doesNotMatch(message.text,/Disponible también|Consultar en tu cuenta/)
 assert.match(message.html,/&lt;ficticio&gt;/);assert.doesNotMatch(message.html,/<ficticio>/)
})
