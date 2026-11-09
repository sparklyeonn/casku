import test from "node:test"
import assert from "node:assert/strict"
import { hashPassword, verifyPassword } from "../src/lib/passwords.mjs"
import { canEvaluate, isRole } from "../src/lib/roles.ts"
import { parseEvaluation, parseMeasurements, InvalidEvaluation } from "../src/lib/evaluation-input.ts"
import { parseTeamAccounts, accountRevision } from "../src/lib/team-accounts.ts"
const body = { nombre: "Bebé de prueba", rut: "12.345.678-9", fnac: "2026-01-01", correo: "familia@example.com", ap: 140, bp: 120, di: 135, dd: 138 }

test("solo kinesiología tiene permiso clínico", () => {
  for (const role of [undefined, null, "ADMIN", "RECEPCION", "PADRES", "admin"]) assert.equal(canEvaluate(role), false)
  assert(canEvaluate("KINESIOLOGO")); assert(!isRole("PADRES"))
})
test("scrypt rechaza credenciales incorrectas y usa sales distintas", async () => {
  const password = "Prueba-local-no-real-123!", a = await hashPassword(password), b = await hashPassword(password)
  assert.notEqual(a, b); assert(await verifyPassword(password, a)); assert(!await verifyPassword("incorrecta", a))
  assert(!await verifyPassword(password, "hash inválido")); await assert.rejects(hashPassword("corta"))
})
test("las cuentas se validan y cambiar clave o rol invalida su revisión", async () => {
  const passwordHash = await hashPassword("Otra-clave-de-prueba-123!")
  const input = { id: "prueba", email: "KINE@example.com", name: "Profesional", role: "KINESIOLOGO", active: true, passwordHash }
  const [account] = parseTeamAccounts(JSON.stringify([input])); assert.equal(account.email, "kine@example.com")
  assert.throws(() => parseTeamAccounts(JSON.stringify([input, input])))
  assert.throws(() => parseTeamAccounts(JSON.stringify([{ ...input, role: "SUPERADMIN" }])))
  assert.throws(() => parseTeamAccounts("inválido")); assert.deepEqual(parseTeamAccounts(undefined), [])
  assert.notEqual(accountRevision(account), accountRevision({ ...account, role: "ADMIN" }))
  assert.notEqual(accountRevision(account), accountRevision({ ...account, passwordHash: await hashPassword("Contraseña-nueva-123!") }))
})
test("el servidor recalcula e ignora un diagnóstico o profesional falsificados", () => {
  const data = parseEvaluation({ ...body, indiceCraneal: -1, diagnostico: "falso", recomendacion: "falso", kine: "otra persona" })
  assert.equal(data.indiceCraneal, 120 / 140 * 100); assert.equal(data.indiceAsimetria, 3)
  assert.notEqual(data.diagnostico, "falso"); assert(!Object.hasOwn(data, "kine")); assert.equal(data.rut, "12345678-9")
  assert(data.rutVariants.includes("12.345.678-9"))
})
test("el servidor rechaza mediciones y datos incompletos antes de guardar", () => {
  for (const invalid of [NaN, Infinity, 0, -1, "140", null]) assert.throws(() => parseEvaluation({ ...body, ap: invalid }), InvalidEvaluation)
  for (const invalid of [{ fnac: "2026-02-30" }, { fnac: "2099-01-01" }, { correo: "incorrecto" }, { nombre: " " }, { rut: "" }]) assert.throws(() => parseEvaluation({ ...body, ...invalid }), InvalidEvaluation)
  assert.throws(() => parseEvaluation(null), InvalidEvaluation)
})
test("atención asignada: las mediciones se calculan sin exigir identidad escrita ni RUT", () => {
  const measures = { ap: 140, bp: 120, di: 135, dd: 138 }
  const parsed = parseMeasurements({ ...measures, nombre: "ignorado", correo: "ignorado", diagnostico: "inventado" })
  assert.equal(parsed.indiceCraneal, 120 / 140 * 100)
  assert.equal(parsed.indiceAsimetria, 3)
  assert(!Object.hasOwn(parsed, "correo")); assert(!Object.hasOwn(parsed, "nombre"))
  assert.notEqual(parsed.diagnostico, "inventado")
  for (const ap of [0, -1, NaN, Infinity, "140", null]) assert.throws(() => parseMeasurements({ ...measures, ap }), InvalidEvaluation)
})
