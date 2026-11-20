import { browserCalendlyArrivalChecks } from "./browser-calendly-arrival.mjs"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
const user = "https://api.calendly.com/users/qa", type = "https://api.calendly.com/event_types/expo"
export const bookingFixtures = new Map()
export const calendlyFixtureState = { retryAt: null, callback: "", subscriptionState: "active", delayMs: 0, pausedRequests: 0, fail: false, pageSize: 10, failPage2: false, incomplete: false, omit: new Set() }
export const calendlyFixtureServer = createServer(async (request, response) => {
  assert.equal(request.method, "GET"); assert.equal(request.headers.authorization, "Bearer calendly_fixture_only")
  if (calendlyFixtureState.delayMs) { calendlyFixtureState.pausedRequests++; await new Promise(resolve => setTimeout(resolve, calendlyFixtureState.delayMs)); calendlyFixtureState.pausedRequests-- }
  const url = new URL(request.url, "http://127.0.0.1"), path = url.pathname
  const json = value => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value)) }
  if (calendlyFixtureState.fail) { response.statusCode = 503; return json({ error: "Fallo ficticio" }) }
  if (path === "/users/me") return json({ resource: { uri: user } })
  if (path === "/webhook_subscriptions/fixture-hook") return json({ resource: { uri: "https://api.calendly.com/webhook_subscriptions/fixture-hook", callback_url: calendlyFixtureState.callback, state: calendlyFixtureState.subscriptionState, scope:"user", user, events:["invitee.created","invitee.canceled"], retry_started_at:calendlyFixtureState.retryAt } })
  if (path === "/event_types") return json({ collection: [{ uri: type, name: "Expo QA", scheduling_url: "https://calendly.com/contacto-casku/new-meeting" }], pagination: {} })
  const event = (id, booking) => ({ uri: `https://api.calendly.com/scheduled_events/${id}`, event_type: booking.foreign ? "https://api.calendly.com/event_types/other" : type, event_memberships: [{ user }], status: booking.status ?? "active", start_time: booking.inicio.toISOString(), end_time: booking.fin.toISOString() })
  if (path === "/scheduled_events") {
    if (calendlyFixtureState.failPage2 && url.searchParams.has("page_token")) { response.statusCode = 503; return json({ error: "Página ficticia fallida" }) }
    const rows = [...bookingFixtures.entries()].filter(([id, row]) => !calendlyFixtureState.omit.has(id) && row.inicio >= new Date(url.searchParams.get("min_start_time")) && row.inicio < new Date(url.searchParams.get("max_start_time"))).sort((a, b) => a[1].inicio - b[1].inicio)
    const offset = Number(url.searchParams.get("page_token") || 0), size = calendlyFixtureState.pageSize
    return json({ collection: rows.slice(offset, offset + size).map(([id, row]) => event(id, row)), pagination: { next_page_token: offset + size < rows.length ? String(offset + size) : null } })
  }
  const [, , id, section, guest] = path.split("/"), booking = bookingFixtures.get(id)
  if (!booking) { response.statusCode = 404; return json({ error: "Ficticio" }) }
  const uri = `https://api.calendly.com/scheduled_events/${id}`
  const participant = value => ({ uri: `${uri}/invitees/${value}`, event: uri, status: booking.status ?? "active", rescheduled: booking.rescheduled ?? false, old_invitee: booking.oldUri ?? null, new_invitee: booking.newUri ?? null, name: "Reserva ficticia QA", email: "qa@example.test" })
  if (guest) return json({ resource: participant(guest) })
  if (section === "invitees") return json({ collection: [participant(booking.invitadoId)], pagination: { next_page_token: calendlyFixtureState.incomplete ? "more" : null } })
  return json({ resource: event(id, booking) })
})
const chileDate = date => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(date)
export async function calendlyLinkChecks({ db, client, signIn, password, accounts, admin, post, mails, secondaryBase, base, browsers = true }) {
  const reception = client(), reception2 = client(secondaryBase), kine = client()
  await signIn(reception, "equipo", { email: accounts[0].email, password })
  await signIn(reception2, "equipo", { email: accounts[1].email, password })
  await signIn(kine, "equipo", { email: accounts[2].email, password })
  const now = new Date(), date = chileDate(now), eventId = randomUUID()
  const response = await admin("/api/eventos", post({ id: eventId, nombre: "Expo Calendly QA", fecha: date, lugar: "Recinto ficticio", cupos: 10 }))
  assert.equal(response.status, 201)
  const url = "/api/recepcion/calendly", privacy = { version: "2026-11-11.1", datos: true, correoResultados: false, seguimiento: false }
  function payload(changes = {}) {
    const id = randomUUID(), reservaId = "event-" + randomUUID(), invitadoId = "guest-" + randomUUID()
    bookingFixtures.set(reservaId, { invitadoId, inicio: new Date(now), fin: new Date(now.getTime() + 10 * 60000) })
    return { id, eventoId: eventId, reservaId, invitadoId, nombreBebe: "Bebé " + id, fechaNacimiento: "2026-01-01", nombreApoderado: "Apoderado QA", telefono: "", correo: "qa@example.test", autorizado: true, confirmado: true, privacidad: privacy, ...changes }
  }
  const mailBefore = mails.length, first = payload()
  assert.equal((await client()(url, post(first))).status, 401)
  assert.equal((await admin(url, post(first))).status, 403)
  assert.equal((await kine(url, post(first))).status, 403)
  assert.equal((await reception(url, { ...post(first), headers: { ...post(first).headers, origin: "https://ajeno.test" } })).status, 403)
  assert.equal((await reception(url, post({ ...first, autorizado: false }))).status, 400)
  const responses = await Promise.all([reception(url, post(first)), reception2(url, post({ ...first, id: randomUUID() }))])
  for (const res of responses) assert.equal(res.status, 200, JSON.stringify(await res.clone().json()))
  const saved = (await responses[0].json()).inscripcion
  assert.equal(saved.numero, 1); assert.equal(saved.esCalendly, true); assert.equal(saved.origen, "PREVIA")
  assert.equal(saved.citaInicio, bookingFixtures.get(first.reservaId).inicio.toISOString())
  assert.equal((await db.query('SELECT count(*)::int n FROM "Inscripcion" WHERE "calendlyInvitadoId"=$1', [first.invitadoId])).rows[0].n, 1)
  assert.equal((await db.query('SELECT count(*)::int n FROM "EntradaFila" WHERE "inscripcionId"=$1', [saved.id])).rows[0].n, 1)
  assert.equal((await db.query('SELECT inscritos,"ultimoNumero" FROM "Evento" WHERE id=$1', [eventId])).rows[0].inscritos, 1)
  assert.equal((await db.query('SELECT count(*)::int n FROM "CorreoInscripcion" WHERE "inscripcionId"=$1', [saved.id])).rows[0].n, 0)
  assert.equal(mails.length, mailBefore)
  assert.equal((await reception(url, post({ ...first, id: randomUUID(), nombreBebe: "Otro bebé" }))).status, 409)
  await db.query('UPDATE "Evento" SET cupos=inscritos WHERE id=$1', [eventId])
  assert.equal((await reception(url, post(payload()))).status, 409, "No sobrepasar cupos locales")
  assert.equal((await reception(url, post(first))).status, 200, "Reintento idempotente no consume otro cupo")
  await db.query('UPDATE "Evento" SET cupos=10 WHERE id=$1', [eventId])
  await db.query('UPDATE "AutorizacionPrivacidad" SET datos=false WHERE id=(SELECT "autorizacionId" FROM "Inscripcion" WHERE id=$1)', [saved.id])
  assert.equal((await reception(url, post(first))).status, 409, "No reactivar autorizaciones retiradas")
  await db.query('UPDATE "AutorizacionPrivacidad" SET datos=true WHERE id=(SELECT "autorizacionId" FROM "Inscripcion" WHERE id=$1)', [saved.id])
  const duplicate = payload({ nombreBebe: first.nombreBebe })
  assert.equal((await reception(url, post(duplicate))).status, 409, "No crear otra ficha por otra reserva del mismo bebé")
  const canceled = payload(); bookingFixtures.get(canceled.reservaId).status = "canceled"
  assert.equal((await reception(url, post(canceled))).status, 400)
  const reprogrammed = payload(); bookingFixtures.get(reprogrammed.reservaId).rescheduled = true
  assert.equal((await reception(url, post(reprogrammed))).status, 400)
  const tomorrow = payload(); const later = new Date(now.getTime() + 86400000); bookingFixtures.set(tomorrow.reservaId, { inicio: later, fin: new Date(later.getTime() + 600000) })
  assert.equal((await reception(url, post(tomorrow))).status, 409, "Día local del evento y de la reserva deben coincidir")
  // Existing inscription: preserve number, patient, contact, QR and consent; don't allocate another seat.
  await db.query(`UPDATE "Inscripcion" SET origen='PRESENCIAL',"calendlyReservaId"=NULL,"calendlyInvitadoId"=NULL,"citaInicio"=NULL,"citaFin"=NULL,"citaConfirmadaAt"=NULL WHERE id=$1`, [saved.id])
  const old = (await db.query('SELECT * FROM "Inscripcion" WHERE id=$1', [saved.id])).rows[0]
  assert.equal((await reception(url, post({ ...first, id: randomUUID(), numero: old.numero }))).status, 200)
  const linked = (await db.query('SELECT * FROM "Inscripcion" WHERE id=$1', [saved.id])).rows[0]
  for (const key of ["numero", "pacienteId", "qrToken", "apoderadoId", "autorizacionId", "contactoCorreo"]) assert.equal(linked[key], old[key])
  const altered = bookingFixtures.get(first.reservaId); altered.inicio = new Date(altered.inicio.getTime() + 600000); altered.fin = new Date(altered.fin.getTime() + 600000)
  assert.equal((await reception(url, post(first))).status, 409, "No sobrescribir citas ya llamadas al cambiar Calendly")
  // Future arrivals cannot be called early, including after absence and rejoin.
  await db.query('UPDATE "Inscripcion" SET "citaInicio"=$2,"citaFin"=$3 WHERE id=$1', [saved.id, new Date(now.getTime() + 3600000), new Date(now.getTime() + 4200000)])
  const preview = await reception(`/api/recepcion/fila?eventoId=${eventId}`)
  assert.equal(preview.status, 200); assert.equal((await preview.json()).proximo, null)
  const empty = await kine("/api/kinesiologia/llamar", post({ id: randomUUID(), eventoId: eventId }))
  assert.equal(empty.status, 200); assert.equal((await empty.json()).atencion, null)
  await db.query('UPDATE "Inscripcion" SET "citaInicio"=$2,"citaFin"=$3 WHERE id=$1', [saved.id, new Date(now.getTime() - 600000), new Date(now.getTime() + 600000)])
  const callable = await reception(`/api/recepcion/fila?eventoId=${eventId}`)
  assert.equal((await callable.json()).proximo.motivo, "CITA_PROGRAMADA")
  const call = await kine("/api/kinesiologia/llamar", post({ id: randomUUID(), eventoId: eventId }))
  assert.equal(call.status, 200); assert.equal((await call.json()).atencion.numero, saved.numero)
  assert.equal(mails.length, mailBefore)
  assert.equal((await db.query(`SELECT count(*)::int n FROM "AccesoPrivado" WHERE accion='VINCULAR_CITA_CALENDLY'`)).rows[0].n, 2)
  if (browsers) await browserCalendlyArrivalChecks({ base, password, account: accounts[0], eventId, payload, bookingFixtures, db, mails })
  console.log("OK Calendly: recepción, identidad confirmada, reserva vigente, idempotencia concurrente, inscripción existente, hora de llamada, auditoría y cero correos.")
}
