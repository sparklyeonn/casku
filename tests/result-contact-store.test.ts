import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import type {PrismaClient} from "@prisma/client"
import {createResultContactService} from "../src/lib/results/contact-store.ts"
import {CONTACT_CONSENT_VERSION} from "../src/lib/results/contact-policy.ts"
import {parseMeasurements} from "../src/lib/evaluation-input.ts"
import {PRIVACY_VERSION} from "../src/lib/privacy/policy.ts"
const actor={id:"author",version:1}
function fixture() {
 const calculated=parseMeasurements({ap:140,bp:120,di:135,dd:138})
 const row={id:"evaluation",autorId:actor.id,revision:1,autorizacionId:randomUUID(),pacienteId:"baby",paciente:{id:"baby",nombre:"Bebé ficticio",fechaNacimiento:new Date("2026-01-01"),apoderadoId:null as string|null,revisionDatos:1},correoPadre:"contacto@example.invalid",fila:null as unknown,publicacion:null as unknown,createdAt:new Date("2026-11-20T12:00:00Z"),kinesiologa:"Profesional ficticia",anteroposterior:140,biparietal:120,diagonalIzq:135,diagonalDer:138,medicionesComplementarias:null,indiceCraneal:calculated.indiceCraneal,indiceAsimetria:calculated.indiceAsimetria,diagnostico:calculated.diagnostico,recomendacion:calculated.recomendacion}
 const permission={id:row.autorizacionId,datos:true,versionTexto:PRIVACY_VERSION,pacienteId:row.pacienteId,apoderadoId:null,eventoId:null,revision:1}
 const records:Array<Record<string,unknown>>=[],deliveries=new Map(),calls:Array<{message:unknown;key:string}>=[],audit:string[]=[],locks:string[]=[]
 let enabled=true,mode="accepted",transactions=0,activeTransactions=0,beforeSend:(()=>void)|null=null
 const tx={
  $queryRaw:async(strings:TemplateStringsArray)=>{locks.push(strings.join("?"));return [{id:row.id}]},
  evaluacion:{findFirst:async({where}:{where:{id:string;autorId:string}})=>where.id===row.id&&where.autorId===row.autorId?row:null},
  cuentaEquipo:{findUnique:async()=>({active:true,role:"KINESIOLOGO",version:1,mustChangePassword:false})},
  autorizacionPrivacidad:{findUnique:async()=>permission},cambioPrivacidad:{findFirst:async()=>({declarante:"Apoderado ficticio"})},
  accesoPrivado:{create:async({data}:{data:{accion:string}})=>{audit.push(data.accion)}},
  resultadoContacto:{
   findMany:async()=>records,
   findFirst:async()=>records.at(-1)??null,
   findUnique:async({where}:{where:{id?:string;evaluacionId_revision_contexto?:{evaluacionId:string;revision:number;contexto:string}}})=>records.find(item=>where.id?item.id===where.id:item.evaluacionId===where.evaluacionId_revision_contexto?.evaluacionId&&item.revision===where.evaluacionId_revision_contexto?.revision&&item.contexto===where.evaluacionId_revision_contexto?.contexto)??null,
   findUniqueOrThrow:async({where}:{where:{id:string}})=>{const item=records.find(item=>item.id===where.id);if(!item)throw Error("Missing");return item},
   create:async({data}:{data:Record<string,unknown>})=>{const item={...data,estado:"PENDIENTE",proveedorId:null,createdAt:new Date(),updatedAt:new Date()};records.push(item);return item},
   update:async({where,data}:{where:{id:string};data:Record<string,unknown>})=>{const item=records.find(item=>item.id===where.id)!;Object.assign(item,data);return item}
  },
  envioTransaccional:{findUnique:async({where}:{where:{clave:string}})=>deliveries.get(where.clave)??null},
 }
 const db={$transaction:async(fn:(t:unknown)=>unknown)=>{transactions++;if(transactions===2&&beforeSend)beforeSend();activeTransactions++;try{return await fn(tx)}finally{activeTransactions--}}} as unknown as PrismaClient
 const service=createResultContactService(db,{enabled:()=>enabled,config:()=>({key:"fake",secret:"f".repeat(32),suppressionSecret:"s".repeat(32),sender:{email:"test@example.invalid",name:"Test"},baseUrl:"http://fixture.invalid",testRecipients:undefined}),deliver:async(message,key)=>{assert.equal(activeTransactions,0,"No retener conexiones mientras se entrega el correo");calls.push({message:structuredClone(message),key});if(mode==="uncertain"){deliveries.set(key,{estado:"REVISION"});throw Error("uncertain")};deliveries.set(key,{estado:"ACEPTADO",proveedorId:"accepted-fixture"});return "accepted-fixture"}})
 async function input(){const current=await service.read(actor,row.id);transactions=0;return {id:randomUUID(),revision:row.revision,contexto:current.contexto,correoRepetido:row.correoPadre,confirmarApoderado:true,autorizarCorreo:true,versionConsentimiento:CONTACT_CONSENT_VERSION}}
 return {row,permission,records,calls,audit,locks,service,input,setEnabled:(value:boolean)=>{enabled=value},setMode:(value:string)=>{mode=value},beforeSend:(fn:()=>void)=>{beforeSend=fn}}
}
test("contacto store: destinatario guardado, consentimiento persistido y una aceptación por revisión",async()=>{
 const f=fixture(),body=await f.input();const first=await f.service.submit(actor,f.row.id,body)
 assert.equal(first.envio.estado,"ACEPTADO");assert.equal(f.calls.length,1)
 assert.equal(f.records[0].consentimientoVersion,CONTACT_CONSENT_VERSION);assert.equal(f.records[0].actorId,actor.id)
 assert.equal((f.calls[0].message as {to:string}).to,f.row.correoPadre)
 assert(f.locks.some(sql=>sql.includes('"Evaluacion"')&&sql.includes("FOR UPDATE")))
 await f.service.submit(actor,f.row.id,body);assert.equal(f.calls.length,1)
 await f.service.submit(actor,f.row.id,{...body,id:randomUUID()});assert.equal(f.records.length,1);assert.equal(f.calls.length,1)
})
test("contacto store: no autor, otra familia, publicación retirada, falta de datos y flag apagado bloquean",async()=>{
 const unavailable=fixture();await assert.rejects(unavailable.service.read({id:"other",version:1},unavailable.row.id))
 for(const change of [(f:ReturnType<typeof fixture>)=>{f.row.paciente.apoderadoId="family"},(f:ReturnType<typeof fixture>)=>{f.row.publicacion={estado:"RETIRADO"}},(f:ReturnType<typeof fixture>)=>{f.permission.datos=false},(f:ReturnType<typeof fixture>)=>f.setEnabled(false)]){
  const f=fixture(),body=await f.input();change(f);await assert.rejects(f.service.submit(actor,f.row.id,body));assert.equal(f.calls.length,0);assert.equal(f.records.length,0)
 }
})
test("contacto store: revisión/contacto cambiados antes del POST o justo antes del proveedor no envían",async()=>{
 for(const change of [(f:ReturnType<typeof fixture>)=>{f.row.revision++},(f:ReturnType<typeof fixture>)=>{f.row.correoPadre="cambio@example.invalid"},(f:ReturnType<typeof fixture>)=>{f.permission.datos=false}]){
  const f=fixture(),body=await f.input();change(f);await assert.rejects(f.service.submit(actor,f.row.id,body));assert.equal(f.calls.length,0)
  const racing=fixture(),racingBody=await racing.input();racing.beforeSend(()=>change(racing));await assert.rejects(racing.service.submit(actor,racing.row.id,racingBody));assert.equal(racing.calls.length,0);assert(racing.audit.includes("BLOQUEAR_ENVIO_CONTACTO"))
 }
})
test("contacto store: aceptación incierta no se reintenta; cambiar repetición de correo no redirige",async()=>{
 const f=fixture(),body=await f.input();f.setMode("uncertain")
 const first=await f.service.submit(actor,f.row.id,body);assert.equal(first.envio.estado,"REVISION")
 await f.service.submit(actor,f.row.id,body);assert.equal(f.calls.length,1)
 await assert.rejects(f.service.submit(actor,f.row.id,{...body,correoRepetido:"otro@example.invalid"}));assert.equal(f.calls.length,1)
})
test("contacto store: nueva revisión exige motivo y conserva copia/consentimiento anteriores",async()=>{
 const f=fixture(),firstBody=await f.input();await f.service.submit(actor,f.row.id,firstBody)
 const before=structuredClone(f.records[0]);f.row.revision++;f.row.anteroposterior=141
 const computed=parseMeasurements({ap:141,bp:120,di:135,dd:138});Object.assign(f.row,{indiceCraneal:computed.indiceCraneal,indiceAsimetria:computed.indiceAsimetria,diagnostico:computed.diagnostico,recomendacion:computed.recomendacion})
 const next=await f.input();await assert.rejects(f.service.submit(actor,f.row.id,next),/motivo/)
 await f.service.submit(actor,f.row.id,{...next,motivo:"Corregir medida anterior"})
 assert.equal(f.records.length,2);assert.deepEqual(f.records[0],before);assert.equal(f.records[1].anteriorId,before.id);assert.equal(f.calls.length,2)
})

test("contacto store: correo corregido exige nueva autorización y motivo sin inventar revisión clínica",async()=>{
 const f=fixture(),body=await f.input();await f.service.submit(actor,f.row.id,body)
 const original=structuredClone(f.records[0]);f.row.correoPadre="corregido@example.invalid"
 const changed=await f.input();await assert.rejects(f.service.submit(actor,f.row.id,changed),/motivo/)
 await f.service.submit(actor,f.row.id,{...changed,motivo:"Corregir el correo confirmado por el apoderado"})
 assert.equal(f.row.revision,1);assert.equal(f.records.length,2);assert.equal(f.calls.length,2);assert.deepEqual(f.records[0],original)
})
