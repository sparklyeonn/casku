import test from "node:test"
import assert from "node:assert/strict"
import { reviewExpoResult, summarizeExpoReview, EXPO_BATCH_TIME, type ExpoSource } from "../src/lib/results/expo-batch-review.ts"
import { calcularReferencia, REFERENCE_VERSION } from "../src/lib/craneometry-reference.ts"
import { calcularDiagnostico } from "../src/lib/craneometria.ts"
import { CONTACT_CONSENT_VERSION } from "../src/lib/results/contact-policy.ts"
import { PRIVACY_VERSION } from "../src/lib/privacy/policy.ts"
function fixture(): ExpoSource {
 const m={ap:140,bp:120,di:135,dd:138,protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:125,distanciaPOEtragusIzq:128},v=calcularReferencia(m)
 return {id:"evaluation-fake",revision:1,pacienteId:"patient-fake",createdAt:"2026-11-22T15:00:00.000Z",autorId:"kine-fake",anteroposterior:m.ap,biparietal:m.bp,diagonalIzq:m.di,diagonalDer:m.dd,medicionesComplementarias:{protocolo:m.protocolo,distanciaPOEtragusDer:m.distanciaPOEtragusDer,distanciaPOEtragusIzq:m.distanciaPOEtragusIzq},indiceCraneal:v.ci,indiceAsimetria:v.cva,diagnostico:v.diagnostico,recomendacion:v.recomendacion,kinesiologa:"Profesional de prueba",paciente:{nombre:"Bebé de prueba",fechaNacimiento:"2026-01-01",apoderadoId:null,revisionDatos:1},autor:{id:"kine-fake",name:"Profesional de prueba",active:true,role:"KINESIOLOGO",mustChangePassword:false},autorizacion:{id:"permission-fake",revision:1,pacienteId:"patient-fake",eventoId:null,apoderadoId:null,datos:true,versionTexto:PRIVACY_VERSION,correoResultados:false},declarante:"Apoderado de prueba",referenciaAutorizacion:null,canalAutorizacion:"CASILLA_PRESENCIAL",inscripcion:null,eventoNombre:null,correo:"family@example.test",publicacion:null,copias:[]}
}
function authorized(row:ExpoSource) {
 const r=reviewExpoResult(row)
 row.copias.push({revision:row.revision,contexto:r.contexto!,hashDatos:r.hashDatos!,destinatario:r.correo!,nombreApoderado:r.apoderado,autorizacionId:row.autorizacion!.id,autorizacionRevision:row.autorizacion!.revision,actorId:row.autorId!,consentimientoVersion:CONTACT_CONSENT_VERSION,confirmarApoderado:true,autorizarCorreo:true,estado:"PENDIENTE",claveEnvio:"fake-mail",proveedorId:null})
 return row
}
test("lote: permiso de evaluación y correo guardado no se convierten en autorización de envío",()=>{
 const row=fixture(),before=structuredClone(row),r=reviewExpoResult(row)
 assert.deepEqual(r.motivos,["AUTORIZACION_CORREO_PENDIENTE"]);assert.equal(r.estado,"BLOQUEADO");assert.deepEqual(row,before)
 row.autorizacion!.correoResultados=true
 assert(reviewExpoResult(row).motivos.includes("AUTORIZACION_CORREO_PENDIENTE"))
 assert.equal(EXPO_BATCH_TIME,"2026-11-23T13:00:00.000Z")
})
test("lote: consentimiento específico vigente solo habilita revisión final; no programa",()=>{
 const r=reviewExpoResult(authorized(fixture()))
 assert.equal(r.estado,"PENDIENTE_APROBACION_FINAL");assert.deepEqual(r.motivos,[])
 assert.deepEqual(r.indicadores,[{nombre:"CI",valor:"85,7 %",clasificacion:"Braquicefalia leve"},{nombre:"CVA",valor:"3 mm",clasificacion:"Leve"},{nombre:"CVAI",valor:"2,17 %",clasificacion:"Leve"},{nombre:"DPOE",valor:"3 mm",clasificacion:"Normal"}])
 assert.equal(Object.hasOwn(r,"scheduledAt"),false)
})
test("lote: cambios de revisión, correo, autorización y ficha invalidan el consentimiento antiguo",()=>{
 for(const mutate of [(r:ExpoSource)=>r.revision++,(r:ExpoSource)=>{r.correo="other@example.test"},(r:ExpoSource)=>{r.autorizacion!.revision++},(r:ExpoSource)=>{r.paciente.revisionDatos++}]){
  const row=authorized(fixture());mutate(row);assert(reviewExpoResult(row).motivos.includes("AUTORIZACION_CORREO_PENDIENTE"))
 }
})
test("lote: origen clínico, apoderado, datos y supresiones se revisan sin cambios",()=>{
 const row=fixture();row.autor!.active=false;row.declarante="Apoderado presente sin nombre";row.autorizacion!.datos=false;row.correo="invalido"
 const r=reviewExpoResult(row,true)
 for(const code of ["AUTORIA_PENDIENTE","APODERADO_SIN_IDENTIFICAR","DATOS_NO_AUTORIZADOS","CORREO_INVALIDO","DESTINATARIO_SUPRIMIDO"])assert(r.motivos.includes(code))
})
test("lote: una aceptación en ledger y los estados inciertos impiden otro envío",()=>{
 const row=authorized(fixture());row.copias[0].ledgerEstado="ACEPTADO"
 assert(reviewExpoResult(row).motivos.includes("ENVIO_PREVIO"))
 row.copias[0].ledgerEstado="REVISION";assert(reviewExpoResult(row).motivos.includes("ENVIO_INCIERTO"))
})
test("lote: no convierte protocolos históricos ni inventa sus indicadores",()=>{
 const row=fixture(),v=calcularDiagnostico(140,120,135,138)
 row.medicionesComplementarias=null;row.indiceCraneal=v.indiceCraneal;row.indiceAsimetria=v.indiceAsimetria;row.diagnostico=[v.diagCraneal,v.diagAsim].filter(Boolean).join(" + ");row.recomendacion=v.recomendacion
 const r=reviewExpoResult(row);assert(r.motivos.includes("PROTOCOLO_HISTORICO"));assert.deepEqual(r.indicadores,[])
})
test("lote: los límites pendientes se conservan y quedan para revisión",()=>{
 const row=fixture(),m={ap:140,bp:120,di:135,dd:138,protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:125,distanciaPOEtragusIzq:130},v=calcularReferencia(m)
 row.medicionesComplementarias={protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:125,distanciaPOEtragusIzq:130};row.diagnostico=v.diagnostico;row.recomendacion=v.recomendacion
 const r=reviewExpoResult(row);assert(r.motivos.includes("CLASIFICACION_PENDIENTE"));assert.match(r.indicadores[3].clasificacion,/confirmar/)
})
test("lote: varios bebés con el mismo correo mantienen entradas distintas y detecta IDs duplicados",()=>{
 const a=reviewExpoResult(fixture()),b={...a,evaluacionId:"evaluation-other",pacienteId:"patient-other"}
 const r=summarizeExpoReview([a,b]);assert.equal(r.total,2);assert.equal(r.bebes,2);assert.equal(r.direcciones,1);assert.equal(r.correosCompartidos,1);assert.equal(r.bloqueados,2)
 assert.throws(()=>summarizeExpoReview([a,a]),/EVALUACIONES_DUPLICADAS/)
})

test("lote: omitir un indicador pendiente conserva al bebé y los demás indicadores",()=>{
 const row=fixture(),m={ap:140,bp:120,di:135,dd:138,protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:125,distanciaPOEtragusIzq:130},v=calcularReferencia(m)
 row.medicionesComplementarias={protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:125,distanciaPOEtragusIzq:130};row.diagnostico=v.diagnostico;row.recomendacion=v.recomendacion
 const r=reviewExpoResult(row,false,{omitUnconfirmed:true})
 assert.equal(r.evaluacionId,row.id);assert.deepEqual(r.indicadores.map(x=>x.nombre),["CI","CVA","CVAI"]);assert.deepEqual(r.indicadoresOmitidos.map(x=>x.nombre),["DPOE"])
 assert(!r.motivos.includes("CLASIFICACION_PENDIENTE"));assert(r.motivos.includes("AUTORIZACION_CORREO_PENDIENTE"));assert.equal(summarizeExpoReview([r]).totalIndicadoresOmitidos,1)
})
