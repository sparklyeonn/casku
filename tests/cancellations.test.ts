import test from "node:test"
import assert from "node:assert/strict"
import { cancellationReason } from "../src/lib/cancellations/input.ts"
test("cancelación: exige motivo administrativo y normaliza espacios", () => {
  assert.equal(cancellationReason(" La familia   solicitó cancelar "), "La familia solicitó cancelar")
  for (const invalid of [undefined, null, 1, "", "corto", "a".repeat(301)]) assert.throws(() => cancellationReason(invalid))
})
