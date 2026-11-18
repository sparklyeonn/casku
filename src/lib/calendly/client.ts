export class CalendlyUnavailable extends Error {
  kind: "CONFIGURACION" | "CREDENCIALES" | "LIMITE" | "PROVEEDOR" | "RESPUESTA"
  constructor(kind: CalendlyUnavailable["kind"] = "PROVEEDOR") {
    super("No pudimos consultar Calendly."); this.name = "CalendlyUnavailable"; this.kind = kind
  }
}
const origin = "https://api.calendly.com"
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CalendlyUnavailable("RESPUESTA")
  return value as Record<string, unknown>
}
const text = (value: unknown, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\r\n\0]/.test(value)) throw new CalendlyUnavailable("RESPUESTA")
  return value.trim()
}
function resource(value: unknown, collection: "users" | "event_types") {
  const uri = text(value, 300)
  if (!new RegExp(`^https://api\\.calendly\\.com/${collection}/[A-Za-z0-9_-]{1,128}$`).test(uri)) throw new CalendlyUnavailable("RESPUESTA")
  return uri
}
export function calendlyStatus() {
  const token = process.env.CALENDLY_API_TOKEN?.trim()
  if (!token) return "PENDIENTE_CONFIGURACION" as const
  if (process.env.CALENDLY_ENABLED !== "1") return "DESACTIVADO" as const
  if (token.length > 8192 || /\s|\0/.test(token)) return "PENDIENTE_CONFIGURACION" as const
  return "LISTO_PARA_CONSULTAR" as const
}
export function parseCalendlyCursor(value: string | null) {
  if (value === null) return null
  if (!value || value.length > 4096 || /[\r\n\0]/.test(value)) throw new CalendlyUnavailable("RESPUESTA")
  return value
}
async function read(path: string, signal?: AbortSignal) {
  if (calendlyStatus() !== "LISTO_PARA_CONSULTAR") throw new CalendlyUnavailable("CONFIGURACION")
  const deadline = AbortSignal.timeout(12000)
  let response: Response
  try {
    response = await fetch(origin + path, { method: "GET", headers: { Authorization: `Bearer ${process.env.CALENDLY_API_TOKEN!.trim()}`, Accept: "application/json" }, redirect: "error", cache: "no-store", signal: signal ? AbortSignal.any([signal, deadline]) : deadline })
  } catch { throw new CalendlyUnavailable() }
  if (response.status === 401 || response.status === 403) throw new CalendlyUnavailable("CREDENCIALES")
  if (response.status === 429) throw new CalendlyUnavailable("LIMITE")
  if (!response.ok) throw new CalendlyUnavailable()
  try { return object(await response.json()) } catch { throw new CalendlyUnavailable("RESPUESTA") }
}
function bookingLink(value: unknown) {
  try {
    const url = new URL(text(value, 1000))
    if (url.protocol !== "https:" || !["calendly.com", "www.calendly.com"].includes(url.hostname) || url.username || url.password || url.port) throw new Error()
    return url.href
  } catch { throw new CalendlyUnavailable("RESPUESTA") }
}
function eventType(value: unknown) {
  const row = object(value), uri = resource(row.uri, "event_types")
  if (typeof row.active !== "boolean" || !Number.isInteger(row.duration) || Number(row.duration) < 1 || Number(row.duration) > 1440) throw new CalendlyUnavailable("RESPUESTA")
  const rawQuestions = row.custom_questions ?? []
  if (!Array.isArray(rawQuestions) || rawQuestions.length > 100) throw new CalendlyUnavailable("RESPUESTA")
  const preguntas = rawQuestions.map(object).filter(question => question.enabled === true).map(question => {
    if (typeof question.required !== "boolean" || !Number.isSafeInteger(question.position) || Number(question.position) < 0) throw new CalendlyUnavailable("RESPUESTA")
    return { nombre: text(typeof question.name === "string" ? question.name.replace(/\s+/g, " ") : question.name, 2000), tipo: text(question.type, 100), requerida: question.required, posicion: Number(question.position) }
  })
  return { id: uri.split("/").at(-1)!, nombre: text(row.name, 500), duracion: Number(row.duration), activo: row.active, enlace: bookingLink(row.scheduling_url), preguntas }
}
export async function listCalendlyEventTypes(cursor: string | null = null, signal?: AbortSignal) {
  cursor = parseCalendlyCursor(cursor)
  const me = object((await read("/users/me", signal)).resource)
  const uri = resource(me.uri, "users")
  const params = new URLSearchParams({ user: uri, count: "100", sort: "name:asc" })
  if (cursor) params.set("page_token", cursor)
  const listing = await read(`/event_types?${params}`, signal)
  if (!Array.isArray(listing.collection) || listing.collection.length > 100) throw new CalendlyUnavailable("RESPUESTA")
  const pagination = object(listing.pagination)
  const next = pagination.next_page_token === undefined || pagination.next_page_token === null ? null : parseCalendlyCursor(text(pagination.next_page_token, 4096))
  return { estado: "CONECTADO" as const, cuenta: { nombre: text(me.name, 200), zonaHoraria: text(me.timezone, 100) }, tipos: listing.collection.map(eventType), siguiente: next }
}
export type CalendlyListing = Awaited<ReturnType<typeof listCalendlyEventTypes>>
