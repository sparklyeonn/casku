import test from "node:test"
import assert from "node:assert/strict"
import { publishedChangeInput, evaluationId, resultPage, resultRevision, familyResultPath } from "../src/lib/results/input.ts"
import { parseSnapshot } from "../src/lib/results/snapshot.ts"
const snapshot = { nombreBebe: "Bebé ficticio", fechaNacimiento: "2026-01-01", profesional: "Profesional ficticia", evento: "Evento ficticio", numero: 1, fechaEvaluacion: "2026-11-09T12:00:00Z", medidas: { ap: 140, bp: 120, di: 135, dd: 138 }, indiceCraneal: 120 / 140 * 100, indiceAsimetria: 3, diagnostico: "Ejemplo", recomendacion: "Ejemplo" }
test("resultados: la copia publicada conserva datos clínicos y excluye información privada adicional", () => {
  assert.deepEqual(parseSnapshot({ ...snapshot, correo: "privado@example.com", rut: "11111111-1", apoderadoId: "privado" }), snapshot)
  for (const changes of [{ medidas: { ...snapshot.medidas, ap: 0 } }, { indiceCraneal: NaN }, { indiceAsimetria: -1 }, { fechaNacimiento: "2026-02-30" }, { diagnostico: "" }]) assert.throws(() => parseSnapshot({ ...snapshot, ...changes }))
})
test("resultados: revisión, paginación e identificadores se validan antes de operar", () => {
  assert.equal(evaluationId("legacy-evaluation"), "legacy-evaluation")
  assert.equal(resultPage(null), 1); assert.equal(resultPage("2"), 2); assert.equal(resultRevision(1), 1)
  for (const value of [0, -1, 1.5, "1", null, Infinity]) assert.throws(() => resultRevision(value))
  for (const value of ["0", "-1", "1.5", "5001"]) assert.throws(() => resultPage(value))
  for (const value of [null, "", "../otra", "a".repeat(101)]) assert.throws(() => evaluationId(value))
})
test("resultados: el retorno de acceso familiar solo permite rutas internas conocidas", () => {
  const id = "047c4f7f-a32f-4f4a-96c3-39da98abb14f"
  assert.equal(familyResultPath(id), `/familias/resultados/${id}`)
  assert.equal(familyResultPath("lista"), "/familias/resultados")
  for (const value of ["https://example.com", "//example.com", "../admin", null, []]) assert.equal(familyResultPath(value), null)
})

test("publicaciones: cambios requieren identificador, motivo, revisión y confirmación explícita",()=>{
 const value={id:"11111111-1111-4111-8111-111111111111",revisionControl:1,motivo:"Corregir medición anterior",confirmar:true}
 assert.equal(publishedChangeInput(value).motivo,value.motivo)
 for(const change of [{id:"x"},{motivo:""},{motivo:"x".repeat(501)},{confirmar:false},{revisionControl:0},{revisionControl:"1"}])assert.throws(()=>publishedChangeInput({...value,...change}))
})
