import { paperConsent } from "./privacy-fixtures.mjs"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

export async function onsiteChecks({ db, client, signIn, password, accounts, admin, anonymous, f1, post, createEvent, mails, setMailFailure }) {
  const reception = client(), otherReception = client(), kine = client(), otherKine = client()
  for (const [request, account] of [[reception, accounts[0]], [otherReception, accounts[1]], [kine, accounts[2]], [otherKine, accounts[3]]]) await signIn(request, "equipo", { email: account.email, password })
  for (const request of [kine, otherKine]) {
    const active = (await (await request("/api/kinesiologia/atencion")).json()).atencion
    if (active) await request("/api/kinesiologia/devolver", post({ atencionId: active.id, reservaId: active.reservaId }))
  }
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const part = key => parts.find(p => p.type === key).value
  const today = `${part("year")}-${part("month")}-${part("day")}`
  const setToday = event => db.query('UPDATE "Evento" SET fecha=$1::date WHERE id=$2', [today, event.id])
  async function currentEvent(name, cupos, open = false) { const event = await createEvent(admin, name, cupos, open); await setToday(event); return event }
  const input = (event, name, changes = {}) => ({ ...paperConsent, id: randomUUID(), eventoId: event.id, nombreBebe: name, fechaNacimiento: "2026-01-01", nombreApoderado: "Familia presencial ficticia", correo: "", telefono: "", ...changes })
  async function onsite(payload, request = reception) {
    const response = await request("/api/recepcion/presencial", post(payload)), data = await response.json()
    assert([200, 201].includes(response.status), `Registro presencial: ${response.status}`)
    return data
  }
  async function previous(event, count) {
    const rows = []
    for (let i = 0; i < count; i++) {
      const payload = input(event, `Previo ${event.nombre} ${i}`, { nombreApoderado: "Apoderado ficticio", origen: "PRESENCIAL" })
      const response = await f1.request("/api/familias/inscripciones", post(payload)); assert.equal(response.status, 201)
      const row = (await response.json()).inscripcion
      assert.equal((await db.query('SELECT origen FROM "Inscripcion" WHERE id=$1', [row.id])).rows[0].origen, "PREVIA", "El navegador no define la prioridad")
      rows.push(row)
    }
    return rows
  }
  async function arrive(event, rows) {
    for (const row of rows) assert.equal((await reception("/api/recepcion/llegadas", post({ eventoId: event.id, inscripcionId: row.id }))).status, 201)
  }
  const queue = async event => (await (await reception(`/api/recepcion/fila?eventoId=${event.id}`)).json())
  const measures = { ap: 140, bp: 120, di: 135, dd: 138 }
  async function callAndSave(event, expectedNumber, request = kine) {
    const call = { id: randomUUID(), eventoId: event.id }
    const response = await request("/api/kinesiologia/llamar", post(call)); assert.equal(response.status, 200)
    const attention = (await response.json()).atencion
    assert.equal(attention.numero, expectedNumber)
    const count = (await db.query('SELECT "previosConsecutivos" FROM "Evento" WHERE id=$1', [event.id])).rows[0].previosConsecutivos
    assert.equal((await (await request("/api/kinesiologia/llamar", post(call))).json()).atencion.id, attention.id)
    assert.equal((await (await request("/api/kinesiologia/llamar", post({ ...call, id: randomUUID() }))).json()).atencion.id, attention.id)
    assert.equal((await db.query('SELECT "previosConsecutivos" FROM "Evento" WHERE id=$1', [event.id])).rows[0].previosConsecutivos, count, "Reintentar no avanza la proporción")
    const saved = await request("/api/evaluaciones", post({ atencionId: attention.id, reservaId: attention.reservaId, ...measures }))
    assert.equal(saved.status, 201)
    return { attention, saved: await saved.json() }
  }

  const mixed = await createEvent(admin, "Mixta ficticia", 20, true), prev = await previous(mixed, 6)
  const bad = input(mixed, "No habilitado")
  assert.equal((await reception("/api/recepcion/presencial", post(bad))).status, 409)
  await setToday(mixed)
  for (const [request, code] of [[anonymous, 401], [f1.request, 401], [admin, 403], [kine, 403]]) {
    assert.equal((await request("/api/recepcion/presencial", post(input(mixed, "Sin permiso")))).status, code)
    assert.equal((await request("/api/recepcion/correo", post({ eventoId: mixed.id, inscripcionId: prev[0].id }))).status, code)
    assert.equal((await request(`/api/recepcion/inscripciones/${prev[0].id}/qr?eventoId=${mixed.id}`)).status, code)
  }
  const ownersBefore = (await db.query('SELECT count(*)::int n FROM "Apoderado"')).rows[0].n
  const payload = input(mixed, "Presencial primero", { correo: f1.user.email, origen: "PREVIA", apoderadoId: f1.user.id })
  const w1 = await onsite(payload)
  assert.equal(w1.inscripcion.numero, 7); assert.equal(w1.inscripcion.origen, "PRESENCIAL"); assert.equal(w1.inscripcion.llegada.orden, 1); assert.equal(w1.correo, "ENVIADO")
  const stored = (await db.query('SELECT i."apoderadoId", p."apoderadoId" AS owner FROM "Inscripcion" i JOIN "Paciente" p ON p.id=i."pacienteId" WHERE i.id=$1', [w1.inscripcion.id])).rows[0]
  assert.equal(stored.apoderadoId, null); assert.equal(stored.owner, null)
  assert.equal((await db.query('SELECT count(*)::int n FROM "Apoderado"')).rows[0].n, ownersBefore)
  assert(!(await (await f1.request("/api/familias/inscripciones")).json()).inscripciones.some(row => row.id === w1.inscripcion.id))
  assert.equal((await f1.request(`/api/familias/inscripciones/${w1.inscripcion.id}/qr`)).status, 404)
  const qr = await reception(`/api/recepcion/inscripciones/${w1.inscripcion.id}/qr?eventoId=${mixed.id}`)
  assert.equal(qr.status, 200); assert(qr.headers.get("cache-control").includes("no-store"))
  assert.equal(Buffer.from(await qr.arrayBuffer()).subarray(0, 8).toString("hex"), "89504e470d0a1a0a")
  assert.equal((await reception(`/api/recepcion/inscripciones/${w1.inscripcion.id}/qr?eventoId=${randomUUID()}`)).status, 404)
  assert.equal((await onsite(payload)).inscripcion.id, w1.inscripcion.id)
  assert.equal((await onsite({ ...payload, id: randomUUID() }, otherReception)).inscripcion.id, w1.inscripcion.id)
  assert.equal((await otherReception("/api/recepcion/presencial", post(payload))).status, 409)
  assert.equal((await reception("/api/recepcion/presencial", post({ ...paperConsent, ...payload, nombreBebe: "Otro" }))).status, 409)
  await arrive(mixed, prev)
  const w2 = await onsite(input(mixed, "Presencial sin correo"))
  assert.equal(w2.inscripcion.numero, 8); assert.equal(w2.correo, "SIN_CORREO")
  assert.equal((await queue(mixed)).total, 8)
  const expected = [1, 2, 3, 7, 4, 5, 6, 8]
  for (const [index, number] of expected.entries()) {
    const before = await queue(mixed)
    assert.equal(before.proximo.numero, number)
    if (index === 3) assert.equal(before.proximo.motivo, "TURNO_PRESENCIAL")
    const { attention, saved } = await callAndSave(mixed, number, index % 2 ? otherKine : kine)
    if (number === 8) {
      assert.equal(attention.correo, "")
      assert.equal((await db.query('SELECT "correoPadre" FROM "Evaluacion" WHERE id=$1', [saved.evaluacionId])).rows[0].correoPadre, null)
    }
  }
  assert.equal((await queue(mixed)).total, 0)
  assert.equal((await db.query('SELECT inscritos FROM "Evento" WHERE id=$1', [mixed.id])).rows[0].inscritos, 8)
  console.log("OK presencial e intercalado: permisos, QR, contactos sin vinculación automática, duplicados y secuencia 3:1 compartida entre profesionales.")

  const aged = await createEvent(admin, "Espera ficticia", 10, true), agedPrev = await previous(aged, 2)
  await setToday(aged); await arrive(aged, agedPrev)
  const old = await onsite(input(aged, "Presencial con espera"))
  async function age(id, minutes) { await db.query('UPDATE "EntradaFila" SET "llegadaAt"=$1,"esperaDesde"=$1 WHERE "inscripcionId"=$2', [new Date(Date.now() - minutes * 60000), id]) }
  await age(old.inscripcion.id, 31)
  const overdue = await queue(aged)
  assert.equal(overdue.proximo.numero, old.inscripcion.numero); assert.equal(overdue.proximo.motivo, "ESPERA_MAXIMA")
  const clinicalPreview = await (await kine(`/api/kinesiologia/atencion?eventoId=${aged.id}`)).json()
  assert.equal(clinicalPreview.proximo.numero, overdue.proximo.numero)
  await callAndSave(aged, old.inscripcion.numero)
  const youngerWalkin = await onsite(input(aged, "Segunda espera"))
  await age(agedPrev[0].id, 45); await age(youngerWalkin.inscripcion.id, 35)
  await db.query('UPDATE "Evento" SET "previosConsecutivos"=3 WHERE id=$1', [aged.id])
  assert.equal((await queue(aged)).proximo.numero, agedPrev[0].numero, "Mayor espera de ambos grupos tiene prioridad")
  await callAndSave(aged, agedPrev[0].numero)
  assert.equal((await queue(aged)).proximo.numero, youngerWalkin.inscripcion.numero)
  await callAndSave(aged, youngerWalkin.inscripcion.numero)

  const full = await createEvent(admin, "Reserva previa", 1, true), reserved = (await previous(full, 1))[0]
  await setToday(full)
  assert.equal((await reception("/api/recepcion/presencial", post(input(full, "Sin cupo")))).status, 409)
  const duplicate = await onsite(input(full, reserved.bebe.nombre, { nombreApoderado: "Apoderado ficticio", correo: "otro@example.com" }))
  assert.equal(duplicate.inscripcion.id, reserved.id); assert.equal(duplicate.inscripcion.origen, "PREVIA"); assert.equal(duplicate.nuevaInscripcion, false)
  assert.equal((await db.query('SELECT inscritos FROM "Evento" WHERE id=$1', [full.id])).rows[0].inscritos, 1)

  const race = await currentEvent("Último compartido", 1, true)
  const raceResults = await Promise.all([reception("/api/recepcion/presencial", post(input(race, "Presencial último"))), f1.request("/api/familias/inscripciones", post(input(race, "Web último", { nombreApoderado: "Apoderado ficticio" })))])
  assert.deepEqual(raceResults.map(r => r.status).sort(), [201, 409])
  assert.equal((await db.query('SELECT inscritos,"ultimoNumero" FROM "Evento" WHERE id=$1', [race.id])).rows[0].ultimoNumero, 1)
  const dayWeb = await currentEvent("Web el mismo día", 2, true)
  const online = await f1.request("/api/familias/inscripciones", post(input(dayWeb, "Registro del día web", { nombreApoderado: "Apoderado ficticio", origen: "PREVIA" })))
  assert.equal(online.status, 201)
  const onlineId = (await online.json()).inscripcion.id
  assert.equal((await db.query('SELECT origen FROM "Inscripcion" WHERE id=$1', [onlineId])).rows[0].origen, "PRESENCIAL")

  const concurrent = await currentEvent("Duplicado simultáneo", 3)
  const same = input(concurrent, "Bebé simultáneo")
  const simultaneous = await Promise.all([reception("/api/recepcion/presencial", post(same)), otherReception("/api/recepcion/presencial", post({ ...paperConsent, ...same, id: randomUUID() }))])
  assert.deepEqual(simultaneous.map(r => r.status).sort(), [200, 201])
  assert.equal((await db.query('SELECT count(*)::int n FROM "EntradaFila" WHERE "eventoId"=$1', [concurrent.id])).rows[0].n, 1)
  assert.equal((await reception("/api/recepcion/presencial", post(input(concurrent, "RUT histórico", { rutBebe: "11111111-1" })))).status, 409)
  for (const change of [{ correo: "inválido" }, { nombreApoderado: "" }, { bebeId: "legacy-baby" }, { fechaNacimiento: "2099-01-01" }]) assert.equal((await reception("/api/recepcion/presencial", post(input(concurrent, "Inválido", change)))).status, 400)
  console.log("OK prioridad y cupos: espera de 30 minutos, mayor espera de ambos grupos, reservas previas protegidas, último cupo compartido y web del día sin prioridad previa.")

  const rollback = await currentEvent("Rollback presencial", 3), rollbackInput = input(rollback, "Registro recuperable", { correo: "onsite@example.com" })
  const beforePatients = (await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n
  await db.exec(`CREATE FUNCTION onsite_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$;
    CREATE TRIGGER onsite_fail_trigger BEFORE INSERT ON "EntradaFila" FOR EACH ROW EXECUTE FUNCTION onsite_fail();`)
  assert.equal((await reception("/api/recepcion/presencial", post(rollbackInput))).status, 503)
  assert.equal((await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n, beforePatients)
  assert.deepEqual((await db.query('SELECT inscritos,"ultimoNumero","ultimoOrdenFila" FROM "Evento" WHERE id=$1', [rollback.id])).rows[0], { inscritos: 0, ultimoNumero: 0, ultimoOrdenFila: 0 })
  await db.exec('DROP TRIGGER onsite_fail_trigger ON "EntradaFila"; DROP FUNCTION onsite_fail();')
  setMailFailure(true)
  const pending = await onsite(rollbackInput)
  assert.equal(pending.inscripcion.numero, 1); assert.equal(pending.inscripcion.llegada.orden, 1); assert.equal(pending.correo, "FALLIDO")
  setMailFailure(false)
  await db.query('UPDATE "CorreoInscripcion" SET "disponibleAt"=$1 WHERE "inscripcionId"=$2', [new Date(Date.now() - 1000), pending.inscripcion.id])
  const retryMail = await reception("/api/recepcion/correo", post({ eventoId: rollback.id, inscripcionId: pending.inscripcion.id }))
  assert.equal((await retryMail.json()).correo, "ENVIADO")
  assert(mails.some(mail => [].concat(mail.to).includes("onsite@example.com") && !mail.html.includes("Consultar mi comprobante en Casku")))
  assert.equal((await queue(rollback)).total, 1)
  console.log("OK atomicidad presencial: error sin paciente/cupo parcial, reintento con mismo número y correo recuperable sin perder la fila.")
}
