import test from "node:test"
import assert from "node:assert/strict"
import { measurementForm, measurementValues } from "../src/lib/measurement-fields.ts"
import { REFERENCE_VERSION, LEGACY_REFERENCE_VERSION } from "../src/lib/craneometry-reference.ts"
import { draftCalculation, resultEditorState, resultResponse } from "../src/lib/results/editor-state.ts"

test("editor: los errores clínicos de una vista previa no cierran el borrador", () => {
  const result = draftCalculation({ ap: 140, bp: 120, di: 135, dd: 138, perimetro: 400 })
  assert.equal(result.calculated, null)
  assert.ok(result.error)
  const invalid = draftCalculation({ ap: 0, bp: 120, di: 135, dd: 138 })
  assert.equal(invalid.calculated, null)
  assert.ok(invalid.error)
})
test("editor: acepta vistas previas históricas sin inventar desviaciones", () => {
  const measures = { ap: 140, bp: 120, di: 135, dd: 138 }
  const before = { ...measures }
  const result = draftCalculation(measures)
  assert.ok(result.calculated)
  assert.equal(result.calculated.desviacionDer, undefined)
  assert.deepEqual(measures, before)
})
test("editor: respuestas vacías, HTML, sesión vencida y conflicto son recuperables", async () => {
  await assert.rejects(resultResponse(new Response("<html>Acceso</html>", { status: 401 })), /sesión/)
  await assert.rejects(resultResponse(new Response("", { status: 409 })), /Recarga/)
  await assert.rejects(resultResponse(new Response("", { status: 503 })), /estado guardado/)
  await assert.rejects(resultResponse(Response.json({ resultado: null })), /estado guardado/)
  await assert.rejects(resultResponse(Response.json({ error: "Autorización retirada" }, { status: 409 })), /Autorización retirada/)
  const data = { resultado: { id: "ficticio", datos: { medidas: { ap: 140 } } }, aviso: "Publicado; correo sin confirmar" }
  assert.deepEqual(await resultResponse(Response.json(data)), data)
})

test("editor v2: abrir un histórico no copia desviaciones ni inventa distancias", () => {
  const saved = { ap: 140, bp: 120, di: 135, dd: 138, protocolo: LEGACY_REFERENCE_VERSION, desviacionDer: 5, desviacionIzq: 8 }
  const original = { ...saved }
  const form = measurementForm(saved)
  assert.equal(form.distanciaPOEtragusDer, "")
  assert.equal(form.distanciaPOEtragusIzq, "")
  assert.equal(draftCalculation(measurementValues(form)).calculated, null)
  assert.deepEqual(saved, original)
  const recaptured = measurementValues({ ...form, distanciaPOEtragusDer: "120", distanciaPOEtragusIzq: "126" })
  assert.equal(recaptured.protocolo, REFERENCE_VERSION)
  assert.equal(recaptured.desviacionDer, undefined)
  assert.ok(draftCalculation(recaptured).calculated)
  assert.deepEqual(saved, original)
})

test("editor: cuatro medidas legacy siguen editables sin adopción automática v2", () => {
  const saved = { ap: 140, bp: 120, di: 135, dd: 138 }
  const initial = resultEditorState(saved, measurementForm(saved))
  assert.equal(initial.changed, false); assert.equal(initial.valid, true); assert.equal(initial.keepFour, true)
  assert.equal(initial.calculated, null); assert.deepEqual(initial.measures, saved)
  const edited = resultEditorState(saved, { ...measurementForm(saved), ap: "141" })
  assert.equal(edited.valid, true); assert.equal(edited.changed, true); assert.ok(edited.calculated)
  assert.equal(edited.measures.protocolo, undefined)
  assert.equal(edited.measures.distanciaPOEtragusDer, undefined)
  const recaptured = resultEditorState(saved, { ...measurementForm(saved), distanciaPOEtragusDer: "125", distanciaPOEtragusIzq: "128" })
  assert.equal(recaptured.valid, true); assert.equal(recaptured.measures.protocolo, REFERENCE_VERSION)
})
test("editor: seis medidas v1 exigen recaptura y nunca copian desviaciones", () => {
  for (const protocolo of [undefined, LEGACY_REFERENCE_VERSION]) {
    const saved = { ap: 140, bp: 120, di: 135, dd: 138, ...(protocolo ? { protocolo } : {}), desviacionDer: 5, desviacionIzq: 8 }
    const baseline = measurementForm(saved)
    const initial = resultEditorState(saved, baseline)
    assert.equal(initial.changed, false); assert.equal(initial.valid, false); assert.equal(initial.recapture, true)
    assert.equal(initial.calculated, null)
    assert.equal(resultEditorState(saved, { ...baseline, ap: "141" }).valid, false)
    assert.equal(resultEditorState(saved, { ...baseline, distanciaPOEtragusDer: "125" }).valid, false)
    const recaptured = resultEditorState(saved, { ...baseline, distanciaPOEtragusDer: "125", distanciaPOEtragusIzq: "128" })
    assert.equal(recaptured.valid, true); assert.equal(recaptured.changed, true)
    assert.equal(recaptured.measures.protocolo, REFERENCE_VERSION)
    assert.equal(recaptured.measures.desviacionDer, undefined)
    assert.equal(saved.desviacionDer, 5)
  }
})
test("editor: v2 conserva valores y protocolo, sin recalcular ni detectar cambios de formato", () => {
  const saved = { ap: 140, bp: 120, di: 135, dd: 138, perimetro: 440, protocolo: REFERENCE_VERSION, distanciaPOEtragusDer: 125, distanciaPOEtragusIzq: 128 }
  const form = measurementForm(saved)
  const initial = resultEditorState(saved, form)
  assert.equal(initial.valid, true); assert.equal(initial.changed, false); assert.equal(initial.calculated, null)
  assert.deepEqual(initial.measures, saved)
  assert.equal(resultEditorState(saved, { ...form, ap: "140.0" }).changed, false)
  const edited = resultEditorState(saved, { ...form, distanciaPOEtragusDer: "126" })
  assert.equal(edited.valid, true); assert.equal(edited.changed, true); assert.ok(edited.calculated)
  assert.equal(edited.measures.perimetro, 440)
  assert.equal(resultEditorState(saved, { ...form, distanciaPOEtragusDer: "", distanciaPOEtragusIzq: "" }).valid, false)
  assert.equal(resultEditorState(saved, { ...form, distanciaPOEtragusDer: "0" }).valid, false)
  assert.equal(resultEditorState(saved, { ...form, ap: "" }).valid, false)
  assert.equal(resultEditorState(saved, { ...form, ap: "141" }, false).calculated, null)
})

test("editor: corregir cuatro medidas conserva el protocolo original y permite adopción explícita v2", () => {
  const saved = { ap: 140, bp: 120, di: 135, dd: 138 }, form = measurementForm(saved)
  const corrected = resultEditorState(saved, { ...form, ap: "141" })
  assert.equal(corrected.valid, true); assert.equal(corrected.changed, true)
  assert.equal(corrected.measures.protocolo, undefined)
  assert.equal(corrected.measures.desviacionDer, undefined)
  assert.equal(corrected.measures.distanciaPOEtragusDer, undefined)
  const recaptured = resultEditorState(saved, { ...form, distanciaPOEtragusDer: "125", distanciaPOEtragusIzq: "128" })
  assert.equal(recaptured.valid, true); assert.equal(recaptured.measures.protocolo, REFERENCE_VERSION)
})
