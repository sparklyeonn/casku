import test from "node:test"
import assert from "node:assert/strict"
import { resultMailState } from "../src/lib/results/mail-state.ts"
test("correo: solo permite reintentar estados seguros de la primera versión", () => {
  for (const estado of ["PENDIENTE", "FALLIDO"]) {
    assert.equal(resultMailState({ estado }, true).canRetry, true)
    assert.equal(resultMailState({ estado }, false).canRetry, false)
  }
  for (const estado of ["ENVIADO", "ACEPTADO", "ENVIANDO", "BLOQUEADO", "CANCELADO", "RETIRADO", "REVISION", "AGOTADO", "OMITIDO", "desconocido"]) assert.equal(resultMailState({ estado }).canRetry, false)
})
test("correo: respeta espera del servidor y fechas inválidas no habilitan envíos", () => {
  const mail = { estado: "FALLIDO", reintentarDesde: "2026-11-20T12:01:00Z" }
  assert.equal(resultMailState(mail, true, Date.parse("2026-11-20T12:00:00Z")).canRetry, false)
  assert.equal(resultMailState(mail, true, Date.parse(mail.reintentarDesde)).canRetry, true)
  assert.equal(resultMailState({ ...mail, reintentarDesde: "inválida" }).canRetry, false)
})
test("correo: aceptación del proveedor y estados desconocidos no se presentan como pendientes", () => {
  assert.match(resultMailState({ estado: "ACEPTADO" }).text, /no confirma su entrega/)
  assert.match(resultMailState({ estado: "desconocido" }).text, /No pudimos interpretar/)
  assert.match(resultMailState({ estado: "CANCELADO" }).text, /vinculación/)
})
