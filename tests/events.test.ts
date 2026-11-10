import test from "node:test"
import assert from "node:assert/strict"
import { parseEventInput, parseEventId, parseEventEdit, EventInputError } from "../src/lib/events/input.ts"
import { mailEvent, readMailEvent } from "../src/lib/events/mail-snapshot.ts"

const input = { id: "0D6BB472-58D0-4DAB-8E0D-BC0E65197D33", nombre: " Expo Bebé ", fecha: "2026-12-20", lugar: " Santiago ", cupos: 100 }
test("edición: exige revisión y usa el identificador de la ruta, sin aceptar contadores ni actor", () => {
  const edited = parseEventEdit(input.id, { ...input, id: "otro", revision: 2, inscritos: 999, creadoPorId: "otro" })
  assert.equal(edited.id, input.id.toLowerCase()); assert.equal(edited.revision, 2)
  assert(!Object.hasOwn(edited, "inscritos")); assert(!Object.hasOwn(edited, "creadoPorId"))
  for (const revision of [undefined, 0, -1, "1", 1.2]) assert.throws(() => parseEventEdit(input.id, { ...input, revision }), EventInputError)
})
test("confirmación: la copia del evento conserva el día calendario y solo sus datos públicos", () => {
  const row = { nombre: "Evento original", lugar: "Lugar original", fecha: new Date("2026-12-20T00:00:00Z"), inscritos: 5 }
  const snapshot = mailEvent(row)
  row.nombre = "Evento corregido"
  assert.deepEqual(readMailEvent(snapshot), { nombre: "Evento original", lugar: "Lugar original", fecha: "2026-12-20" })
  assert.throws(() => readMailEvent(null)); assert.throws(() => readMailEvent({ ...snapshot, fecha: "inválida" }))
})
test("evento: conserva el día calendario y normaliza los campos", () => {
  const event = parseEventInput(input)
  assert.equal(event.id, input.id.toLowerCase())
  assert.equal(event.nombre, "Expo Bebé"); assert.equal(event.lugar, "Santiago")
  assert.equal(event.fecha.toISOString(), "2026-12-20T00:00:00.000Z")
  assert.equal(parseEventInput({ ...input, fecha: "2024-02-29" }).fecha.toISOString().slice(0, 10), "2024-02-29")
})
test("evento: rechaza fechas imposibles y cupos inválidos", () => {
  for (const fecha of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-04-31", "20/12/2026", "1899-12-31", ""]) assert.throws(() => parseEventInput({ ...input, fecha }), EventInputError)
  for (const cupos of [0, -1, 1.5, Infinity, NaN, 100001, "100", null]) assert.throws(() => parseEventInput({ ...input, cupos }), EventInputError)
})
test("evento: rechaza campos vacíos e identificadores de selección manipulados", () => {
  for (const changes of [{ nombre: " " }, { lugar: " " }, { nombre: "a".repeat(121) }, { lugar: "a".repeat(201) }, { id: "otro-evento" }]) assert.throws(() => parseEventInput({ ...input, ...changes }), EventInputError)
  for (const id of [undefined, null, 1, "", "../admin", "id-inventado"]) assert.throws(() => parseEventId(id), EventInputError)
  assert.throws(() => parseEventInput([]), EventInputError)
})
