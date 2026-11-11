import { familyConsent, paperConsent } from "./privacy-fixtures.mjs"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
export async function cancellationChecks({ db, client, signIn, password, accounts, admin, anonymous, family, post, createEvent, mails }) {
  const a = await family("cancel-a@example.com"), b = await family("cancel-b@example.com"), reception = client(), kine = client()
  for (const [request, account] of [[reception, accounts[0]], [kine, accounts[2]]]) await signIn(request, "equipo", { email: account.email, password })
  const active = (await (await kine("/api/kinesiologia/atencion")).json()).atencion
  if (active) await kine("/api/kinesiologia/devolver", post({ atencionId: active.id, reservaId: active.reservaId }))
  const reason = "La familia solicitó cancelar su reserva", endpoint = id => `/api/inscripciones/${id}/cancelacion`
  const cancel = (request, event, id, extra = {}) => request(endpoint(id), post({ eventoId: event.id, motivo: reason, actorId: "intruso", perfilActor: "ADMIN", ...extra }))
  const status = (request, event, id) => request(`${endpoint(id)}?eventoId=${event.id}`)
  async function register(request, event, name, extra = {}) {
    const payload = { ...familyConsent, id: randomUUID(), eventoId: event.id, nombreBebe: name, fechaNacimiento: "2026-01-01", nombreApoderado: "Apoderado cancelación", ...extra }
    const response = await request("/api/familias/inscripciones", post(payload)); assert.equal(response.status, 201)
    return { row: (await response.json()).inscripcion, payload }
  }
  const event = await createEvent(admin, "Cupo recuperable", 1), { row, payload } = await register(a.request, event, "Reserva cancelable")
  const before = (await db.query('SELECT * FROM "Inscripcion" WHERE id=$1', [row.id])).rows[0], beforePatients = (await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n
  const token = before.qrToken, mailBefore = (await db.query('SELECT * FROM "CorreoInscripcion" WHERE "inscripcionId"=$1', [row.id])).rows[0]
  assert.equal((await status(anonymous, event, row.id)).status, 401)
  assert.equal((await cancel(anonymous, event, row.id)).status, 401)
  assert.equal((await status(kine, event, row.id)).status, 403)
  assert.equal((await cancel(kine, event, row.id)).status, 403)
  assert.equal((await status(b.request, event, row.id)).status, 404)
  assert.equal((await cancel(b.request, event, row.id)).status, 404)
  assert.equal((await status(admin, { id: randomUUID() }, row.id)).status, 404)
  assert.equal((await cancel(admin, event, row.id, { motivo: "corto" })).status, 400)
  assert.equal((await cancel(admin, event, row.id, { motivo: 1 })).status, 400)
  assert.equal((await (await status(a.request, event, row.id)).json()).puedeCancelar, true)
  const beforeMails = mails.length
  const simultaneous = await Promise.all([cancel(a.request, event, row.id), cancel(reception, event, row.id)])
  assert.deepEqual(simultaneous.map(response => response.status), [200, 200])
  const outcomes = await Promise.all(simultaneous.map(response => response.json())); assert.equal(outcomes.filter(value => value.nueva).length, 1)
  assert.equal((await db.query('SELECT count(*)::int n FROM "CancelacionInscripcion" WHERE "inscripcionId"=$1', [row.id])).rows[0].n, 1)
  const cancelled = (await db.query('SELECT * FROM "CancelacionInscripcion" WHERE "inscripcionId"=$1', [row.id])).rows[0]
  assert.notEqual(cancelled.actorId, "intruso"); assert.equal(cancelled.motivo, reason); assert.equal(cancelled.estadoCorreoAnterior, "ENVIADO")
  assert.deepEqual((await db.query('SELECT * FROM "Inscripcion" WHERE id=$1', [row.id])).rows[0], before)
  assert.equal((await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n, beforePatients)
  assert.deepEqual((await db.query('SELECT inscritos,"ultimoNumero" FROM "Evento" WHERE id=$1', [event.id])).rows[0], { inscritos: 0, ultimoNumero: 1 })
  const cancelledMail = (await db.query('SELECT * FROM "CorreoInscripcion" WHERE "inscripcionId"=$1', [row.id])).rows[0]
  assert.equal(cancelledMail.estado, "CANCELADO"); assert.equal(cancelledMail.proveedorId, mailBefore.proveedorId); assert.equal(mails.length, beforeMails)
  assert((await (await a.request("/api/familias/inscripciones")).json()).inscripciones.find(value => value.id === row.id).cancelacion)
  assert.equal((await a.request(`/api/familias/inscripciones/${row.id}/qr`)).status, 409)
  assert.equal((await a.request(`/api/familias/inscripciones/${row.id}/correo`, post({}))).status, 409)
  assert.equal((await reception("/api/recepcion/correo", post({ eventoId: event.id, inscripcionId: row.id }))).status, 409)
  assert.equal((await reception("/api/recepcion/llegadas", post({ eventoId: event.id, inscripcionId: row.id }))).status, 409)
  assert.equal((await a.request("/api/familias/inscripciones", post(payload))).status, 409)
  assert.equal((await a.request("/api/familias/inscripciones", post({ ...familyConsent, ...payload, id: randomUUID() }))).status, 409)
  const lookup = await reception("/api/recepcion/buscar", post({ eventoId: event.id, consulta: `CASKU:INSCRIPCION:${token}` })); assert.equal(lookup.status, 200); assert((await lookup.json()).inscripcion.cancelacion)
  const next = (await register(b.request, event, "Usa el cupo liberado")).row
  assert.equal(next.numero, 2)
  let overview = (await (await admin(`/api/eventos/${event.id}/resumen`)).json()).totales
  assert.equal(overview.inscritos, 1); assert.equal(overview.canceladas, 1); assert.equal(overview.sinLlegada, 1)
  let latest = (await (await admin("/api/eventos")).json()).eventos.find(value => value.id === event.id)
  let response = await admin(`/api/eventos/${event.id}`, { ...post({ ...latest, cupos: 2 }), method: "PATCH" }); assert.equal(response.status, 200); latest = (await response.json()).evento
  assert.equal((await admin(`/api/eventos/${event.id}`, { ...post({ ...latest, cupos: 1 }), method: "PATCH" })).status, 200, "La capacidad mínima usa reservas vigentes, no canceladas")
  assert.equal((await cancel(b.request, event, next.id)).status, 200)
  await admin(`/api/eventos/${event.id}/inscripciones`, { ...post({ abiertas: false }), method: "PATCH" })
  latest = (await (await admin("/api/eventos")).json()).eventos.find(value => value.id === event.id)
  assert.equal(latest.fechaProtegida, true)
  assert.equal((await admin(`/api/eventos/${event.id}`, { ...post({ ...latest, fecha: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10) }), method: "PATCH" })).status, 409)
  console.log("OK cancelación familiar: permisos/propiedad, auditoría única, cupo liberado una vez, nueva reserva con número siguiente e historial/fecha protegidos.")

  const queueEvent = await createEvent(admin, "Cancelación y atención", 6)
  const waiting = (await register(a.request, queueEvent, "En espera", { bebeId: row.bebe.id })).row
  const arrive = id => reception("/api/recepcion/llegadas", post({ eventoId: queueEvent.id, inscripcionId: id }))
  assert.equal((await arrive(waiting.id)).status, 201)
  assert.equal((await cancel(a.request, queueEvent, waiting.id)).status, 409)
  assert.equal((await cancel(admin, queueEvent, waiting.id)).status, 200)
  assert.equal((await db.query('SELECT estado FROM "EntradaFila" WHERE "inscripcionId"=$1', [waiting.id])).rows[0].estado, "CANCELADO")
  const absent = (await register(b.request, queueEvent, "Ausente cancelable")).row
  await arrive(absent.id)
  let attention = (await (await kine("/api/kinesiologia/llamar", post({ id: randomUUID(), eventoId: queueEvent.id }))).json()).atencion
  assert.equal(attention.numero, absent.numero)
  assert.equal((await kine("/api/kinesiologia/ausente", post({ atencionId: attention.id, reservaId: attention.reservaId }))).status, 200)
  const absence = (await db.query('SELECT "ausenciaId" FROM "EntradaFila" WHERE "inscripcionId"=$1', [absent.id])).rows[0].ausenciaId
  assert.equal((await cancel(reception, queueEvent, absent.id)).status, 200)
  assert.equal((await reception("/api/recepcion/reincorporar", post({ eventoId: queueEvent.id, inscripcionId: absent.id, ausenciaId: absence }))).status, 409)
  assert.equal((await db.query('SELECT "estadoFilaAnterior" FROM "CancelacionInscripcion" WHERE "inscripcionId"=$1', [absent.id])).rows[0].estadoFilaAnterior, "AUSENTE")
  assert.equal((await db.query('SELECT count(*)::int n FROM "MovimientoFila" WHERE "entradaId"=$1', [attention.id])).rows[0].n, 1)
  const clinical = (await register(a.request, queueEvent, "Atención protegida")).row
  await arrive(clinical.id)
  attention = (await (await kine("/api/kinesiologia/llamar", post({ id: randomUUID(), eventoId: queueEvent.id }))).json()).atencion
  assert.equal((await cancel(reception, queueEvent, clinical.id)).status, 409)
  const saved = await kine("/api/evaluaciones", post({ atencionId: attention.id, reservaId: attention.reservaId, ap: 140, bp: 120, di: 135, dd: 138 })); assert.equal(saved.status, 201)
  const evalId = (await saved.json()).evaluacionId
  assert.equal((await kine(`/api/kinesiologia/resultados/${evalId}/publicar`, post({ revision: 1 }))).status, 201)
  const clinicalSnapshot = () => db.query('SELECT to_jsonb(e) AS row FROM "Evaluacion" e WHERE id=$1 UNION ALL SELECT to_jsonb(p) FROM "ResultadoPublicado" p WHERE "evaluacionId"=$1', [evalId])
  const beforeClinical = (await clinicalSnapshot()).rows
  assert.equal((await cancel(admin, queueEvent, clinical.id)).status, 409)
  assert.deepEqual((await clinicalSnapshot()).rows, beforeClinical)
  overview = (await (await admin(`/api/eventos/${queueEvent.id}/resumen`)).json()).totales
  assert.equal(overview.inscritos, 1); assert.equal(overview.canceladas, 2); assert.equal(overview.atendidos, 1); assert.equal(overview.enEspera, 0); assert.equal(overview.ausentes, 0)
  console.log("OK fila y clínica: cancelados fuera del llamado, ausencia histórica conservada, llegada familiar protegida y bloqueo de cancelación en atención o con evaluación.")

  const recovery = await createEvent(admin, "Rollback de cancelación", 2), retry = (await register(a.request, recovery, "Cancelación recuperable")).row
  await db.query('UPDATE "CorreoInscripcion" SET estado=\'ENVIANDO\' WHERE "inscripcionId"=$1', [retry.id])
  assert.equal((await cancel(reception, recovery, retry.id)).status, 409)
  await db.query('UPDATE "CorreoInscripcion" SET estado=\'FALLIDO\' WHERE "inscripcionId"=$1', [retry.id])
  await db.exec(`CREATE FUNCTION cancellation_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER cancellation_fail_trigger BEFORE INSERT ON "CancelacionInscripcion" FOR EACH ROW EXECUTE FUNCTION cancellation_fail();`)
  assert.equal((await cancel(reception, recovery, retry.id)).status, 503)
  assert.equal((await db.query('SELECT inscritos FROM "Evento" WHERE id=$1', [recovery.id])).rows[0].inscritos, 1)
  assert.equal((await db.query('SELECT estado FROM "CorreoInscripcion" WHERE "inscripcionId"=$1', [retry.id])).rows[0].estado, "FALLIDO")
  await db.exec('DROP TRIGGER cancellation_fail_trigger ON "CancelacionInscripcion"; DROP FUNCTION cancellation_fail();')
  assert.equal((await cancel(reception, recovery, retry.id)).status, 200)
  const racing = await createEvent(admin, "Último cupo frente a cancelación", 1), old = (await register(a.request, racing, "Reserva antes de liberar")).row
  const race = await Promise.all([cancel(reception, racing, old.id), b.request("/api/familias/inscripciones", post({ ...familyConsent, id: randomUUID(), eventoId: racing.id, nombreBebe: "Reserva concurrente", fechaNacimiento: "2026-01-01", nombreApoderado: "Apoderado cancelación" }))])
  assert.equal(race[0].status, 200); assert([201, 409].includes(race[1].status))
  const count = (await db.query('SELECT count(*)::int n FROM "Inscripcion" i WHERE "eventoId"=$1 AND NOT EXISTS (SELECT 1 FROM "CancelacionInscripcion" c WHERE c."inscripcionId"=i.id)', [racing.id])).rows[0].n
  assert.equal((await db.query('SELECT inscritos FROM "Evento" WHERE id=$1', [racing.id])).rows[0].inscritos, count); assert(count <= 1)
  const callRaceEvent = await createEvent(admin, "Llamado frente a cancelación", 1), callRaceRow = (await register(a.request, callRaceEvent, "Llamado concurrente")).row
  await reception("/api/recepcion/llegadas", post({ eventoId: callRaceEvent.id, inscripcionId: callRaceRow.id }))
  const callRace = await Promise.all([kine("/api/kinesiologia/llamar", post({ id: randomUUID(), eventoId: callRaceEvent.id })), cancel(reception, callRaceEvent, callRaceRow.id)])
  assert.equal(callRace[0].status, 200)
  const callResult = await callRace[0].json()
  if (callResult.atencion) {
    assert.equal(callRace[1].status, 409)
    await kine("/api/kinesiologia/devolver", post({ atencionId: callResult.atencion.id, reservaId: callResult.atencion.reservaId }))
    assert.equal((await cancel(reception, callRaceEvent, callRaceRow.id)).status, 200)
  } else assert.equal(callRace[1].status, 200)
  assert.equal((await db.query('SELECT inscritos FROM "Evento" WHERE id=$1', [callRaceEvent.id])).rows[0].inscritos, 0)
  // Un código entregado antes de cancelar no permite adquirir la inscripción cancelada.
  const day = await createEvent(admin, "Código cancelado", 2, false), parts = new Intl.DateTimeFormat("en", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()), part = key => parts.find(p => p.type === key).value
  await db.query('UPDATE "Evento" SET fecha=$1::date WHERE id=$2', [`${part("year")}-${part("month")}-${part("day")}`, day.id])
  response = await reception("/api/recepcion/presencial", post({ ...paperConsent, id: randomUUID(), eventoId: day.id, nombreBebe: "Presencial cancelado", fechaNacimiento: "2026-01-01", nombreApoderado: "Contacto ficticio" })); assert.equal(response.status, 201)
  const onsite = (await response.json()).inscripcion, invite = { id: randomUUID(), eventoId: day.id, inscripcionId: onsite.id, correo: a.user.email }
  const code = (await (await reception("/api/recepcion/vinculaciones", post(invite))).json()).codigo
  assert.equal((await cancel(reception, day, onsite.id)).status, 200)
  assert.equal((await a.request("/api/familias/vinculaciones", post({ ...familyConsent, codigo: code }))).status, 404)
  assert.equal((await reception("/api/recepcion/vinculaciones", post({ ...invite, id: randomUUID() }))).status, 409)
  assert.equal((await reception("/api/recepcion/presencial", post({ ...paperConsent, id: randomUUID(), eventoId: day.id, nombreBebe: "Presencial cancelado", fechaNacimiento: "2026-01-01", nombreApoderado: "Contacto ficticio" }))).status, 409)
  console.log("OK recuperación y carreras: envío en curso protegido, rollback de auditoría/cupo, reserva simultánea sin sobreventa y código/reingreso presencial bloqueados tras cancelar.")
}
