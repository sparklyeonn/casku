import test from "node:test"
import assert from "node:assert/strict"
import { confirmedBooking, bookingId } from "../src/lib/calendly/booking.ts"
import { parseCalendlyArrival } from "../src/lib/reception/calendly-input.ts"
import { emptyPrivacy } from "../src/lib/privacy/policy.ts"
import { chooseWithAppointment, type QueueCandidate } from "../src/lib/queue/policy.ts"
const user = "https://api.calendly.com/users/qa", type = "https://api.calendly.com/event_types/expo", uri = "https://api.calendly.com/scheduled_events/event"
const event = { uri, event_type: type, status: "active", start_time: "2026-11-20T13:00:00Z", end_time: "2026-11-20T13:10:00Z", event_memberships: [{ user }] }
const guest = { uri: uri + "/invitees/guest", event: uri, status: "active", name: "NO_USAR_COMO_BEBE", email: "NO_VERIFICAR@example.test" }
async function mocked(run: () => Promise<void>, changes: Record<string, unknown> = {}, guestChanges: Record<string, unknown> = {}) {
  const original = globalThis.fetch, token = process.env.CALENDLY_API_TOKEN, enabled = process.env.CALENDLY_ENABLED
  process.env.CALENDLY_API_TOKEN = "qa-token"; process.env.CALENDLY_ENABLED = "1"
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input)); assert.equal(url.origin, "https://api.calendly.com"); assert.equal(options?.method, "GET")
    if (url.pathname === "/users/me") return Response.json({ resource: { uri: user } })
    if (url.pathname === "/event_types") return Response.json({ collection: [{ uri: type, name: "Expo QA", scheduling_url: "https://calendly.com/contacto-casku/new-meeting" }], pagination: {} })
    if (url.pathname === "/scheduled_events/event") return Response.json({ resource: { ...event, ...changes } })
    assert.equal(url.pathname, "/scheduled_events/event/invitees/guest")
    return Response.json({ resource: { ...guest, ...guestChanges } })
  }
  try { await run() } finally { globalThis.fetch = original; if (token === undefined) delete process.env.CALENDLY_API_TOKEN; else process.env.CALENDLY_API_TOKEN = token; if (enabled === undefined) delete process.env.CALENDLY_ENABLED; else process.env.CALENDLY_ENABLED = enabled }
}
test("cita: comprueba tipo, cuenta, invitado activo y horario en origen sin adoptar identidad ni correo", async () => mocked(async () => {
  const result = await confirmedBooking("event", "guest")
  assert.equal(result.fecha, "2026-11-20"); assert.equal(result.inicio.toISOString(), "2026-11-20T13:00:00.000Z")
  assert.deepEqual(Object.keys(result).sort(), ["fecha", "fin", "inicio", "invitadoId", "reservaId"])
}))
test("cita: rechaza cancelaciones, reprogramaciones, cuenta o tipo ajenos e invitados cruzados", async () => {
  for (const change of [{ status: "canceled" }, { event_type: "otro" }, { event_memberships: [{ user: "ajeno" }] }, { end_time: event.start_time }]) await mocked(async () => { await assert.rejects(confirmedBooking("event", "guest")) }, change)
  for (const change of [{ status: "canceled" }, { rescheduled: true }, { event: "ajeno" }, { uri: "https://ajeno.test" }]) await mocked(async () => { await assert.rejects(confirmedBooking("event", "guest")) }, {}, change)
  for (const value of ["../guest", "guest?a=b", "https://otro.test", "", null]) assert.throws(() => bookingId(value))
})
test("llegada Calendly: exige confirmación y autorización; ignora identidad de cuenta y horario enviados", () => {
  const raw = { id: "047c4f7f-a32f-4f4a-96c3-39da98abb14f", eventoId: "047c4f7f-a32f-4f4a-96c3-39da98abb140", nombreBebe: "Bebé QA", fechaNacimiento: "2026-01-01", nombreApoderado: "Apoderado QA", reservaId: "event", invitadoId: "guest", confirmado: true, autorizado: true, privacidad: { ...emptyPrivacy, datos: true }, origen: "PRESENCIAL", apoderadoId: "intruso", citaInicio: "2000-01-01" }
  const value = parseCalendlyArrival(raw)
  for (const key of ["origen", "apoderadoId", "citaInicio"]) assert(!Object.hasOwn(value, key))
  for (const change of [{ confirmado: false }, { autorizado: false }, { numero: "1" }, { numero: 0 }, { privacidad: { ...raw.privacidad, correoResultados: true } }, { fechaNacimiento: "2026-02-30" }]) assert.throws(() => parseCalendlyArrival({ ...raw, ...change }))
})
test("citas en fila: nunca llama antes de la hora, prioriza cita vencida y conserva protección de 30 minutos", () => {
  const now = new Date("2026-11-20T13:00:00Z")
  const regular: QueueCandidate = { id: "walkin", orden: 1, origen: "PRESENCIAL", esperaDesde: new Date(now.getTime() - 5 * 60000) }
  const appointment = { ...regular, origen: "PREVIA" as const, id: "scheduled", orden: 2, citaInicio: now }
  assert.equal(chooseWithAppointment(null, regular, { ...appointment, citaInicio: new Date(now.getTime() + 1) }, 0, now)?.entrada.id, "walkin")
  assert.equal(chooseWithAppointment(null, null, { ...appointment, citaInicio: new Date(now.getTime() + 1) }, 0, now), null)
  assert.equal(chooseWithAppointment(null, regular, appointment, 3, now)?.motivo, "CITA_PROGRAMADA")
  assert.equal(chooseWithAppointment(null, { ...regular, esperaDesde: new Date(now.getTime() - 30 * 60000) }, appointment, 0, now)?.motivo, "ESPERA_MAXIMA")
})
