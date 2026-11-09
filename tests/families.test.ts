import test from "node:test"
import assert from "node:assert/strict"
import { normalizeEmail, normalizeRut, parseRegistration, chileToday } from "../src/lib/families/input.ts"
import { privateHash, hashMatches } from "../src/lib/families/security.ts"
import { escapeHtml, mailConfig, MailUnavailable } from "../src/lib/families/mail.ts"
const valid = { id: "1d6bb472-58d0-4dab-8e0d-bc0e65197d33", eventoId: "2d6bb472-58d0-4dab-8e0d-bc0e65197d33", nombreApoderado: " Apoderado de prueba ", nombreBebe: " Bebé   de prueba ", fechaNacimiento: "2026-01-01" }
test("familias: separa identidad, normaliza correo y admite bebé sin RUT", () => {
  assert.equal(normalizeEmail("  FAMILIA@EXAMPLE.COM "), "familia@example.com")
  assert.throws(() => normalizeEmail("invalido"))
  const result = parseRegistration(valid)
  assert.equal(result.nombreApoderado, "Apoderado de prueba")
  assert.equal(result.nuevoBebe?.nombre, "Bebé de prueba"); assert.equal(result.nuevoBebe?.rut, null)
  assert.equal(result.nuevoBebe?.fechaNacimiento.toISOString(), "2026-01-01T00:00:00.000Z")
  assert.equal(normalizeRut("12.345.678-5"), "12345678-5"); assert.equal(normalizeRut(""), null)
  assert.throws(() => normalizeRut("12345678-9"))
})
test("familias: rechaza fechas imposibles, futuras y nombres vacíos", () => {
  for (const values of [{ fechaNacimiento: "2099-01-01" }, { fechaNacimiento: "2026-02-30" }, { fechaNacimiento: "2026-02-29" }, { nombreBebe: " " }, { nombreApoderado: " " }]) assert.throws(() => parseRegistration({ ...valid, ...values }))
  assert.equal(parseRegistration({ ...valid, bebeId: "bebe-existente" }).nuevoBebe, null)
  assert.equal(chileToday(new Date("2026-01-01T01:00:00Z")), "2025-12-31")
})
test("familias: los códigos se comparan con HMAC y secreto, sin almacenar el código", () => {
  const previous = process.env.AUTH_SECRET
  process.env.AUTH_SECRET = "secreto-exclusivo-de-prueba"
  try {
    const digest = privateHash("otp:desafio:correo:123456")
    assert.equal(digest.length, 64); assert(!digest.includes("123456"))
    assert(hashMatches("otp:desafio:correo:123456", digest)); assert(!hashMatches("otro-codigo", digest))
    assert(!hashMatches("codigo", "valor-invalido"))
  } finally { if (previous === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previous }
})
test("familias: escapa HTML y no simula correo enviado cuando falta remitente", () => {
  assert.equal(escapeHtml('<b>"hola" & adiós</b>'), "&lt;b&gt;&quot;hola&quot; &amp; adiós&lt;/b&gt;")
  const previous = process.env.RESEND_FROM; delete process.env.RESEND_FROM
  try { assert.throws(mailConfig, MailUnavailable) } finally { if (previous !== undefined) process.env.RESEND_FROM = previous }
})
