import test from "node:test"
import assert from "node:assert/strict"
import { publicationProblem, revisedMeasurements, sameMeasurements } from "../src/lib/results/protocol.ts"
import { REFERENCE_VERSION,LEGACY_REFERENCE_VERSION } from "../src/lib/craneometry-reference.ts"
import { parseMeasurements } from "../src/lib/evaluation-input.ts"
import { measurementForm,measurementValues } from "../src/lib/measurement-fields.ts"
import { draftCalculation } from "../src/lib/results/editor-state.ts"
import { resultMessage } from "../src/lib/results/message.ts"
const base={ap:140,bp:120,di:135,dd:138}
const v2={...base,protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:105,distanciaPOEtragusIzq:108}
const old={...base,protocolo:LEGACY_REFERENCE_VERSION,desviacionDer:5,desviacionIzq:8,perimetro:440}
const identity={nombreBebe:"Ficticio",profesional:"Profesional ficticia",fechaNacimiento:"2026-01-01",evento:null,numero:null,fechaEvaluacion:"2026-11-20T12:00:00Z"}
const current={...identity,medidas:v2,...parseMeasurements(v2)}

test("publicación acepta cuatro medidas históricas validadas y v2 explícito; no convierte v1 de seis medidas",()=>{
 for(const medidas of [old,{...old,protocolo:REFERENCE_VERSION}])assert.ok(publicationProblem({...current,medidas}))
 const historical={...current,medidas:base,...parseMeasurements(base)}
 assert.equal(publicationProblem(historical),null)
 assert.ok(publicationProblem({...historical,diagnostico:"Desactualizado"}))
 assert.deepEqual(revisedMeasurements(base,{...base,ap:141}),parseMeasurements({...base,ap:141}))
 assert.equal(publicationProblem(current),null)
 for(const field of ["indiceCraneal","indiceAsimetria","diagnostico","recomendacion"] as const)assert.ok(publicationProblem({...current,[field]:typeof current[field]==="number"?999:"Alterado"}))
})
test("recaptura conserva perímetro, valida distancias y recalcula textos enviados",()=>{
 const before=structuredClone(old),saved=revisedMeasurements(old,{...v2,diagnostico:"No confiable"} as typeof v2)
 assert.equal(saved.perimetro,440);assert.equal(saved.protocolo,REFERENCE_VERSION);assert.notEqual(saved.diagnostico,"No confiable");assert.equal(saved.desviacionDer,undefined)
 assert.deepEqual(old,before)
 for(const input of [base,old,{...old,protocolo:REFERENCE_VERSION},{...v2,distanciaPOEtragusIzq:undefined}])assert.throws(()=>revisedMeasurements(old,input))
})
test("igualdad incluye versión y ambas distancias aunque todos los índices sean iguales",()=>{
 assert(sameMeasurements(v2,{...v2}))
 assert(!sameMeasurements(v2,{...v2,distanciaPOEtragusDer:106,distanciaPOEtragusIzq:109}))
 assert(!sameMeasurements(base,v2));assert(!sameMeasurements(old,v2))
})
test("factory/preview: sin versión explícita no se habilita v2 ni al reutilizar claves nuevas",()=>{
 const {protocolo,...unversioned}=v2
 assert.equal(protocolo,REFERENCE_VERSION)
 assert.equal(draftCalculation(unversioned).calculated,null)
 assert.equal(measurementForm(unversioned).distanciaPOEtragusDer,"")
 const pending=measurementValues(measurementForm(old));assert.equal(pending.protocolo,REFERENCE_VERSION);assert.equal(draftCalculation(pending).calculated,null)
 assert.equal(publicationProblem({...current,medidas:pending})?.includes("distancias"),true)
})
test("correo v2 incluye CVAI y DPOE reales, CI un decimal y etiquetas de distancias",()=>{
 const message=resultMessage(current,null)
 assert.match(message.text,/Índice craneal: 85,7 %/);assert.match(message.text,/DPOE: 3 mm/);assert.match(message.text,/CVAI: 2,17 %/)
 assert.match(message.text,/Distancia del punto occipital externo/);assert.doesNotMatch(message.text,/Desviación|CVAI: pendiente/)
 assert.match(message.html,/85,7 %/);assert.match(message.html,/CVAI: 2,17 %/)
})
test("correo histórico conserva etiquetas, máximo original y textos; no transforma v1",()=>{
 const saved={...current,medidas:old,indiceCraneal:81.23,diagnostico:"Diagnóstico histórico",recomendacion:"Texto histórico"},before=structuredClone(saved)
 const message=resultMessage(saved,null)
 assert.match(message.text,/Desviación del punto rojo posterior/);assert.match(message.text,/DPOE: 8 mm/);assert.match(message.text,/CVAI: pendiente en el protocolo histórico v1/)
 assert.match(message.text,/Índice craneal: 81,2 %/);assert.match(message.text,/Diagnóstico histórico/);assert.match(message.text,/Texto histórico/)
 assert.doesNotMatch(message.text,/Distancia del punto occipital externo/);assert.deepEqual(saved,before)
})

test("correo de cuatro medidas publicable conserva fórmula y textos históricos sin inventar DPOE ni CVAI",()=>{
 const result=parseMeasurements(base)
 const historical={...current,medidas:base,...result}
 assert.equal(publicationProblem(historical),null)
 const message=resultMessage(historical,null)
 assert.match(message.text,/Índice craneal: 85,7 %/)
 assert.ok(message.text.includes(result.diagnostico));assert.ok(message.text.includes(result.recomendacion))
 assert.doesNotMatch(message.text,/DPOE|CVAI|Protocolo v2|Distancia del punto occipital externo/)
 assert.doesNotMatch(message.html,/DPOE|CVAI|Protocolo v2/)
})
