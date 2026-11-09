import test from "node:test"
import assert from "node:assert/strict"
import { chooseNext, type QueueCandidate } from "../src/lib/queue/policy.ts"
import { parseOnsiteInput } from "../src/lib/reception/onsite-input.ts"
import { FamilyInputError } from "../src/lib/families/input.ts"
const now = new Date("2026-11-09T15:00:00Z")
const row = (id: string, origen: QueueCandidate["origen"], minutes: number, orden = 1): QueueCandidate => ({ id, origen, orden, llegadaAt: new Date(now.getTime() - minutes * 60000) })

test("fila: tres previas y una del día aunque la presencial llegue antes", () => {
  const previous = Array.from({ length: 9 }, (_, i) => row(`p${i}`, "PREVIA", 5, i + 2)), walkin = Array.from({ length: 3 }, (_, i) => row(`w${i}`, "PRESENCIAL", 10, i + 1))
  let streak = 0
  const sequence = []
  while (previous.length || walkin.length) {
    const next = chooseNext(previous[0] ?? null, walkin[0] ?? null, streak, now)!
    sequence.push(next.entrada.origen); streak = next.siguientesPrevios
    if (next.entrada.origen === "PREVIA") previous.shift(); else walkin.shift()
  }
  assert.deepEqual(sequence, Array(3).fill(["PREVIA", "PREVIA", "PREVIA", "PRESENCIAL"]).flat())
})
test("fila: prioridad desde exactamente treinta minutos y al mayor tiempo de ambos grupos", () => {
  const previous = row("previa", "PREVIA", 5)
  assert.equal(chooseNext(previous, row("día", "PRESENCIAL", 29.999), 0, now)!.entrada.id, "previa")
  const overdue = chooseNext(previous, row("día", "PRESENCIAL", 30), 0, now)!
  assert.equal(overdue.entrada.id, "día"); assert.equal(overdue.motivo, "ESPERA_MAXIMA")
  assert.equal(chooseNext(row("previa", "PREVIA", 45), row("día", "PRESENCIAL", 35), 3, now)!.entrada.id, "previa")
  assert.equal(chooseNext(row("previa", "PREVIA", 35, 2), row("día", "PRESENCIAL", 35, 1), 0, now)!.entrada.id, "día")
})
test("fila: ningún grupo disponible deja ociosa la fila y el contador no supera tres", () => {
  assert.equal(chooseNext(null, null, 3, now), null)
  assert.equal(chooseNext(row("p", "PREVIA", 1), null, 3, now)!.siguientesPrevios, 3)
  const single = chooseNext(null, row("w", "PRESENCIAL", 1), 0, now)!
  assert.equal(single.entrada.id, "w"); assert.equal(single.siguientesPrevios, 0)
})
test("presencial: permite bebé sin RUT ni correo y no acepta seleccionar dueño desde el navegador", () => {
  const raw = { id: "047c4f7f-a32f-4f4a-96c3-39da98abb14f", eventoId: "047c4f7f-a32f-4f4a-96c3-39da98abb140", nombreBebe: " Bebé ficticio ", fechaNacimiento: "2026-01-01", nombreApoderado: " Familia ficticia ", origen: "PREVIA", apoderadoId: "intruso" }
  const parsed = parseOnsiteInput(raw)
  assert.equal(parsed.correo, null); assert.equal(parsed.bebe.rut, null)
  assert(!Object.hasOwn(parsed, "apoderadoId")); assert(!Object.hasOwn(parsed, "origen"))
  assert.equal(parseOnsiteInput({ ...raw, correo: " FAMILIA@example.com " }).correo, "familia@example.com")
  assert.throws(() => parseOnsiteInput({ ...raw, bebeId: "otro-bebe" }), FamilyInputError)
  assert.throws(() => parseOnsiteInput({ ...raw, correo: "incorrecto" }), FamilyInputError)
})
