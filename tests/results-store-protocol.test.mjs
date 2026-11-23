// Pruebas del store real con transacciones simuladas: no servidor, conexiones ni envkeys.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { runInNewContext } from "node:vm"
import { createHash } from "node:crypto"
import { REFERENCE_VERSION,LEGACY_REFERENCE_VERSION } from "../src/lib/craneometry-reference.ts"
import * as fields from "../src/lib/measurement-fields.ts"
import * as input from "../src/lib/evaluation-input.ts"
import * as snapshot from "../src/lib/results/snapshot.ts"
import * as expoDelivery from "../src/lib/results/expo-delivery.ts"
import * as contactPublication from "../src/lib/results/contact-publication.ts"
import * as protocol from "../src/lib/results/protocol.ts"
import * as resultInput from "../src/lib/results/input.ts"
const require=createRequire(import.meta.url),ts=require("typescript")
const code=ts.transpileModule(readFileSync(new URL("../src/lib/results/store.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const base={ap:140,bp:120,di:135,dd:138}
const v2={...base,protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:105,distanciaPOEtragusIzq:108}
const legacy={...base,protocolo:LEGACY_REFERENCE_VERSION,desviacionDer:5,desviacionIzq:8,perimetro:440}
function harness(measures=legacy,{published=false,family=true,consent=true,expoScheduled=false}={}) {
 const calls={revisions:[],versions:[],publications:[],mailPlans:[],publicationUpdates:[]}
 const result=protocol.legacyFour(measures)||measures.protocolo===REFERENCE_VERSION?input.parseMeasurements(measures):{indiceCraneal:85.71,indiceAsimetria:3,diagnostico:"Diagnóstico v1 intacto",recomendacion:"Recomendación v1 intacta"}
 const row={id:"evaluation",revision:1,autorId:"staff",autorizacionId:"consent",pacienteId:"baby",kinesiologa:"Profesional ficticia",createdAt:new Date("2026-11-20T12:00:00Z"),paciente:{nombre:"Bebé ficticio",fechaNacimiento:new Date("2026-01-01T00:00:00Z"),apoderadoId:"family"},fila:{estado:"ATENDIDO",inscripcion:{pacienteId:"baby",numero:1,evento:{nombre:"Evento ficticio"},apoderado:{id:"family",activo:family,correo:"ficticio@example.invalid"}}},anteroposterior:measures.ap,biparietal:measures.bp,diagonalIzq:measures.di,diagonalDer:measures.dd,medicionesComplementarias:measures.protocolo?fields.measurementExtras(measures):null,indiceCraneal:result.indiceCraneal,indiceAsimetria:result.indiceAsimetria,diagnostico:result.diagnostico,recomendacion:result.recomendacion,publicacion:null}
 const original={nombreBebe:row.paciente.nombre,fechaNacimiento:"2026-01-01",profesional:row.kinesiologa,evento:"Evento ficticio",numero:1,fechaEvaluacion:row.createdAt.toISOString(),medidas:structuredClone(measures),indiceCraneal:row.indiceCraneal,indiceAsimetria:row.indiceAsimetria,diagnostico:row.diagnostico,recomendacion:row.recomendacion}
 if(published)row.publicacion={id:"11111111-1111-4111-8111-111111111111",apoderadoId:"family",versionActual:1,revision:1,revisionControl:1,estado:"VIGENTE",publicadoPorId:"staff",publicadoAt:new Date(),datos:structuredClone(original),versiones:[],ordenesCorreo:[],correo:null}
 const tx={
  $queryRaw:async()=>[{id:row.id}],
  evaluacion:{findUniqueOrThrow:async()=>row,findFirst:async()=>row,update:async({data})=>{const {revision,...values}=data;if(typeof values.medicionesComplementarias==="symbol")values.medicionesComplementarias=null;Object.assign(row,values);row.revision+=revision?.increment??0;return row}},
  revisionEvaluacion:{create:async({data})=>calls.revisions.push(structuredClone(data))},
  envioTransaccional:{findUnique:async({where})=>expoScheduled&&where.clave===expoDelivery.expoResultKey(row.id,row.revision)?{clave:where.clave,finalidad:"RESULTADO",estado:"ACEPTADO",disponibleAt:new Date(Date.now()+60000),entrega:"SIN_CONFIRMAR"}:null},
  resultadoContacto:{findMany:async()=>[],updateMany:async()=>({count:0})},
  resultadoPublicado:{create:async({data})=>calls.publications.push(structuredClone(data)),update:async({data})=>{calls.publicationUpdates.push(structuredClone(data));Object.assign(row.publicacion,{...data,revisionControl:row.publicacion.revisionControl+1})}},
  versionResultado:{createMany:async({data})=>calls.versions.push(...structuredClone(data)),create:async({data})=>calls.versions.push(structuredClone(data))},
  cuentaEquipo:{findUnique:async()=>({active:true,role:"KINESIOLOGO",version:1})},cambioResultado:{findUnique:async()=>null,create:async()=>{}},
  ordenCorreo:{count:async()=>0,updateMany:async()=>{}},correoResultado:{count:async()=>0,updateMany:async()=>{}}
 }
 const prisma={...tx,$transaction:async action=>action(tx)}
 const DbNull=Symbol("DbNull"),stubs={
  "@/lib/measurement-fields":fields,"@/lib/measurement-storage":{complementaryValues:fields.readComplementaryValues,complementaryData:m=>m.protocolo?fields.measurementExtras(m):DbNull},
  "@/lib/mail-queue/store":{draftMailPlan:async(...args)=>calls.mailPlans.push(args.slice(1))},
  "@/lib/privacy/store":{trace:async()=>{},requireDataConsent:async()=>{if(!consent)throw new Error("Autorización retirada");return {correoResultados:false}}},
  "@/lib/families/security":{privateHash:value=>createHash("sha256").update(value).digest("hex")},"node:crypto":require("node:crypto"),"@prisma/client":{Prisma:{DbNull}},"@/lib/prisma":{prisma},
  "@/lib/kinesiology/http":{AttentionConflict:class extends Error{},AttentionUnavailable:class extends Error{}},"@/lib/evaluation-input":input,"./snapshot":snapshot,"./protocol":protocol,"./expo-delivery":expoDelivery,"./contact-publication":contactPublication
 }
 const loaded={exports:{}}
 runInNewContext(`(function(require,module,exports,process){${code}\n})`,{})(name=>{if(!(name in stubs))throw new Error(`Unexpected import: ${name}`);return stubs[name]},loaded,loaded.exports,{env:{}})
 return {store:loaded.exports,row,calls,original}
}
const actor={id:"staff",version:1},change={id:"22222222-2222-4222-8222-222222222222",revisionControl:1,motivo:"Recaptura explícita de distancias",confirmar:true}
test("store: recaptura v1→v2 conserva anterior y perímetro; cambios solo de distancias no se pierden",async()=>{
 const {store,row,calls}=harness()
 const old=structuredClone(row.medicionesComplementarias)
 await store.reviseResult("staff",row.id,1,input.parseMeasurements(v2))
 assert.equal(row.medicionesComplementarias.protocolo,REFERENCE_VERSION);assert.equal(row.medicionesComplementarias.perimetro,440);assert.equal(calls.revisions.length,1)
 assert.deepEqual(calls.revisions[0].anterior.medidas,{...base,...old})
 const moved=input.parseMeasurements({...v2,perimetro:440,distanciaPOEtragusDer:106,distanciaPOEtragusIzq:109})
 await store.reviseResult("staff",row.id,2,moved)
 assert.equal(row.revision,3);assert.equal(row.medicionesComplementarias.distanciaPOEtragusDer,106)
 await store.reviseResult("staff",row.id,3,moved)
 assert.equal(row.revision,3);assert.equal(calls.revisions.length,2)
})
test("store: publicación rechaza seis medidas v1 y v2 con resultados desactualizados",async()=>{
 for(const measures of [legacy]) {
  const {store,row,calls}=harness(measures)
  await assert.rejects(store.publishResult("staff",row.id,1),/histórico.*recaptura/i)
  assert.equal(calls.publications.length,0);assert.equal(calls.mailPlans.length,0)
  const review=await store.ownedReview("staff",row.id);assert.equal(review.publicable,false)
 }
 const {store,row,calls}=harness(v2);row.diagnostico="Texto desactualizado"
 await assert.rejects(store.publishResult("staff",row.id,1),/Revisa y guarda/);assert.equal(calls.publications.length,0)
})
test("store: publicar v2 mantiene autorización familiar y snapshot versionado",async()=>{
 const {store,row,calls}=harness(v2)
 await store.publishResult("staff",row.id,1)
 assert.equal(calls.publications[0].datos.medidas.protocolo,REFERENCE_VERSION)
 assert.equal(calls.publications[0].datos.medidas.distanciaPOEtragusIzq,108)
 assert.equal(calls.publications[0].correo.create.estado,"CANCELADO")
 for(const options of [{family:false},{consent:false}]) {
  const denied=harness(v2,options)
  await assert.rejects(denied.store.publishResult("staff",denied.row.id,1));assert.equal(denied.calls.publications.length,0)
 }
})
test("store: corrección v1→v2 crea nueva versión sin tocar snapshot publicado anterior",async()=>{
 const {store,row,calls,original}=harness(legacy,{published:true})
 await store.changePublishedResult(actor,row.id,"CORREGIR",change,input.parseMeasurements(v2))
 assert.deepEqual(row.publicacion.datos,original)
 assert.deepEqual(calls.versions[0].datos,original)
 assert.deepEqual(calls.revisions[0].anterior,original)
 assert.equal(calls.versions[1].numero,2);assert.equal(calls.versions[1].datos.medidas.protocolo,REFERENCE_VERSION)
 assert.equal(calls.versions[1].datos.medidas.perimetro,440)
})
test("store: corrección incluye distancias nuevas en comparación y bloquea downgrade/no cambio",async()=>{
 const changed=harness(v2,{published:true})
 await changed.store.changePublishedResult(actor,changed.row.id,"CORREGIR",change,input.parseMeasurements({...v2,distanciaPOEtragusDer:106,distanciaPOEtragusIzq:109}))
 assert.equal(changed.calls.versions.at(-1).datos.medidas.distanciaPOEtragusDer,106)
 for(const measures of [input.parseMeasurements(base),input.parseMeasurements(v2)]) {
  const current=harness(v2,{published:true})
  await assert.rejects(current.store.changePublishedResult(actor,current.row.id,"CORREGIR",change,measures))
  assert.equal(current.calls.revisions.length,0);assert.equal(current.calls.publicationUpdates.length,0)
 }
})
test("store: retiro e idempotencia de publicación histórica no recalculan ni reescriben v1",async()=>{
 const {store,row,calls,original}=harness(legacy,{published:true})
 const existing=await store.publishResult("staff",row.id,1)
 assert.equal(existing.nueva,false);assert.equal(calls.publications.length,0)
 await store.changePublishedResult(actor,row.id,"RETIRAR",change)
 assert.deepEqual(row.publicacion.datos,original);assert.equal(calls.revisions.length,0);assert.equal(row.publicacion.estado,"RETIRADO")
})

test("store: borrador de cuatro medidas conserva protocolo al editar y publicar",async()=>{
 const {store,row,calls}=harness(base)
 await store.reviseResult("staff",row.id,1,input.parseMeasurements({...base,bp:121}))
 assert.equal(row.medicionesComplementarias,null)
 assert.equal(calls.revisions[0].nueva.medidas.protocolo,undefined)
 const review=await store.ownedReview("staff",row.id)
 assert.equal(review.publicable,true)
 await store.publishResult("staff",row.id,2)
 assert.deepEqual(calls.publications[0].datos.medidas,{...base,bp:121})
 assert.equal(calls.publications[0].datos.medidas.protocolo,undefined)
})

test("store: una corrección conserva literalmente la publicación original sin protocolo",async()=>{
 const historical={...base,desviacionDer:5,desviacionIzq:8}
 const {store,row,calls,original}=harness(historical,{published:true})
 await store.changePublishedResult(actor,row.id,"CORREGIR",change,input.parseMeasurements(v2))
 assert.deepEqual(row.publicacion.datos,original)
 assert.deepEqual(calls.versions[0].datos,original)
 assert.equal(calls.versions[0].datos.medidas.protocolo,undefined)
 assert.equal(calls.versions[1].datos.medidas.protocolo,REFERENCE_VERSION)
})
test("store: conflictos de revisión, ausencia de consentimiento y familia distinta no escriben correcciones",async()=>{
 const stale=harness(v2)
 await assert.rejects(stale.store.reviseResult("staff",stale.row.id,99,input.parseMeasurements(v2)),/cambió/)
 assert.equal(stale.calls.revisions.length,0)
 for(const options of [{published:true,family:false},{published:true,consent:false}]) {
  const denied=harness(legacy,options)
  await assert.rejects(denied.store.changePublishedResult(actor,denied.row.id,"CORREGIR",change,input.parseMeasurements(v2)))
  assert.equal(denied.calls.revisions.length,0);assert.equal(denied.calls.publicationUpdates.length,0)
 }
 const mismatch=harness(legacy,{published:true});mismatch.row.publicacion.apoderadoId="otra-family"
 await assert.rejects(mismatch.store.changePublishedResult(actor,mismatch.row.id,"CORREGIR",change,input.parseMeasurements(v2)),/vinculación/)
 assert.equal(mismatch.calls.revisions.length,0)
})

function httpRoutes(fixture) {
 const mail=[]
 const dependencies={
  "@/lib/kinesiology/http":{
   clinicalAccess:async()=>({user:actor}),clinicalJson:request=>request.json(),clinicalResponse:(data,status=200)=>Response.json(data,{status}),
   clinicalFailure:error=>Response.json({error:error.message},{status:error instanceof input.InvalidEvaluation?400:409})
  },"@/lib/results/input":resultInput,"@/lib/results/store":fixture.store,"@/lib/evaluation-input":input,"@/lib/results/mail":{deliverResult:async id=>mail.push(id)}
 }
 function load(path) {
  const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const exports={}
  runInNewContext(code,{exports,require:name=>{if(!(name in dependencies))throw new Error(`Unexpected import: ${name}`);return dependencies[name]}})
  return exports
 }
 const publication=load("../src/app/api/kinesiologia/resultados/[id]/publicar/route.ts"),draft=load("../src/app/api/kinesiologia/resultados/[id]/route.ts")
 const request=body=>new Request("http://fixture.invalid",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})
 const context={params:Promise.resolve({id:fixture.row.id})}
 return {mail,publish:revision=>publication.POST(request({revision}),context),save:body=>draft.PATCH(request(body),context)}
}
test("HTTP aislado: v1 rechaza publicar 409 y reenviar desviaciones 400; recaptura v2 guarda 200 y publica 201",async()=>{
 const fixture=harness(),http=httpRoutes(fixture)
 let response=await http.publish(1)
 assert.equal(response.status,409);assert.match((await response.json()).error,/recaptura/)
 assert.equal(http.mail.length,0)
 assert.equal((await http.save({revision:1,...legacy})).status,400)
 response=await http.save({revision:1,...v2})
 assert.equal(response.status,200)
 const saved=(await response.json()).resultado
 assert.equal(saved.datos.medidas.protocolo,REFERENCE_VERSION);assert.equal(saved.datos.medidas.distanciaPOEtragusIzq,108)
 assert.equal((await http.publish(saved.revision)).status,201)
 assert.equal(http.mail.length,1);assert.equal(fixture.calls.publications.length,1)
})
test("HTTP aislado: cuatro medidas admiten edición y publicación histórica; v2 no admite downgrade",async()=>{
 const historical=harness(base),http=httpRoutes(historical)
 assert.equal((await http.save({revision:1,...base,bp:121})).status,200)
 assert.equal((await http.publish(2)).status,201)
 const current=harness(v2),v2http=httpRoutes(current)
 assert.equal((await v2http.save({revision:1,...base})).status,400)
 assert.equal(current.calls.revisions.length,0);assert.equal(http.mail.length,1)
})

test("store: cuatro medidas publicadas se corrigen como cuatro sin DPOE/CVAI ni protocolo v2",async()=>{
 const {store,row,calls,original}=harness(base,{published:true})
 const corrected=input.parseMeasurements({...base,ap:141})
 await store.changePublishedResult(actor,row.id,"CORREGIR",change,corrected)
 assert.deepEqual(row.publicacion.datos,original)
 assert.deepEqual(calls.versions[0].datos,original)
 assert.deepEqual(calls.versions[1].datos.medidas,{...base,ap:141})
 assert.equal(calls.versions[1].datos.diagnostico,corrected.diagnostico)
 assert.equal(calls.versions[1].datos.medidas.protocolo,undefined)
 assert.equal(calls.versions[1].datos.medidas.distanciaPOEtragusDer,undefined)
 assert.equal(calls.versions[1].datos.medidas.desviacionDer,undefined)
 assert.equal(row.medicionesComplementarias,null)
})

test("store: una revisión con correo futuro requiere cancelar antes de editar",async()=>{
 const {store,row,calls}=harness(v2,{expoScheduled:true})
 await assert.rejects(store.reviseResult("staff",row.id,1,input.parseMeasurements({...v2,di:134})),/cancelar ese correo/)
 assert.equal(row.revision,1);assert.equal(calls.revisions.length,0)
})
