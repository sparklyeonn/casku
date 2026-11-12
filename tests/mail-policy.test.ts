import test from "node:test"
import assert from "node:assert/strict"
import {calendar,eligible,stageMessage} from "../src/lib/mail-queue/policy.ts"
const policy={version:"prueba",protocolo:"ficticio",plantillasAprobadas:true as const,zona:"America/Santiago" as const,hora:9,tardios:"OMITIR" as const}
test("correos: solo normalidad explícita excluye; los casos mixtos reciben seguimiento",()=>{
 assert.equal(eligible({plagiocefalia:"NORMAL",forma:"ALTERADA"}),"SI")
 assert.equal(eligible({plagiocefalia:"NORMAL",forma:"NORMAL"}),"NO")
 assert.equal(eligible({plagiocefalia:"NORMAL",forma:"PENDIENTE"}),"PENDIENTE")
})
test("calendario de prueba: mes calendario, bisiesto, cambio de año y horario de Chile",()=>{
 for(const [date,expected] of [["2026-01-31T15:00:00Z","2026-02-28T12:00:00.000Z"],["2024-01-31T15:00:00Z","2024-02-29T12:00:00.000Z"],["2026-12-31T15:00:00Z","2027-01-31T12:00:00.000Z"]]) {
  const d=new Date(date);assert.equal(calendar(d,d,policy).MES!.toISOString(),expected)
 }
 const winter=new Date("2026-04-02T15:00:00Z")
 assert.equal(calendar(winter,winter,policy).SEMANA!.toISOString(),"2026-04-09T13:00:00.000Z")
 const late=calendar(new Date("2026-01-01T15:00:00Z"),new Date("2026-02-03T15:00:00Z"),policy)
 assert.deepEqual(late,{INICIAL:null,SEMANA:null,MES:null})
 assert.throws(()=>calendar(winter,winter,{...policy,plantillasAprobadas:false} as never))
})
test("plantillas: reutilizan resultados e indicaciones publicados, sin inventar consejos",()=>{
 const data={nombreBebe:"<Bebé>",fechaNacimiento:"2026-01-01",profesional:"Profesional",evento:null,numero:null,fechaEvaluacion:"2026-01-31T15:00:00Z",medidas:{ap:140,bp:120,di:150,dd:130},indiceCraneal:85.7,indiceAsimetria:20,diagnostico:"Resultado revisado",recomendacion:"Indicación revisada"}
 for(const stage of ["INICIAL","SEMANA","MES"] as const){const result=stageMessage(data,null,stage);assert(result.text.includes(data.recomendacion));assert(result.html.includes("&lt;Bebé&gt;"));assert(!result.text.includes("casco"))}
})
