import { createHash } from "node:crypto"

export type MailPurpose = "ACCESO" | "CONFIRMACION" | "RECUPERACION" | "RESULTADO"
export type MailMessage = { to: string; subject: string; text: string; html: string; attachments?: { filename: string; content: string }[] }
export class MailUnavailable extends Error {
  kind: "TRANSITORIO" | "PERMANENTE" | "INCIERTO"
  retryAfterMs: number
  constructor(kind: MailUnavailable["kind"] = "PERMANENTE", retryAfterMs = 60_000) { super("Correo no disponible"); this.name = "MailUnavailable"; this.kind = kind; this.retryAfterMs = retryAfterMs }
}
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const validEmail = (value: string) => value.length <= 254 && emailPattern.test(value) && !/[\r\n\0]/.test(value)
export function mailConfig(purpose: MailPurpose = "ACCESO") {
  const key = process.env.BREVO_API_KEY?.trim(), email = process.env.BREVO_SENDER_EMAIL?.trim().toLowerCase(), name = process.env.BREVO_SENDER_NAME?.trim() || "Casku", secret = process.env.CASKU_MAIL_DELIVERY_SECRET, suppressionSecret = process.env.CASKU_MAIL_SUPPRESSION_SECRET
  if (process.env.CASKU_MAIL_ENABLED !== "1" || process.env.BREVO_SENDER_VERIFIED !== "1" || !key || /[\r\n\0]/.test(key) || !email || !validEmail(email) || name.length > 70 || /[\r\n\0]/.test(name) || !secret || secret.length < 32 || !suppressionSecret || suppressionSecret.length < 32) throw new MailUnavailable()
  let baseUrl = "https://api.brevo.com"
  const simulated = key === "brevo_local_test_only" && email === "test@example.com" && ((process.env.NODE_ENV === "development" && process.env.CASKU_TEST_MODE === "1") || (process.env.NODE_ENV === "production" && process.env.CASKU_PRODUCTION_TEST === "1"))
  if (process.env.NODE_ENV === "development" && process.env.CASKU_TEST_MODE === "1") {
    if (!simulated) throw new MailUnavailable()
    try {
      const url = new URL(process.env.CASKU_TEST_MAIL_URL || "")
      if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new MailUnavailable()
      baseUrl = url.origin
    } catch { throw new MailUnavailable() }
  }
  // La integración clínica real conserva su aprobación y activación pendientes.
  if (purpose === "RESULTADO" && !simulated) throw new MailUnavailable()
  return { key, sender: { email, name }, secret, suppressionSecret, baseUrl }
}
export type BrevoConfig = ReturnType<typeof mailConfig>
export function providerKey(key: string) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(key)) throw new MailUnavailable()
  // UUIDv5 estable por intención; Brevo exige UUID para su idempotencia.
  const namespace = Buffer.from("470b3d8a90af4cacbabe205e555054bd", "hex")
  const bytes = createHash("sha1").update(namespace).update(key).digest().subarray(0,16)
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128
  const hex = bytes.toString("hex")
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
export function brevoPayload(message: MailMessage, config: BrevoConfig, key: string) {
  if (!validEmail(message.to) || !message.subject || message.subject.length > 998 || /[\r\n\0]/.test(message.subject) || !message.html || !message.text) throw new MailUnavailable()
  const attachment = message.attachments?.map(file => {
    if (!/^[\p{L}\p{N}_.-]{1,120}$/u.test(file.filename) || !file.content || file.content.length > 7_000_000) throw new MailUnavailable()
    const data = Buffer.from(file.content,"base64")
    if (!data.length || data.toString("base64") !== file.content) throw new MailUnavailable()
    return { name: file.filename, content: file.content }
  })
  return { sender: config.sender, to: [{ email: message.to, contactPixelTrackingConsent: false }], subject: message.subject, htmlContent: message.html, textContent: message.text, headers: { idempotencyKey: providerKey(key) }, ...(attachment?.length ? { attachment } : {}) }
}
export type BrevoPayload = ReturnType<typeof brevoPayload>
export async function postBrevo(config: BrevoConfig, payload: BrevoPayload) {
  let response: Response
  try {
    response = await fetch(`${config.baseUrl}/v3/smtp/email`, { method: "POST", headers: { "api-key": config.key, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000) })
  } catch { throw new MailUnavailable("INCIERTO") }
  let body: { messageId?: unknown; code?: unknown } = {}
  try { const parsed = await response.json(); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed } catch { /* Una aceptación sin identificador no confirma el envío. */ }
  if (response.ok && typeof body.messageId === "string" && body.messageId.trim() && body.messageId.length <= 1000 && !/[\r\n\0]/.test(body.messageId)) return body.messageId
  if ([401,403,429].includes(response.status)) {
    const value = response.headers.get("retry-after")
    const delay = value === null ? 60_000 : /^\d+$/.test(value) ? Number(value)*1000 : Date.parse(value)-Date.now()
    throw new MailUnavailable("TRANSITORIO", Number.isFinite(delay) ? Math.max(0, Math.min(delay,3_600_000)) : 60_000)
  }
  if (!response.ok && response.status >= 400 && response.status < 500 && ![408,409].includes(response.status) && body.code !== "duplicate_parameter") throw new MailUnavailable("PERMANENTE")
  // Sin respuesta fiable o tras un duplicado no se inventa un messageId.
  throw new MailUnavailable("INCIERTO")
}
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)
