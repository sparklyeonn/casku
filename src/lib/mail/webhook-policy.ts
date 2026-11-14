import { createHash, createHmac, timingSafeEqual } from "node:crypto"
export const recipientKey = (email: string, secret: string) => createHmac("sha256", secret).update(`mail:${email.trim().toLowerCase()}`).digest("hex")
export const deliveryRanks: Record<string, number> = { SIN_CONFIRMAR: 0, REBOTE_TEMPORAL: 1, ENTREGADO: 2, REBOTE: 3, QUEJA: 4 }
export class WebhookInputError extends Error {}
export function canonicalMessageId(value: unknown) {
  if (typeof value !== "string" || !value || value.length > 254 || /[\s\0]/.test(value)) throw new WebhookInputError()
  const id = value.startsWith("<") && value.endsWith(">") ? value.slice(1,-1) : value
  if (!id || /[<>]/.test(id)) throw new WebhookInputError()
  return id
}
export function webhookAuthorized(header: string | null, secret: string) {
  if (secret.length < 32 || secret.length > 256 || /[^a-zA-Z0-9_-]/.test(secret)) return false
  const actual = Buffer.from(header ?? ""), expected = Buffer.from(`Bearer ${secret}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export type BrevoEvent = { id: string; messageId: string; type: "ENTREGADO" | "REBOTE_TEMPORAL" | "REBOTE" | "QUEJA"; occurredAt: Date; recipient: string }
const types: Record<string, BrevoEvent["type"]> = { delivered: "ENTREGADO", soft_bounce: "REBOTE_TEMPORAL", hard_bounce: "REBOTE", spam: "QUEJA" }
export function parseBrevoEvents(payload: unknown, secret: string, now = Date.now()): BrevoEvent[] {
  if (secret.length < 32) throw new WebhookInputError()
  const rows = Array.isArray(payload) ? payload : [payload]
  if (!rows.length || rows.length > 50) throw new WebhookInputError()
  return rows.flatMap(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new WebhookInputError()
    const row = value as Record<string, unknown>
    if (typeof row.event !== "string" || !row.event || row.event.length > 70) throw new WebhookInputError()
    if (!Object.hasOwn(types, row.event)) return []
    const messageId = canonicalMessageId(row["message-id"])
    if (typeof row.email !== "string" || row.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(row.email) || /[\r\n\0]/.test(row.email)) throw new WebhookInputError()
    // ts_epoch puede referirse al envío: no usarlo como fecha del evento.
    const seconds = row.ts_event ?? row.ts
    if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || seconds < 946684800 || seconds * 1000 > now + 300_000) throw new WebhookInputError()
    const type = types[row.event], occurredAt = new Date(seconds * 1000), recipient = recipientKey(row.email, secret)
    // id es el identificador del webhook, no una clave única fiable por evento.
    const id = createHash("sha256").update(JSON.stringify([messageId,type,seconds,recipient])).digest("hex")
    return [{id,messageId,type,occurredAt,recipient}]
  })
}
