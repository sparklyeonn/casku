import { familyConsent, paperConsent } from "./privacy-fixtures.mjs"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

export async function absenceChecks({ db, client, signIn, password, accounts, admin, anonymous, f1, post, createEvent, mails }) {
  const reception = client(), otherReception = client(), kine = client(), otherKine = client()
  for (const [request, account] of [[reception, accounts[0]], [otherReception, accounts[1]], [kine, accounts[2]], [otherKine, accounts[3]]]) await signIn(request, "equipo", { email: account.email, password })
  for (const request of [kine, otherKine]) {
    const active = (await (await request("/api/kinesiologia/atencion")).json()).atencion
    if (active) await request("/api/kinesiologia/devolver", post({ atencionId: active.id, reservaId: active.reservaId }))
  }
  const measures = { ap: 140, bp: 120, di: 135, dd: 138 }
  const queue = async (event, suffix = "") => (await (await reception(`/api/recepcion/fila?eventoId=${event.id}${suffix}`)).json())
  async function previous(event, count) {
    const rows = []
    for (let i = 0; i < count; i++) {
      const response = await f1.request("/api/familias/inscripciones", post({ ...familyConsent, id: randomUUID(), eventoId: event.id, nombreBebe: `Bebé ${event.nombre} ${i}`, fechaNacimiento: "2026-01-01", nombreApoderado: "Apoderado ficticio" }))
      assert.equal(response.status, 201); rows.push((await response.json()).inscripcion)
    }
    for (const row of rows) assert.equal((await reception("/api/recepcion/llegadas", post({ eventoId: event.id, inscripcionId: row.id }))).status, 201)
    return rows
  }
  async function call(event) {
    const request = { id: randomUUID(), eventoId: event.id }
    const response = await kine("/api/kinesiologia/llamar", post(request)); assert.equal(response.status, 200)
    return { attention: (await response.json()).atencion, request }
  }
  const absenceBody = attention => ({ atencionId: attention.id, reservaId: attention.reservaId })
  const save = attention => kine("/api/evaluaciones", post({ ...absenceBody(attention), ...measures }))
  const totals = async event => (await db.query('SELECT inscritos,"ultimoNumero",cupos,"previosConsecutivos","ultimoOrdenFila" FROM "Evento" WHERE id=$1', [event.id])).rows[0]
  const movementCount = async (entryId, type) => (await db.query('SELECT count(*)::int n FROM "MovimientoFila" WHERE "entradaId"=$1 AND tipo=$2::"TipoMovimientoFila"', [entryId, type])).rows[0].n
  const event = await createEvent(admin, "Ausencias ficticias", 6, true), registered = await previous(event, 3)
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const part = key => parts.find(value => value.type === key).value
  await db.query('UPDATE "Evento" SET fecha=$1::date WHERE id=$2', [`${part("year")}-${part("month")}-${part("day")}`, event.id])
  const walkinResponse = await reception("/api/recepcion/presencial", post({ ...paperConsent, id: randomUUID(), eventoId: event.id, nombreBebe: "Bebé del día ausente", fechaNacimiento: "2026-01-01", nombreApoderado: "Familia ficticia" }))
  assert.equal(walkinResponse.status, 201)
  const walkin = (await walkinResponse.json()).inscripcion
  const original = new Date(Date.now() - 50 * 60000)
  await db.query('UPDATE "EntradaFila" SET "llegadaAt"=$1,"esperaDesde"=$1 WHERE "inscripcionId"=$2', [original, registered[0].id])
  const beforePatients = (await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n, beforeRegistrations = (await db.query('SELECT count(*)::int n FROM "Inscripcion"')).rows[0].n
  const inscriptionBefore = (await db.query('SELECT to_jsonb(i) AS row FROM "Inscripcion" i WHERE id=$1', [registered[0].id])).rows[0].row
  const first = await call(event), attention = first.attention
  assert.equal(attention.numero, registered[0].numero)
  const ids = { eventoId: event.id, inscripcionId: registered[0].id, ausenciaId: randomUUID() }
  for (const [request, code] of [[anonymous, 401], [f1.request, 401], [admin, 403], [reception, 403]]) assert.equal((await request("/api/kinesiologia/ausente", post(absenceBody(attention)))).status, code)
  for (const [request, code] of [[anonymous, 401], [f1.request, 401], [admin, 403], [kine, 403]]) assert.equal((await request("/api/recepcion/reincorporar", post(ids))).status, code)
  assert.equal((await otherKine("/api/kinesiologia/ausente", post(absenceBody(attention)))).status, 404)
  assert.equal((await kine("/api/kinesiologia/ausente", post({ ...absenceBody(attention), reservaId: randomUUID() }))).status, 404)
  const quota = (await totals(event)).previosConsecutivos
  const absentResults = await Promise.all([kine("/api/kinesiologia/ausente", post(absenceBody(attention))), kine("/api/kinesiologia/ausente", post(absenceBody(attention)))])
  assert(absentResults.every(response => response.status === 200))
  const absences = await Promise.all(absentResults.map(r => r.json()))
  assert.deepEqual(absences.map(row => row.nueva).sort(), [false, true]); assert.equal(absences[0].ausenciaId, absences[1].ausenciaId)
  const absenceId = absences[0].ausenciaId
  assert.equal(await movementCount(attention.id, "AUSENCIA"), 1)
  assert.equal((await (await kine("/api/kinesiologia/atencion")).json()).atencion, null)
  const absentQueue = await queue(event)
  assert.equal(absentQueue.total, 3); assert.equal(absentQueue.ausentes.total, 1); assert.equal(absentQueue.ausentes.inscripciones[0].id, registered[0].id)
  assert(!JSON.stringify(absentQueue.ausentes).match(/diagnostico|correo|profesionalId|rut|usuarioId/))
  assert.equal((await save(attention)).status, 409)
  assert.equal((await kine("/api/kinesiologia/devolver", post(absenceBody(attention)))).status, 409)
  assert((await (await kine(`/evaluacion?atencion=${attention.id}&reserva=${attention.reservaId}`)).text()).includes("Atención no disponible"))
  const ordinaryArrival = await reception("/api/recepcion/llegadas", post({ eventoId: event.id, inscripcionId: registered[0].id }))
  assert.equal((await ordinaryArrival.json()).inscripcion.llegada.estado, "AUSENTE", "La llegada ordinaria no elude la reincorporación")
  const token = (await db.query('SELECT "qrToken" FROM "Inscripcion" WHERE id=$1', [registered[0].id])).rows[0].qrToken
  const lookup = (await (await reception("/api/recepcion/buscar", post({ eventoId: event.id, consulta: `CASKU:INSCRIPCION:${token}` }))).json()).inscripcion
  assert.equal(lookup.llegada.ausenciaId, absenceId)
  const rejoinBody = { eventoId: event.id, inscripcionId: lookup.id, ausenciaId: absenceId, usuarioId: "intruso" }
  const beforeRejoin = await totals(event), start = Date.now()
  const rejoinedResults = await Promise.all([reception, otherReception].map(request => request("/api/recepcion/reincorporar", post(rejoinBody))))
  assert(rejoinedResults.every(r => r.status === 200))
  const rejoined = await Promise.all(rejoinedResults.map(r => r.json()))
  assert.deepEqual(rejoined.map(row => row.reincorporada).sort(), [false, true])
  const returned = rejoined[0].inscripcion
  assert.equal(returned.id, registered[0].id); assert.equal(returned.numero, registered[0].numero); assert.equal(returned.origen, "PREVIA")
  assert.equal(Date.parse(returned.llegada.llegadaAt), original.getTime()); assert(Date.parse(returned.llegada.esperaDesde) >= start)
  assert.equal(returned.llegada.orden, beforeRejoin.ultimoOrdenFila + 1)
  assert.equal(await movementCount(attention.id, "REINCORPORACION"), 1)
  const afterRejoin = await totals(event)
  assert.equal(afterRejoin.ultimoOrdenFila, beforeRejoin.ultimoOrdenFila + 1)
  assert.equal(afterRejoin.inscritos, beforeRejoin.inscritos); assert.equal(afterRejoin.ultimoNumero, beforeRejoin.ultimoNumero); assert.equal(afterRejoin.previosConsecutivos, quota)
  assert.deepEqual((await db.query('SELECT to_jsonb(i) AS row FROM "Inscripcion" i WHERE id=$1', [registered[0].id])).rows[0].row, inscriptionBefore)
  const stored = (await db.query('SELECT "profesionalId","reservaId" FROM "EntradaFila" WHERE id=$1', [attention.id])).rows[0]
  assert.equal(stored.profesionalId, null); assert.equal(stored.reservaId, null)
  assert.equal((await save(attention)).status, 404)
  assert.equal((await kine("/api/kinesiologia/ausente", post(absenceBody(attention)))).status, 404)
  assert.equal((await (await kine("/api/kinesiologia/llamar", post(first.request))).json()).resultado, "TERMINADA")
  await db.query('UPDATE "Evento" SET "previosConsecutivos"=3 WHERE id=$1', [event.id])
  assert.equal((await queue(event)).proximo.numero, walkin.numero, "El tiempo ausente no concede prioridad de 30 minutos")
  const calledWalkin = (await call(event)).attention
  const walkinAbsence = await (await kine("/api/kinesiologia/ausente", post(absenceBody(calledWalkin)))).json()
  const walkinBack = await reception("/api/recepcion/reincorporar", post({ eventoId: event.id, inscripcionId: walkin.id, ausenciaId: walkinAbsence.ausenciaId }))
  assert.equal((await walkinBack.json()).inscripcion.origen, "PRESENCIAL")
  for (const row of registered.slice(1)) {
    const next = (await call(event)).attention; assert.equal(next.numero, row.numero); assert.equal((await save(next)).status, 201)
    assert.equal((await kine("/api/kinesiologia/ausente", post(absenceBody(next)))).status, 409)
  }
  const secondCall = (await call(event)).attention
  assert.equal(secondCall.id, attention.id); assert.notEqual(secondCall.reservaId, attention.reservaId)
  const repeatedRejoin = await reception("/api/recepcion/reincorporar", post(rejoinBody))
  assert.equal((await repeatedRejoin.json()).inscripcion.llegada.estado, "EN_ATENCION", "Reintentar no retira una atención nueva")
  const secondAbsence = await (await kine("/api/kinesiologia/ausente", post(absenceBody(secondCall)))).json()
  assert.notEqual(secondAbsence.ausenciaId, absenceId)
  assert.equal((await reception("/api/recepcion/reincorporar", post(rejoinBody))).status, 409, "Una pestaña antigua no reincorpora otra ausencia")
  assert.equal((await reception("/api/recepcion/reincorporar", post({ ...rejoinBody, eventoId: randomUUID(), ausenciaId: secondAbsence.ausenciaId }))).status, 404)
  const lastReturn = { ...rejoinBody, ausenciaId: secondAbsence.ausenciaId }
  assert.equal((await reception("/api/recepcion/reincorporar", post(lastReturn))).status, 200)
  assert.equal(await movementCount(attention.id, "AUSENCIA"), 2); assert.equal(await movementCount(attention.id, "REINCORPORACION"), 2)
  const audits = (await db.query('SELECT tipo,"usuarioId" FROM "MovimientoFila" WHERE "entradaId"=$1', [attention.id])).rows
  assert(audits.filter(row => row.tipo === "AUSENCIA").every(row => row.usuarioId === accounts[2].id))
  assert(audits.filter(row => row.tipo === "REINCORPORACION").every(row => [accounts[0].id, accounts[1].id].includes(row.usuarioId)))
  assert.equal((await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n, beforePatients)
  assert.equal((await db.query('SELECT count(*)::int n FROM "Inscripcion"')).rows[0].n, beforeRegistrations)
  console.log("OK ausencias: permisos, profesional liberada, QR/número/cupo conservados, regreso al final del grupo y pestañas obsoletas bloqueadas.")

  // Guardar y marcar ausencia compiten por el mismo bloqueo: solo uno puede ganar.
  const raceEvent = await createEvent(admin, "Carrera ausencia", 2, true), raceRows = await previous(raceEvent, 2)
  const competing = (await call(raceEvent)).attention
  const [absentSave, evaluationSave] = await Promise.all([kine("/api/kinesiologia/ausente", post(absenceBody(competing))), save(competing)])
  assert([200, 409].includes(absentSave.status)); assert([201, 409].includes(evaluationSave.status))
  assert.notEqual(absentSave.status === 200, evaluationSave.status === 201)
  const raceState = (await db.query('SELECT estado FROM "EntradaFila" WHERE id=$1', [competing.id])).rows[0].estado
  assert.equal(raceState, evaluationSave.status === 201 ? "ATENDIDO" : "AUSENTE")
  assert.equal((await db.query('SELECT count(*)::int n FROM "Evaluacion" WHERE "filaId"=$1', [competing.id])).rows[0].n, evaluationSave.status === 201 ? 1 : 0)
  const following = (await call(raceEvent)).attention; assert.equal(following.numero, raceRows[1].numero)
  const failAudit = () => db.exec(`CREATE FUNCTION movement_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER movement_fail_trigger BEFORE INSERT ON "MovimientoFila" FOR EACH ROW EXECUTE FUNCTION movement_fail();`)
  const restoreAudit = () => db.exec('DROP TRIGGER movement_fail_trigger ON "MovimientoFila"; DROP FUNCTION movement_fail();')
  await failAudit()
  assert.equal((await kine("/api/kinesiologia/ausente", post(absenceBody(following)))).status, 503)
  assert.equal((await db.query('SELECT estado FROM "EntradaFila" WHERE id=$1', [following.id])).rows[0].estado, "EN_ATENCION")
  await restoreAudit()
  const recoverAbsence = await (await kine("/api/kinesiologia/ausente", post(absenceBody(following)))).json()
  const recoverBody = { eventoId: raceEvent.id, inscripcionId: raceRows[1].id, ausenciaId: recoverAbsence.ausenciaId }
  const beforeFailure = await totals(raceEvent)
  await failAudit()
  assert.equal((await reception("/api/recepcion/reincorporar", post(recoverBody))).status, 503)
  assert.deepEqual(await totals(raceEvent), beforeFailure)
  assert.equal((await db.query('SELECT estado FROM "EntradaFila" WHERE id=$1', [following.id])).rows[0].estado, "AUSENTE")
  await restoreAudit()
  assert.equal((await reception("/api/recepcion/reincorporar", post(recoverBody))).status, 200)
  assert.equal(await movementCount(following.id, "REINCORPORACION"), 1)

  const longId = (await db.query('SELECT id FROM "Evento" WHERE nombre=$1', ["Fila extensa ficticia"])).rows[0].id
  await db.query('UPDATE "EntradaFila" SET estado=\'AUSENTE\',"ausenciaId"=gen_random_uuid(),"ausenteAt"=CURRENT_TIMESTAMP WHERE "eventoId"=$1', [longId])
  const page1 = await queue({ id: longId })
  assert.equal(page1.total, 0); assert.equal(page1.ausentes.total, 55); assert.equal(page1.ausentes.inscripciones.length, 50); assert.equal(page1.ausentes.siguiente, 50)
  const page2 = await queue({ id: longId }, "&ausentesDespues=50")
  assert.equal(page2.ausentes.inscripciones.length, 5); assert.equal(page2.ausentes.siguiente, null)
  assert.equal((await reception(`/api/recepcion/fila?eventoId=${longId}&ausentesDespues=-1`)).status, 400)
  assert(mails.every(mail => !mail.subject.includes("ausente")), "No se envían avisos automáticos por una ausencia")
  console.log("OK consistencia: ausencia frente a guardado, auditoría por ciclo, rollback completo y listado paginado de ausentes.")
}
