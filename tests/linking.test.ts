import test from "node:test"
import assert from "node:assert/strict"
import { invitationInput, linkCode, LINK_HOURS } from "../src/lib/linking/input.ts"
import { FamilyInputError } from "../src/lib/families/input.ts"
const code = "AbCdEfGhIjKlMnOpQrStUw"
test("vinculación: distingue el código de cuenta del QR de inscripción y de enlaces externos", () => {
  assert.equal(code.length, 22)
  assert.equal(linkCode(` ${code} `), code)
  assert.equal(linkCode(`CASKU:VINCULACION:${code}`), code)
  for (const value of [null, 1, "", "001", "https://example.com", `CASKU:INSCRIPCION:${code}`, "a".repeat(100)]) assert.throws(() => linkCode(value), FamilyInputError)
  assert.equal(LINK_HOURS, 24)
})
test("vinculación: normaliza correo y no acepta propiedad elegida por el navegador", () => {
  const id = "047c4f7f-a32f-4f4a-96c3-39da98abb14f"
  const parsed = invitationInput({ id, eventoId: id, inscripcionId: id, correo: " FAMILIA@example.com ", apoderadoId: "otro", pacienteId: "otro", codigo: code })
  assert.equal(parsed.correo, "familia@example.com")
  assert.deepEqual(Object.keys(parsed).sort(), ["correo", "eventoId", "id", "inscripcionId"])
  assert.throws(() => invitationInput({ id, eventoId: id, inscripcionId: id, correo: "incorrecto" }), FamilyInputError)
  assert.throws(() => invitationInput([]), FamilyInputError)
})
