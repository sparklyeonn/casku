import test from "node:test"
import assert from "node:assert/strict"
import { parseLookup, parseCursor, receptionInput, ReceptionInputError } from "../src/lib/reception/input.ts"

test("recepción: distingue el número local al evento del QR opaco", () => {
  assert.deepEqual(parseLookup(" 0010 "), { numero: 10 })
  assert.deepEqual(parseLookup("100000"), { numero: 100000 })
  const token = "a".repeat(30) + "_-"
  assert.deepEqual(parseLookup(`CASKU:INSCRIPCION:${token}`), { qrToken: token })
})
test("recepción: rechaza enlaces, identificadores sueltos y búsquedas ambiguas", () => {
  for (const value of [null, 10, "", "0", "-1", "1.5", "1e2", "100001", "https://example.com", "a".repeat(32), "CASKU:INSCRIPCION:123", "10 OR 1=1"]) assert.throws(() => parseLookup(value), ReceptionInputError)
  assert.throws(() => receptionInput([]), ReceptionInputError)
  assert.equal(parseCursor(null), 0)
  assert.equal(parseCursor("50"), 50)
  assert.equal(parseCursor("100001"), 100001)
  assert.equal(parseCursor("2147483647"), 2147483647)
  for (const value of ["-1", "1.5", "2147483648", ""]) assert.throws(() => parseCursor(value), ReceptionInputError)
})
