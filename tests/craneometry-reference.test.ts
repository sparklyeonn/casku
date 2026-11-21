import test from "node:test"
import assert from "node:assert/strict"
import { calcularReferencia,referenceCI,referenceCVA,referenceCVAI,referenceDPOE,formatCI,REFERENCE_VERSION,LEGACY_REFERENCE_VERSION } from "../src/lib/craneometry-reference.ts"
import { parseMeasurements,InvalidEvaluation } from "../src/lib/evaluation-input.ts"
import { measurementForm,measurementValues,validMeasurements,measurementExtras,readComplementaryValues } from "../src/lib/measurement-fields.ts"
import { parseSnapshot } from "../src/lib/results/snapshot.ts"
const base={ap:140,bp:120,di:135,dd:138}
const m={...base,perimetro:440,protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:105,distanciaPOEtragusIzq:108}
const legacy={...base,perimetro:440,desviacionDer:5,desviacionIzq:8}
test("v2: CVA absoluta, CVAI con diagonal mayor y DPOE diferencia de distancias completas",()=>{
 const r=calcularReferencia(m)
 assert.equal(r.version,REFERENCE_VERSION);assert.equal(r.ci,120/140*100);assert.equal(r.cva,3);assert.equal(r.dpoe,3);assert.equal(r.cvai,3/138*100)
 assert.equal(calcularReferencia({...m,distanciaPOEtragusDer:108,distanciaPOEtragusIzq:105}).dpoe,3)
 assert.equal(calcularReferencia({...m,distanciaPOEtragusDer:108}).dpoe,0)
 assert.equal(calcularReferencia({...m,perimetro:450}).ci,r.ci)
 assert.equal(calcularReferencia({...m,di:138,dd:135}).cvai,r.cvai)
 assert.equal(r.clasificacionCVA,"Leve");assert.equal(r.clasificacionCVAI,"Leve");assert.equal(r.clasificacionDPOE,"Normal")
 assert.match(r.diagnostico,/conjunta pendiente/);assert.match(r.recomendacion,/no determina automáticamente tratamiento/)
})
test("tablas literales: categorías y huecos sin redondear ni asignar límites compartidos",()=>{
 for(const [v,label] of [[61.9,"Dolicocefalia muy severa"],[62,"Dolicocefalia severa"],[66,"Dolicocefalia severa"],[67,"Dolicocefalia moderada"],[72,"Dolicocefalia leve"],[76,"Proporción normal"],[83,"Proporción normal"],[84,"Braquicefalia leve"],[88,"Braquicefalia moderada"],[93,"Braquicefalia severa"],[97,"Braquicefalia severa"],[97.1,"Braquicefalia muy severa"]] as const)assert.equal(referenceCI(v),label)
 for(const v of [66.5,71.5,75.5,83.5,87.5,92.5])assert.match(referenceCI(v),/confirmar/)
 for(const [v,label] of [[2.9,"Normal"],[3,"Leve"],[6,"Leve"],[7,"Moderada"],[12,"Moderada"],[13,"Severa"],[18,"Severa"],[18.1,"Muy severa"]] as const)assert.equal(referenceCVA(v),label)
 for(const v of [6.5,12.5])assert.match(referenceCVA(v),/confirmar/)
 for(const [v,label] of [[0,"Normal"],[1.499,"Normal"],[1.5,"Leve"],[3.5,"Leve"],[3.6,"Moderada"],[6,"Moderada"],[6.1,"Severa"],[8,"Severa"],[8.001,"Muy severa"]] as const)assert.equal(referenceCVAI(v),label)
 for(const v of [3.5001,3.55,3.5999,6.0001,6.05,6.0999])assert.match(referenceCVAI(v),/confirmar/)
 for(const v of [5,10,15])assert.match(referenceDPOE(v),/confirmar/)
 for(const [v,label] of [[0,"Normal"],[4.99,"Normal"],[5.01,"Leve"],[9.99,"Leve"],[10.01,"Moderada"],[14.99,"Moderada"],[15.01,"Severa"],[20,"Severa"],[20.1,"Muy severa"]] as const)assert.equal(referenceDPOE(v),label)
})
test("CI se muestra siempre con un decimal; la presentación no modifica la clasificación",()=>{
 assert.equal(formatCI(80),"80,0");assert.equal(formatCI(120/140*100),"85,7")
 assert.equal(formatCI(83.04),"83,0");assert.match(referenceCI(83.04),/confirmar/)
})
test("servidor v2: recálculo, distancias positivas completas y versión explícita",()=>{
 const r=parseMeasurements({...m,dpoe:999,cvai:999,diagnostico:"falso"})
 assert.equal(r.distanciaPOEtragusIzq,108);assert.equal(r.indiceAsimetria,3);assert.notEqual(r.diagnostico,"falso");assert(!Object.hasOwn(r,"cvai"))
 for(const change of [{protocolo:undefined},{protocolo:LEGACY_REFERENCE_VERSION},{perimetro:0},{perimetro:"440"},{distanciaPOEtragusDer:0},{distanciaPOEtragusDer:-1},{distanciaPOEtragusIzq:null},{distanciaPOEtragusDer:Infinity},{distanciaPOEtragusIzq:undefined},{desviacionDer:5}])assert.throws(()=>parseMeasurements({...m,...change}),InvalidEvaluation)
 const old=parseMeasurements(base);assert(!Object.hasOwn(old,"perimetro"));assert(!old.diagnostico.includes("preliminar"))
})
test("migración lógica: v1 y cambio exclusivo de metadato no permiten calcular v2",()=>{
 for(const input of [legacy,{...legacy,protocolo:LEGACY_REFERENCE_VERSION},{...legacy,protocolo:REFERENCE_VERSION}]) {
  assert.throws(()=>parseMeasurements(input),InvalidEvaluation)
  assert.throws(()=>calcularReferencia(input as unknown as Parameters<typeof calcularReferencia>[0]))
 }
 const form=measurementForm({...legacy,protocolo:LEGACY_REFERENCE_VERSION})
 assert.equal(form.distanciaPOEtragusDer,"");assert.equal(form.distanciaPOEtragusIzq,"")
 assert.equal(form.perimetro,"440");assert.equal(form.di,"135")
 assert(!validMeasurements(measurementValues(form),true))
 const recaptured=measurementValues({...form,distanciaPOEtragusDer:"105",distanciaPOEtragusIzq:"108"})
 assert(validMeasurements(recaptured,true));assert.equal(parseMeasurements(recaptured).protocolo,REFERENCE_VERSION)
})
test("formulario: no equiparar cero o campo vacío con una distancia completa",()=>{
 assert(!validMeasurements(measurementValues(measurementForm()),true))
 assert(validMeasurements(measurementValues(measurementForm(m)),true))
 for(const v of ["","0","-1","Infinity"])assert(!validMeasurements(measurementValues({...measurementForm(m),distanciaPOEtragusDer:v}),true))
 assert(!validMeasurements(measurementValues(measurementForm(base)),true))
})
test("lectura versionada conserva v1 y v2 sin convertir desviaciones en distancias",()=>{
 const v1={perimetro:440,protocolo:LEGACY_REFERENCE_VERSION,desviacionDer:5,desviacionIzq:8}
 assert.deepEqual(readComplementaryValues(v1),v1)
 const v2=measurementExtras(m);assert.deepEqual(readComplementaryValues(v2),v2)
 assert.deepEqual(readComplementaryValues(null),{})
 for(const data of [{...v1,protocolo:REFERENCE_VERSION},{...v2,protocolo:LEGACY_REFERENCE_VERSION},{...v2,desviacionDer:5},{...v2,distanciaPOEtragusDer:0},{...v1,desviacionDer:undefined}])assert.throws(()=>readComplementaryValues(data))
 const zero={...v1,desviacionDer:0};assert.deepEqual(readComplementaryValues(zero),zero)
})
test("copias publicadas históricas: conservar medidas, diagnóstico y recomendación íntegros",()=>{
 const s={nombreBebe:"Ficticio",fechaNacimiento:"2026-01-01",profesional:"Prueba",evento:null,numero:null,fechaEvaluacion:"2026-11-18T12:00:00Z",medidas:legacy,indiceCraneal:120/140*100,indiceAsimetria:3,diagnostico:"Referencia histórica v1",recomendacion:"Recomendación histórica v1"}
 const before=JSON.stringify(s)
 assert.deepEqual(parseSnapshot(s),s);assert.equal(JSON.stringify(s),before)
 assert.throws(()=>parseSnapshot({...s,medidas:{...legacy,desviacionDer:undefined}}))
})
test("seis medidas v2 sin perímetro: cálculo y persistencia explícita de versión",()=>{
 const {perimetro,...six}=m
 assert.equal(perimetro,440);assert.equal(calcularReferencia(six).dpoe,3)
 const result=parseMeasurements(six)
 assert.equal(result.indiceCraneal,120/140*100);assert(!Object.hasOwn(result,"perimetro"))
 const values=measurementValues(measurementForm(six))
 assert(validMeasurements(values,true));assert(!Object.hasOwn(values,"perimetro"))
 assert.equal(measurementExtras(values).protocolo,REFERENCE_VERSION)
})

test("snapshots v2 conservan distancias/versionado y no aceptan renombrado de metadato v1",()=>{
 const r=calcularReferencia(m)
 const s={nombreBebe:"Ficticio",fechaNacimiento:"2026-01-01",profesional:"Prueba",evento:null,numero:null,fechaEvaluacion:"2026-11-18T12:00:00Z",medidas:m,indiceCraneal:r.ci,indiceAsimetria:r.cva,diagnostico:r.diagnostico,recomendacion:r.recomendacion}
 assert.deepEqual(parseSnapshot(s),s)
 for(const medidas of [{...legacy,protocolo:REFERENCE_VERSION},{...m,protocolo:undefined},{...m,desviacionDer:5},{...m,distanciaPOEtragusIzq:undefined},{...m,protocolo:"desconocido"}])assert.throws(()=>parseSnapshot({...s,medidas}))
 const v1={...s,medidas:{...legacy,protocolo:LEGACY_REFERENCE_VERSION},diagnostico:"Histórico sin recalcular",recomendacion:"Histórica sin recalcular"}
 assert.deepEqual(parseSnapshot(v1),v1)
})
