import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { runInNewContext } from "node:vm"
import * as dateFormat from "../src/lib/results/date-format.ts"
import * as fields from "../src/lib/measurement-fields.ts"
import * as reference from "../src/lib/craneometry-reference.ts"
import { parseMeasurements } from "../src/lib/evaluation-input.ts"
const require=createRequire(import.meta.url),ts=require("typescript"),React=require("react"),{renderToStaticMarkup}=require("react-dom/server")
function component(path,extra={}) {
 const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const loaded={exports:{}},dependencies={"react/jsx-runtime":require("react/jsx-runtime"),"@/lib/results/date-format":dateFormat,"@/lib/measurement-fields":fields,"@/lib/craneometry-reference":reference,...extra}
 runInNewContext(`(function(require,module,exports){${code}\n})`,{})(name=>{if(!(name in dependencies))throw new Error(`Unexpected import: ${name}`);return dependencies[name]},loaded,loaded.exports)
 return loaded.exports
}
const ref=component("../src/components/CraneometryReference.tsx")
const {ResultCard}=component("../src/components/ResultCard.tsx",{"./CraneometryReference":ref})
const identity={nombreBebe:"Bebé ficticio",profesional:"Profesional ficticia",fechaNacimiento:"2026-01-01",evento:null,numero:null,fechaEvaluacion:"2026-11-20T12:00:00Z"}
const base={ap:140,bp:120,di:135,dd:138}
const text=data=>renderToStaticMarkup(React.createElement(ResultCard,{data})).replace(/<[^>]*>/g,"")
test("ficha v2 muestra distancias, CVAI y DPOE reales y CI con un decimal",()=>{
 const medidas={...base,protocolo:reference.REFERENCE_VERSION,distanciaPOEtragusDer:105,distanciaPOEtragusIzq:108}
 const data={...identity,medidas,...parseMeasurements(medidas)},before=structuredClone(data),rendered=text(data)
 assert.match(rendered,/Distancia del punto occipital externo/);assert.match(rendered,/CVAI2,17 %/);assert.match(rendered,/DPOE3 mm/);assert.match(rendered,/Índice craneal: 85,7 %/)
 assert.doesNotMatch(rendered,/Desviación del punto rojo posterior/);assert.deepEqual(data,before)
})
test("ficha v1 conserva etiquetas y valores publicados sin reclasificar como v2",()=>{
 for(const version of [undefined,reference.LEGACY_REFERENCE_VERSION]) {
  const medidas={...base,desviacionDer:5,desviacionIzq:8,...(version?{protocolo:version}:{})}
  const data={...identity,medidas,indiceCraneal:81.23,indiceAsimetria:4,diagnostico:"Diagnóstico histórico guardado",recomendacion:"Recomendación histórica guardada"},before=structuredClone(data),rendered=text(data)
  assert.match(rendered,/Desviación del punto rojo posterior/);assert.match(rendered,/DPOE: 8 mm/);assert.match(rendered,/CVAI: pendiente en el protocolo original/)
  assert.match(rendered,/Índice craneal: 81,2 %/);assert.match(rendered,/CVA · Asimetría: 4 mm/);assert.match(rendered,/Diagnóstico histórico guardado/)
  assert.doesNotMatch(rendered,/Distancia del punto occipital externo|Indicadores craneométricos/);assert.deepEqual(data,before)
 }
})
