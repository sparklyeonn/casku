import { CalendlyUnavailable, calendlyRead as read, calendlyObject as object, calendlyText as text, calendlyResource as resource, parseCalendlyCursor } from "./client.ts"

export const CALENDLY_TIME_ZONE = "America/Santiago"
const dateFormat = new Intl.DateTimeFormat("en", { timeZone: CALENDLY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
export function calendlyLocalDate(value: Date) {
  const parts = dateFormat.formatToParts(value)
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)!.value).join("-")
}
export class AgendaInputError extends Error {}
export function parseAgendaDate(value: unknown) {
  if (typeof value !== "string" || !/^(20\d{2})-\d{2}-\d{2}$/.test(value)) throw new AgendaInputError("Elige una fecha válida.")
  const parsed = new Date(value + "T12:00:00Z")
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AgendaInputError("Elige una fecha válida.")
  return value
}
// Busca el primer instante de la fecha local. También cubre el salto de medianoche del horario de verano.
export function agendaDayRange(value: string) {
  const date = parseAgendaDate(value)
  function boundary(day: string) {
    const nominal = Date.parse(day + "T00:00:00Z")
    let low = nominal - 86400000, high = nominal + 2 * 86400000
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (calendlyLocalDate(new Date(middle)) < day) low = middle + 1
      else high = middle
    }
    return new Date(low).toISOString()
  }
  const next = new Date(Date.parse(date + "T00:00:00Z") + 86400000).toISOString().slice(0, 10)
  return { inicio: boundary(date), fin: boundary(next) }
}
export function parseAgendaStatus(value: string | null) {
  if (value === null || value === "active") return "active" as const
  if (value === "canceled" || value === "all") return value
  throw new AgendaInputError("El estado de la reserva no es válido.")
}
function nextPage(value: unknown) {
  const page = object(value)
  return page.next_page_token === undefined || page.next_page_token === null ? null : parseCalendlyCursor(text(page.next_page_token, 4096))
}
function collection(value: unknown, max: number) {
  if (!Array.isArray(value) || value.length > max) throw new CalendlyUnavailable("RESPUESTA")
  return value.map(object)
}
function iso(value: unknown) {
  const raw = text(value, 60)
  if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(raw) || !Number.isFinite(Date.parse(raw))) throw new CalendlyUnavailable("RESPUESTA")
  return new Date(raw).toISOString()
}
function status(value: unknown) {
  if (value !== "active" && value !== "canceled") throw new CalendlyUnavailable("RESPUESTA")
  return value
}
async function expo(signal: AbortSignal) {
  const me = object((await read("/users/me", signal)).resource), user = resource(me.uri, "users")
  const matches = new Map<string, { uri: string; nombre: string }>()
  const seen = new Set<string>()
  let cursor: string | null = null
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ user, count: "100" })
    if (cursor) params.set("page_token", cursor)
    const listing = await read("/event_types?" + params, signal)
    for (const row of collection(listing.collection, 100)) {
      // Enlace confirmado por Casku. No se selecciona un tipo por coincidencia de nombre.
      if (typeof row.scheduling_url !== "string") continue
      let link: URL
      try { link = new URL(row.scheduling_url) } catch { continue }
      if (link.protocol !== "https:" || !["calendly.com", "www.calendly.com"].includes(link.hostname) || link.username || link.password || link.port || link.pathname.replace(/\/$/, "") !== "/contacto-casku/new-meeting") continue
      const uri = resource(row.uri, "event_types")
      matches.set(uri, { uri, nombre: text(row.name, 500) })
    }
    const next = nextPage(listing.pagination)
    if (!next) {
      if (matches.size !== 1) throw new CalendlyUnavailable("CONFIGURACION")
      return { user, type: [...matches.values()][0] }
    }
    if (seen.has(next)) throw new CalendlyUnavailable("RESPUESTA")
    seen.add(next); cursor = next
  }
  throw new CalendlyUnavailable("RESPUESTA")
}

export async function listCalendlyAgenda(options: { fecha: string; estado: ReturnType<typeof parseAgendaStatus>; cursor?: string | null; signal?: AbortSignal }) {
  const fecha = parseAgendaDate(options.fecha), range = agendaDayRange(fecha)
  const estado = parseAgendaStatus(options.estado), cursor = parseCalendlyCursor(options.cursor ?? null)
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000)
  const { user, type } = await expo(signal)
  const params = new URLSearchParams({ user, count: "10", sort: "start_time:asc", min_start_time: range.inicio, max_start_time: range.fin })
  if (estado === "active") params.set("status", "active")
  if (cursor) params.set("page_token", cursor)
  const listing = await read("/scheduled_events?" + params, signal)
  const events = collection(listing.collection, 10)
  const citas: Array<{ id: string; reservaId: string; nombreReserva: string; correo: string; inicio: string; fin: string; estado: "ACTIVA" | "CANCELADA" | "REPROGRAMADA" }> = []
  let participantesPendientes = false, turnosSinParticipantes = 0
  // Concurrencia acotada, sin descargar todas las reservas de la cuenta en una sola función.
  for (let offset = 0; offset < events.length; offset += 3) {
    await Promise.all(events.slice(offset, offset + 3).map(async event => {
      if (event.event_type !== type.uri) return
      const uri = resource(event.uri, "scheduled_events"), inicio = iso(event.start_time), fin = iso(event.end_time), eventStatus = status(event.status)
      if (Date.parse(fin) <= Date.parse(inicio)) throw new CalendlyUnavailable("RESPUESTA")
      if (calendlyLocalDate(new Date(inicio)) !== fecha) return
      const result = await read(new URL(uri).pathname + "/invitees?count=100", signal)
      const guests = collection(result.collection, 100)
      if (nextPage(result.pagination)) participantesPendientes = true
      if (!guests.length) turnosSinParticipantes++
      for (const guest of guests) {
        if (guest.event !== uri) throw new CalendlyUnavailable("RESPUESTA")
        const guestUri = text(guest.uri, 500)
        if (!guestUri.startsWith(uri + "/invitees/") || !/^[A-Za-z0-9_-]{1,128}$/.test(guestUri.slice((uri + "/invitees/").length))) throw new CalendlyUnavailable("RESPUESTA")
        const guestStatus = status(guest.status), active = eventStatus === "active" && guestStatus === "active"
        if ((estado === "active" && !active) || (estado === "canceled" && active)) continue
        const correo = text(guest.email, 254)
        if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(correo)) throw new CalendlyUnavailable("RESPUESTA")
        citas.push({ id: guestUri.split("/").at(-1)!, reservaId: uri.split("/").at(-1)!, nombreReserva: text(typeof guest.name === "string" ? guest.name.replace(/\s+/g, " ") : guest.name, 500), correo, inicio, fin, estado: active ? "ACTIVA" : guest.rescheduled === true ? "REPROGRAMADA" : "CANCELADA" })
      }
    }))
  }
  const unique = [...new Map(citas.map(row => [row.reservaId + ":" + row.id, row])).values()]
  unique.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.nombreReserva.localeCompare(b.nombreReserva) || a.id.localeCompare(b.id))
  return { estado: "CONECTADO" as const, fecha, zonaHoraria: CALENDLY_TIME_ZONE, tipoCita: type.nombre, citas: unique, siguiente: nextPage(listing.pagination), participantesPendientes, turnosSinParticipantes, consultadoAt: new Date().toISOString() }
}
export type CalendlyAgendaListing = Awaited<ReturnType<typeof listCalendlyAgenda>>

export function agendaForRole(result: CalendlyAgendaListing, role: "ADMIN" | "RECEPCION" | "KINESIOLOGO") {
  return { ...result, citas: result.citas.map(({ correo, ...row }) => role === "KINESIOLOGO" ? { ...row, correo: undefined } : { ...row, correo }) }
}
