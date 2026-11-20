import { CalendlyUnavailable, calendlyRead as read, calendlyObject as object, calendlyResource as resource } from "./client.ts"
import { expo, calendlyLocalDate, AgendaInputError } from "./agenda.ts"
export function bookingId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new AgendaInputError("La referencia de Calendly no es válida.")
  return value
}
export type ConfirmedBooking = { reservaId: string; invitadoId: string; inicio: Date; fin: Date; fecha: string }
// Only fixed API paths. Never adopt dates, names, ownership or consent supplied by the browser.
export async function confirmedBooking(reserva: unknown, invitado: unknown, requestSignal?: AbortSignal): Promise<ConfirmedBooking> {
  const reservaId = bookingId(reserva), invitadoId = bookingId(invitado)
  const signal = requestSignal ? AbortSignal.any([requestSignal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000)
  const { user, type } = await expo(signal)
  const path = `/scheduled_events/${reservaId}`, uri = `https://api.calendly.com${path}`
  const event = object((await read(path, signal)).resource)
  if (resource(event.uri, "scheduled_events") !== uri || event.event_type !== type.uri || !Array.isArray(event.event_memberships) || !event.event_memberships.some(member => object(member).user === user)) throw new AgendaInputError("La cita no corresponde a la agenda de Expo Bebé de esta cuenta.")
  const guest = object((await read(`${path}/invitees/${invitadoId}`, signal)).resource)
  if (guest.uri !== `${uri}/invitees/${invitadoId}` || guest.event !== uri) throw new CalendlyUnavailable("RESPUESTA")
  if (event.status !== "active" || guest.status !== "active" || guest.rescheduled === true) throw new AgendaInputError("La reserva fue cancelada o reprogramada. Actualiza la agenda y selecciona su cita vigente.")
  const date = (value: unknown) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new CalendlyUnavailable("RESPUESTA")
    return new Date(value)
  }
  const inicio = date(event.start_time), fin = date(event.end_time)
  if (fin <= inicio) throw new CalendlyUnavailable("RESPUESTA")
  return { reservaId, invitadoId, inicio, fin, fecha: calendlyLocalDate(inicio) }
}
