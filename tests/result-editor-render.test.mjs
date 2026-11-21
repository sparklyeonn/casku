import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {runInNewContext} from "node:vm"
import {createRequire} from "node:module"
import React from "react"
import {renderToStaticMarkup} from "react-dom/server"
import ts from "typescript"
import {publicationProblem} from "../src/lib/results/protocol.ts"
import * as editorState from "../src/lib/results/editor-state.ts"
import * as fields from "../src/lib/measurement-fields.ts"
import {REFERENCE_VERSION,LEGACY_REFERENCE_VERSION} from "../src/lib/craneometry-reference.ts"
const require = createRequire(import.meta.url)
const source = readFileSync(new URL("../src/components/ResultEditor.tsx", import.meta.url), "utf8")
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
function render(measures, stored = {}) {
  let displayed
  const modules = {
    "next/link": ({href,children,...props}) => React.createElement("a",{href,...props},children),
    "@/lib/results/editor-state": editorState,
    "@/lib/results/protocol": {publicationProblem},
    "@/lib/measurement-fields": fields,
    "./MeasurementFields": {MeasurementFields:()=>null},
    "./PublishedResultActions": {PublishedResultActions:()=>null},
    "./ResultContactMail": {ResultContactMail:()=>null},
    "./ResultMailPanel": {ResultMailPanel:()=>null},
    "./ResultCard": {ResultCard:({data})=>{displayed=data;return React.createElement("article",null,data.diagnostico)}},
  }
  const exports={}
  runInNewContext(compiled,{exports,require:name=>name in modules?modules[name]:["react","react/jsx-runtime"].includes(name)?require(name):(()=>{throw Error(`Unexpected dependency ${name}`)})()})
  const initial={id:"fixture",revision:1,publicable:true,correoDestino:"verified@example.invalid",motivoBloqueo:null,publicacion:null,datos:{nombreBebe:"Ficticio",medidas:measures,diagnostico:"Diagnóstico guardado sin reinterpretar",recomendacion:"Guardada",...(editorState.draftCalculation(measures).calculated ?? {indiceCraneal:85.7,indiceAsimetria:3}),...stored}}
  const html=renderToStaticMarkup(React.createElement(exports.ResultEditor,{initial}))
  return {html,displayed,initial}
}
const publishButton = html => html.match(/<button[^>]*>Publicar resultado y solicitar correo autorizado<\/button>/)?.[0]
const saveButton = html => html.match(/<button[^>]*>Guardar cambios del borrador<\/button>/)?.[0]
test("pantalla: legacy cuatro permite guardar y respeta la puerta de publicación sin recalcular al abrir",()=>{
  const {html,displayed,initial}=render({ap:140,bp:120,di:135,dd:138})
  assert.ok(saveButton(html));assert(!saveButton(html).includes('disabled=""'))
  assert.equal(publicationProblem(initial.datos),null)
  assert.ok(publishButton(html));assert(!publishButton(html).includes('disabled=""'))
  assert(!html.includes("Hay cambios sin guardar"));assert(!html.includes("Vista previa con cambios"))
  assert.strictEqual(displayed,initial.datos)
})
test("pantalla: seis v1 exige recaptura y explica bloqueo",()=>{
  const {html,displayed,initial}=render({ap:140,bp:120,di:135,dd:138,protocolo:LEGACY_REFERENCE_VERSION,desviacionDer:5,desviacionIzq:8})
  assert(saveButton(html).includes('disabled=""'));assert(publishButton(html).includes('disabled=""'))
  assert(html.includes("recaptura ambas distancias"));assert(!html.includes("Vista previa con cambios"))
  assert.strictEqual(displayed,initial.datos)
})
test("pantalla: v2 ya guardado habilita publicación y conserva su resultado",()=>{
  const {html,displayed,initial}=render({ap:140,bp:120,di:135,dd:138,protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:125,distanciaPOEtragusIzq:128})
  assert(!publishButton(html).includes('disabled=""'));assert(!html.includes("Registro histórico:"))
  assert.strictEqual(displayed,initial.datos)
})

test("pantalla: legacy cuatro desactualizado exige guardar, sin aflojar igualdad clínica",()=>{
  const {html,displayed,initial}=render({ap:140,bp:120,di:135,dd:138},{diagnostico:"Diagnóstico desactualizado"})
  assert(!saveButton(html).includes('disabled=""'))
  assert(publishButton(html).includes('disabled=""'))
  assert(html.includes("Revisa y guarda las medidas antes de publicar"))
  assert.strictEqual(displayed,initial.datos)
})
