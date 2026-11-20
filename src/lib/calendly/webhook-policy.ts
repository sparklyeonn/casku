import { createHash, createHmac, timingSafeEqual } from "node:crypto"
export const WEBHOOK_MAX_BYTES = 131072
export const WEBHOOK_HEALTH_MS = 26 * 3600000
export class CalendlyWebhookInput extends Error {}
export function hookConfig(env: Record<string, string | undefined> = process.env) {
 const key = env.CALENDLY_WEBHOOK_SIGNING_KEY || "", subscription = env.CALENDLY_WEBHOOK_SUBSCRIPTION_ID || ""
 if (env.CALENDLY_ENABLED !== "1" || !env.CALENDLY_API_TOKEN?.trim() || env.CALENDLY_WEBHOOK_ENABLED !== "1" || !/^[A-Za-z0-9_-]{32,256}$/.test(key) || !/^[A-Za-z0-9_-]{1,128}$/.test(subscription)) return null
 let target: URL
 try { target = new URL("/api/calendly/webhook", env.AUTH_URL) } catch { return null }
 const test = env.CASKU_PRODUCTION_TEST === "1" || env.CASKU_TEST_MODE === "1"
 if (target.protocol !== "https:" && !(test && target.protocol === "http:" && ["localhost","127.0.0.1"].includes(target.hostname))) return null
 if (target.username || target.password) return null
 const huella = createHash("sha256").update(JSON.stringify([key, subscription, target.href])).digest("hex")
 return { key, subscription, callback: target.href, huella }
}
export function validCalendlySignature(raw: Uint8Array, header: string | null, key: string, now = Date.now()) {
 if (!header || header.length > 1024 || raw.byteLength > WEBHOOK_MAX_BYTES || key.length < 32) return false
 const fields = header.split(",").map(value => value.trim()), timestamps = fields.filter(value => value.startsWith("t="))
 if (timestamps.length !== 1 || !/^t=\d{10}$/.test(timestamps[0])) return false
 const timestamp = timestamps[0].slice(2)
 if (Math.abs(now - Number(timestamp) * 1000) > 180000) return false
 const expected = createHmac("sha256", key).update(timestamp + ".").update(raw).digest()
 return fields.filter(value => /^v1=[a-fA-F0-9]{64}$/.test(value)).some(value => timingSafeEqual(expected, Buffer.from(value.slice(3), "hex")))
}
export function inviteeReference(value: unknown) {
 if (typeof value !== "string" || !/^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9_-]{1,128}\/invitees\/[A-Za-z0-9_-]{1,128}$/.test(value)) throw new CalendlyWebhookInput("Referencia de Calendly inválida.")
 const parts = value.split("/")
 return { uri: value, reservaId: parts[4], invitadoId: parts[6] }
}
export function parseCalendlyNotice(raw: Uint8Array) {
 let data: Record<string, unknown>
 try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) } catch { throw new CalendlyWebhookInput("Aviso inválido.") }
 if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.event !== "string") throw new CalendlyWebhookInput("Aviso inválido.")
 if (!["invitee.created","invitee.canceled"].includes(data.event)) return null
 const payload = data.payload as Record<string, unknown> | null
 if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new CalendlyWebhookInput("Aviso inválido.")
 const ref = inviteeReference(payload.uri)
 if (payload.event !== `https://api.calendly.com/scheduled_events/${ref.reservaId}`) throw new CalendlyWebhookInput("Aviso inválido.")
 if (typeof data.created_at !== "string" || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(data.created_at) || !Number.isFinite(Date.parse(data.created_at))) throw new CalendlyWebhookInput("Fecha del aviso inválida.")
 const creadoAt = new Date(data.created_at)
 const id = createHash("sha256").update(JSON.stringify([data.event, ref.uri, creadoAt.toISOString()])).digest("hex")
 return { id, tipo: data.event, invitadoUri: ref.uri, creadoAt }
}
export function webhookHealth(value: { huella: string | null; conectadaAt: Date | null; verificadaAt: Date | null; fallo: boolean } | null, huella: string, now: Date) {
 return !!value && value.huella === huella && !value.fallo && !!value.conectadaAt && !!value.verificadaAt && value.verificadaAt <= now && now.getTime() - value.verificadaAt.getTime() < WEBHOOK_HEALTH_MS
}
