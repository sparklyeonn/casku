import test from "node:test"
import assert from "node:assert/strict"
import { correctionInput, rutVariants } from "../src/lib/data-corrections/input.ts"
import { mailFamily, readMailFamily } from "../src/lib/families/identity-snapshot.ts"
const base = { revision: 1, motivo: "Confirmación de identidad con la familia" }
test("correcciones: valida identidad y motivo, sin aceptar propietarios ni campos clínicos", () => {
  const parsed = correctionInput({ ...base, seccion: "BEBE", datos: { nombre: " Bebé   corregido ", fechaNacimiento: "2026-01-01", rut: "12.345.678-5", apoderadoId: "otro", diagnostico: "falso" } })
  assert.equal(parsed.datos.nombre, "Bebé corregido"); assert.equal(parsed.datos.rut, "12345678-5")
  assert(!Object.hasOwn(parsed.datos, "apoderadoId")); assert(!Object.hasOwn(parsed.datos, "diagnostico"))
  for (const change of [{ revision: 0 }, { motivo: "corto" }, { datos: { nombre: "Bebé", fechaNacimiento: "2026-02-30" } }, { datos: { nombre: "Bebé", fechaNacimiento: "2099-01-01" } }]) assert.throws(() => correctionInput({ ...base, seccion: "BEBE", datos: { nombre: "Bebé", fechaNacimiento: "2026-01-01" }, ...change }))
})
test("correcciones: distingue contacto presencial de correo verificado", () => {
  assert.throws(() => correctionInput({ ...base, seccion: "APODERADO", datos: { nombre: "Apoderado", correo: "nuevo@example.com" } }))
  const contact = correctionInput({ ...base, seccion: "CONTACTO", datos: { nombre: "Apoderado", correo: " CONTACTO@example.com ", telefono: " +56  9 1234 " } })
  assert.equal(contact.seccion, "CONTACTO"); if (contact.seccion !== "CONTACTO") throw new Error("Tipo inesperado")
  assert.equal(contact.datos.correo, "contacto@example.com"); assert.equal(contact.datos.telefono, "+56 9 1234")
  assert.deepEqual(rutVariants("12345678-5"), ["12345678-5", "12.345.678-5"])
})
test("confirmaciones: la identidad preparada se conserva separada de la ficha viva", () => {
  const identity = mailFamily("Nombre original", "destino@example.com", true)
  assert.deepEqual(readMailFamily(identity), identity)
  assert.throws(() => readMailFamily(null)); assert.throws(() => readMailFamily({ ...identity, conCuenta: "true" }))
})
