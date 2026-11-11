import { paperConsent } from "./privacy-fixtures.mjs"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

export async function kinesiologyChecks({ db, client, signIn, password, accounts, admin, anonymous, f1, a, b, first, second, post, mails }) {
  const kine = client(), other = client(), reception = client()
  for (const [request, account] of [[kine, accounts[2]], [other, accounts[3]], [reception, accounts[0]]]) assert.equal((await signIn(request, "equipo", { email: account.email, password })).role, account.role)
  const requestCall = (event = a) => ({ id: randomUUID(), eventoId: event.id })
  for (const [request, expected] of [[anonymous, 401], [f1.request, 401], [reception, 403], [admin, 403]]) {
    for (const [path, options] of [["/api/kinesiologia/eventos"], ["/api/kinesiologia/eventos", post({ eventoId: a.id })], ["/api/kinesiologia/atencion"], ["/api/kinesiologia/llamar", post(requestCall())], ["/api/kinesiologia/devolver", post({ atencionId: randomUUID(), reservaId: randomUUID() })]]) assert.equal((await request(path, options)).status, expected)
  }
  await kine("/api/kinesiologia/eventos", post({ eventoId: a.id }))
  await other("/api/kinesiologia/eventos", post({ eventoId: b.id }))
  assert.equal((await (await kine("/api/kinesiologia/eventos")).json()).seleccionadoId, a.id)
  assert.equal((await (await other("/api/kinesiologia/eventos")).json()).seleccionadoId, b.id)
  const firstCall = requestCall(), secondCall = requestCall()
  const [r1, r2] = await Promise.all([kine("/api/kinesiologia/llamar", post(firstCall)), other("/api/kinesiologia/llamar", post(secondCall))])
  assert.equal(r1.status, 200); assert.equal(r2.status, 200)
  const t1 = (await r1.json()).atencion, t2 = (await r2.json()).atencion
  assert.notEqual(t1.id, t2.id)
  assert.deepEqual([t1.numero, t2.numero].sort(), [1, 2])
  assert.equal(t1.bebe.rut, "", "El bebé sin RUT puede ser atendido")
  const arrival = (await db.query('SELECT "inscripcionId" FROM "EntradaFila" WHERE id=$1', [t1.id])).rows[0].inscripcionId
  assert.equal(t1.numero, arrival === second.inscripcion.id ? 2 : 1)
  assert.equal((await (await kine("/api/kinesiologia/llamar", post(firstCall))).json()).atencion.id, t1.id)
  assert.equal((await (await kine("/api/kinesiologia/llamar", post(requestCall(b)))).json()).atencion.id, t1.id, "Una activa por profesional entre eventos")
  assert.equal((await (await kine(`/api/kinesiologia/atencion?eventoId=${a.id}`)).json()).esperando, 0)
  const ownPage = await kine(`/evaluacion?atencion=${t1.id}&reserva=${t1.reservaId}`)
  assert.equal(ownPage.status, 200)
  const html = await ownPage.text()
  assert(html.includes(t1.bebe.nombre)); assert(html.includes(t1.correo)); assert(html.includes('readOnly=""'))
  const forbiddenPage = await other(`/evaluacion?atencion=${t1.id}&reserva=${t1.reservaId}`)
  const hidden = await forbiddenPage.text()
  assert(hidden.includes("Atención no disponible")); assert(!hidden.includes(`value="${t1.bebe.nombre}"`))
  const measures = { ap: 140, bp: 120, di: 135, dd: 138 }
  assert.equal((await other("/api/evaluaciones", post({ atencionId: t1.id, reservaId: t1.reservaId, ...measures }))).status, 404)
  assert.equal((await kine("/api/evaluaciones", post({ atencionId: t1.id, reservaId: randomUUID(), ...measures }))).status, 404)
  assert.equal((await kine("/api/evaluaciones", post({ atencionId: t1.id, reservaId: t1.reservaId, ...measures, ap: 0 }))).status, 400)

  // Devolver conserva la llegada y vuelve obsoleto el formulario anterior al reclamar nuevamente.
  const oldArrival = (await db.query('SELECT "llegadaAt",orden FROM "EntradaFila" WHERE id=$1', [t1.id])).rows[0]
  assert.equal((await kine("/api/kinesiologia/devolver", post({ atencionId: t1.id, reservaId: t1.reservaId }))).status, 200)
  assert.equal((await kine("/api/evaluaciones", post({ atencionId: t1.id, reservaId: t1.reservaId, ...measures }))).status, 409)
  const stale = await (await kine("/api/kinesiologia/llamar", post(firstCall))).json()
  assert.equal(stale.resultado, "TERMINADA"); assert.equal(stale.atencion, null)
  const thirdCall = requestCall()
  const reclaimed = (await (await kine("/api/kinesiologia/llamar", post(thirdCall))).json()).atencion
  assert.equal(reclaimed.id, t1.id); assert.notEqual(reclaimed.reservaId, t1.reservaId)
  assert.deepEqual((await db.query('SELECT "llegadaAt",orden FROM "EntradaFila" WHERE id=$1', [t1.id])).rows[0], oldArrival)
  assert.equal((await kine("/api/kinesiologia/devolver", post({ atencionId: t1.id, reservaId: t1.reservaId }))).status, 404)
  assert.equal((await kine("/api/evaluaciones", post({ atencionId: t1.id, reservaId: t1.reservaId, ...measures }))).status, 404)

  // Fallo de guardado: no se finaliza ni se crea una evaluación parcial.
  await db.exec(`CREATE FUNCTION evaluation_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$;
    CREATE TRIGGER evaluation_fail_trigger BEFORE INSERT ON "Evaluacion" FOR EACH ROW EXECUTE FUNCTION evaluation_fail();`)
  assert.equal((await kine("/api/evaluaciones", post({ atencionId: reclaimed.id, reservaId: reclaimed.reservaId, ...measures }))).status, 503)
  assert.equal((await db.query('SELECT estado FROM "EntradaFila" WHERE id=$1', [reclaimed.id])).rows[0].estado, "EN_ATENCION")
  await db.exec('DROP TRIGGER evaluation_fail_trigger ON "Evaluacion"; DROP FUNCTION evaluation_fail();')
  const beforePatients = (await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n, beforeMails = mails.length
  const payload = { atencionId: reclaimed.id, reservaId: reclaimed.reservaId, ...measures, nombre: "Intruso", pacienteId: "legacy-baby", correo: "intruso@example.com", kine: "Otra profesional", diagnostico: "inventado" }
  const savedResponses = await Promise.all([kine("/api/evaluaciones", post(payload)), kine("/api/evaluaciones", post(payload))])
  assert.deepEqual(savedResponses.map(r => r.status).sort(), [200, 201])
  const saved = await Promise.all(savedResponses.map(r => r.json()))
  assert.equal(saved[0].evaluacionId, saved[1].evaluacionId)
  const evaluation = (await db.query('SELECT * FROM "Evaluacion" WHERE id=$1', [saved[0].evaluacionId])).rows[0]
  const registration = (await db.query('SELECT "pacienteId" FROM "Inscripcion" WHERE id=$1', [arrival])).rows[0]
  assert.equal(evaluation.pacienteId, registration.pacienteId); assert.equal(evaluation.correoPadre, t1.correo); assert.equal(evaluation.kinesiologa, accounts[2].name)
  assert.equal(evaluation.indiceCraneal, 120 / 140 * 100); assert.notEqual(evaluation.diagnostico, "inventado")
  assert.equal((await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n, beforePatients)
  assert.equal(mails.length, beforeMails, "Guardar no publica ni envía resultados")
  assert.equal((await db.query('SELECT estado FROM "EntradaFila" WHERE id=$1', [t1.id])).rows[0].estado, "ATENDIDO")
  assert.equal((await kine("/api/evaluaciones", post({ ...payload, ap: 141 }))).status, 409)
  assert.equal((await (await kine("/api/kinesiologia/llamar", post(thirdCall))).json()).resultado, "TERMINADA", "Reintento tras guardar no llama otro bebé")
  const emptyCall = requestCall()
  assert.equal((await (await kine("/api/kinesiologia/llamar", post(emptyCall))).json()).resultado, "VACIA")
  const arrivalB = (await (await kine("/api/kinesiologia/llamar", post(requestCall(b)))).json()).atencion
  assert(arrivalB); assert.equal(arrivalB.eventoId, b.id)
  assert.equal((await (await kine("/api/kinesiologia/llamar", post(emptyCall))).json()).resultado, "VACIA")
  assert.equal((await (await kine("/api/kinesiologia/atencion")).json()).atencion.id, arrivalB.id)
  await kine("/api/kinesiologia/devolver", post({ atencionId: arrivalB.id, reservaId: arrivalB.reservaId }))
  await other("/api/kinesiologia/devolver", post({ atencionId: t2.id, reservaId: t2.reservaId }))
  const simultaneous = await Promise.all([a, b].map(event => kine("/api/kinesiologia/llamar", post(requestCall(event)))))
  const both = await Promise.all(simultaneous.map(r => r.json()))
  assert(both.every(row => row.atencion)); assert.equal(both[0].atencion.id, both[1].atencion.id)
  assert.equal((await db.query('SELECT count(*)::int n FROM "EntradaFila" WHERE "profesionalId"=$1 AND estado=\'EN_ATENCION\'', [accounts[2].id])).rows[0].n, 1)
  const activeEntry = both[0].atencion
  const otherEntry = activeEntry.eventoId === a.id ? arrivalB.id : t2.id
  await assert.rejects(db.query('UPDATE "EntradaFila" SET "profesionalId"=$1,estado=\'EN_ATENCION\' WHERE id=$2', [accounts[2].id, otherEntry]), "El índice impide dos activas en eventos distintos")
  await db.query('UPDATE "Paciente" SET rut=$1 WHERE id=$2', ["12345678-5", first.bebe.id])
  const bypass = await kine("/api/evaluaciones", post({ ...paperConsent, ...measures, nombre: first.bebe.nombre, rut: "12345678-5", fnac: "2026-01-01", correo: "intruso@example.com" }))
  assert.equal(bypass.status, 409, "El formulario sin inscripción no elude la reserva del bebé vinculado")
  const page = await kine("/kinesiologia"); assert.equal(page.status, 200); assert((await page.text()).includes("Mi atención"))
  console.log("OK kinesiología: reserva exclusiva, datos precargados, bebés sin RUT, devolución segura, guardado atómico e idempotente y sin correo clínico.")
}
