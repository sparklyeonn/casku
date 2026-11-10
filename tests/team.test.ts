import test from "node:test"
import assert from "node:assert/strict"
import { accountInput, accountId } from "../src/lib/team/input.ts"
const input = { id: "047c4f7f-a32f-4f4a-96c3-39da98abb14f", name: " Equipo   Casku ", email: " EQUIPO@example.com ", role: "ADMIN", active: true, password: "Una-contraseña-local-123" }
test("cuentas: normaliza identidad e ignora campos de privilegios y hashes", () => {
  const parsed = accountInput({ ...input, passwordHash: "falso", creadoPorId: "otro" }, true)
  assert.equal(parsed.email, "equipo@example.com"); assert.equal(parsed.name, "Equipo Casku")
  assert(!Object.hasOwn(parsed, "passwordHash")); assert(!Object.hasOwn(parsed, "creadoPorId"))
  assert.equal(accountId("cuenta-anterior"), "cuenta-anterior")
  assert.throws(() => accountId("familia:otra"))
})
test("cuentas: contraseñas, roles, estados y versiones se validan en servidor", () => {
  for (const changes of [{ password: "corta" }, { role: "APODERADO" }, { active: "true" }, { name: " " }]) assert.throws(() => accountInput({ ...input, ...changes }, true))
  assert.throws(() => accountInput({ ...input, password: "" }, true))
  assert.equal(accountInput({ ...input, password: "", version: 1 }, false).password, "")
  assert.throws(() => accountInput({ ...input, version: 0 }, false))
  assert.throws(() => accountInput([], false))
})
