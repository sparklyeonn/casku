import test from "node:test"
import assert from "node:assert/strict"
import { calcularReferencia,referenceCI,referenceCVA,referenceDPOE } from "../src/lib/craneometry-reference.ts"
import { parseMeasurements,InvalidEvaluation } from "../src/lib/evaluation-input.ts"
import { measurementForm,measurementValues,validMeasurements } from "../src/lib/measurement-fields.ts"
import { parseSnapshot } from "../src/lib/results/snapshot.ts"
const m={ap:140,bp:120,di:135,dd:138,perimetro:440,desviacionDer:5,desviacionIzq:8}
test("seis medidas: CI y CVA independientes; DPOE es el mayor incluso al invertir lados",()=>{
 const r=calcularReferencia(m)
 assert.equal(r.ci,120/140*100);assert.equal(r.cva,3);assert.equal(r.dpoe,8);assert.equal(r.cvai,null)
 assert.equal(calcularReferencia({...m,desviacionDer:8,desviacionIzq:5}).dpoe,8)
 assert.equal(calcularReferencia({...m,desviacionDer:0,desviacionIzq:0}).dpoe,0)
 assert.equal(calcularReferencia({...m,perimetro:450}).ci,r.ci)
 assert.equal(calcularReferencia({...m,di:138,dd:135}).cva,r.cva)
})
test("tabla Casku literal: categorías, huecos decimales y límites compartidos sin asumir protocolo",()=>{
 for(const [v,label] of [[61.9,"Dolicocefalia muy severa"],[62,"Dolicocefalia severa"],[66,"Dolicocefalia severa"],[67,"Dolicocefalia moderada"],[72,"Dolicocefalia leve"],[76,"Proporción normal"],[83,"Proporción normal"],[84,"Braquicefalia leve"],[88,"Braquicefalia moderada"],[93,"Braquicefalia severa"],[97,"Braquicefalia severa"],[97.1,"Braquicefalia muy severa"]] as const)assert.equal(referenceCI(v),label)
 for(const v of [66.5,71.5,75.5,83.5,87.5,92.5])assert.match(referenceCI(v),/confirmar/)
 for(const [v,label] of [[2.9,"Normal"],[3,"Leve"],[6,"Leve"],[7,"Moderada"],[12,"Moderada"],[13,"Severa"],[18,"Severa"],[18.1,"Muy severa"]] as const)assert.equal(referenceCVA(v),label)
 for(const v of [6.5,12.5])assert.match(referenceCVA(v),/confirmar/)
 for(const v of [5,10,15])assert.match(referenceDPOE(v),/confirmar/)
 assert.equal(referenceDPOE(0),"Normal");assert.equal(referenceDPOE(8),"Leve");assert.equal(referenceDPOE(20),"Severa");assert.equal(referenceDPOE(20.1),"Muy severa")
})
test("servidor: extras completos, cero válido en desviaciones y recálculo sin confiar en valores enviados",()=>{
 const r=parseMeasurements({...m,dpoe:999,cvai:999,diagnostico:"falso"})
 assert.equal(r.desviacionIzq,8);assert.equal(r.indiceAsimetria,3);assert.notEqual(r.diagnostico,"falso");assert(!Object.hasOwn(r,"cvai"))
 assert.equal(parseMeasurements({...m,desviacionDer:0}).desviacionDer,0)
 for(const change of [{perimetro:0},{perimetro:"440"},{desviacionDer:-1},{desviacionIzq:null},{desviacionDer:Infinity},{desviacionIzq:undefined}])assert.throws(()=>parseMeasurements({...m,...change}),InvalidEvaluation)
 const old=parseMeasurements({ap:140,bp:120,di:135,dd:138});assert(!Object.hasOwn(old,"perimetro"));assert(!old.diagnostico.includes("preliminar"))
})
test("formulario: cero no equivale a campo vacío y una ficha completa exige seis medidas",()=>{
 assert(!validMeasurements(measurementValues(measurementForm()),true))
 assert(validMeasurements(measurementValues(measurementForm({...m,desviacionDer:0})),true))
 assert(!validMeasurements(measurementValues({...measurementForm(m),desviacionDer:""}),true))
 assert(!validMeasurements(measurementValues(measurementForm({ap:140,bp:120,di:135,dd:138})),true))
})
test("copia de resultados: conservar siete mediciones y rechazar extras parciales",()=>{
 const s={nombreBebe:"Ficticio",fechaNacimiento:"2026-01-01",profesional:"Prueba",evento:null,numero:null,fechaEvaluacion:"2026-11-18T12:00:00Z",medidas:m,indiceCraneal:120/140*100,indiceAsimetria:3,diagnostico:"Referencia",recomendacion:"Revisar"}
 assert.deepEqual(parseSnapshot(s).medidas,m)
 assert.throws(()=>parseSnapshot({...s,medidas:{...m,desviacionDer:undefined}}))
})

test("seis medidas sin perímetro: calcular, guardar y conservar copias antiguas",()=>{
 const {perimetro,...six}=m
 assert.equal(perimetro,440)
 assert.equal(calcularReferencia(six).dpoe,8)
 const result=parseMeasurements(six)
 assert.equal(result.indiceCraneal,120/140*100)
 assert(!Object.hasOwn(result,"perimetro"))
 const values=measurementValues(measurementForm(six))
 assert(validMeasurements(values,true));assert(!Object.hasOwn(values,"perimetro"))
 assert.equal(measurementValues(measurementForm(m)).perimetro,440,"Conservar perímetro histórico aunque no se edite")
 const s={nombreBebe:"Ficticio",fechaNacimiento:"2026-01-01",profesional:"Prueba",evento:null,numero:null,fechaEvaluacion:"2026-11-19T12:00:00Z",medidas:six,indiceCraneal:result.indiceCraneal,indiceAsimetria:result.indiceAsimetria,diagnostico:result.diagnostico,recomendacion:result.recomendacion}
 assert.deepEqual(parseSnapshot(s).medidas,six)
})
