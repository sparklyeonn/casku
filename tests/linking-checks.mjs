import { familyConsent, paperConsent } from "./privacy-fixtures.mjs"
import assert from "node:assert/strict"
import { randomUUID, randomBytes } from "node:crypto"

export async function linkingChecks({ db, client, signIn, password, accounts, admin, anonymous, f1, f2, family, post, createEvent, mails }) {
  const reception = client(), otherReception = client(), kine = client()
  for (const [request, account] of [[reception, accounts[0]], [otherReception, accounts[1]], [kine, accounts[2]]]) await signIn(request, "equipo", { email: account.email, password })
  const owner = await family("link-owner@example.com"), ownerId = owner.user.id.replace(/^familia:/, "")
  const event = await createEvent(admin, "Vinculación presencial ficticia", 12, false)
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const part = key => parts.find(p => p.type === key).value
  await db.query('UPDATE "Evento" SET fecha=$1::date WHERE id=$2', [`${part("year")}-${part("month")}-${part("day")}`, event.id])
  async function onsite(name, guardian = "Familia presencial ficticia") {
    const response = await reception("/api/recepcion/presencial", post({ ...paperConsent, id: randomUUID(), eventoId: event.id, nombreBebe: name, fechaNacimiento: "2026-01-01", nombreApoderado: guardian, correo: "", telefono: "" }))
    assert.equal(response.status, 201); return (await response.json()).inscripcion
  }
  const source = await onsite("Bebé para vincular"), sourceId = source.id
  const issuance = (row = source, correo = owner.user.email) => ({ id: randomUUID(), eventoId: event.id, inscripcionId: row.id, correo })
  const endpoint = "/api/recepcion/vinculaciones", claim = "/api/familias/vinculaciones"
  const query = row => `${endpoint}?eventoId=${event.id}&inscripcionId=${row.id}`
  async function issue(input, request = reception) { const response = await request(endpoint, post(input)); assert.equal(response.status, 200); return response.json() }
  const owners = async id => (await db.query('SELECT i."apoderadoId",i."pacienteId",p."apoderadoId" AS owner FROM "Inscripcion" i JOIN "Paciente" p ON p.id=i."pacienteId" WHERE i.id=$1', [id])).rows[0]
  const beforeOwner = await owners(sourceId), patientId = beforeOwner.pacienteId
  await db.query('UPDATE "Inscripcion" SET "contactoCorreo"=$1 WHERE id=$2', [owner.user.email, sourceId])
  assert.equal(beforeOwner.owner, null); assert.equal(beforeOwner.apoderadoId, null)
  assert(!(await (await owner.request("/api/familias/inscripciones")).json()).inscripciones.some(row => row.id === sourceId))
  // Una evaluación existente no requiere una nueva ficha después de vincular.
  const active = (await (await kine("/api/kinesiologia/atencion")).json()).atencion
  if (active) await kine("/api/kinesiologia/devolver", post({ atencionId: active.id, reservaId: active.reservaId }))
  const called = await kine("/api/kinesiologia/llamar", post({ id: randomUUID(), eventoId: event.id })); assert.equal(called.status, 200)
  const attention = (await called.json()).atencion
  const saved = await kine("/api/evaluaciones", post({ atencionId: attention.id, reservaId: attention.reservaId, ap: 140, bp: 120, di: 135, dd: 138 })); assert.equal(saved.status, 201)
  const evaluationId = (await saved.json()).evaluacionId, detail = `/api/kinesiologia/resultados/${evaluationId}`
  assert.equal((await (await kine(detail)).json()).resultado.publicable, false)
  const beforeQueue = (await db.query('SELECT * FROM "EntradaFila" WHERE "inscripcionId"=$1', [sourceId])).rows
  const beforeReceipt = (await db.query('SELECT numero,origen,"qrToken","pacienteId" FROM "Inscripcion" WHERE id=$1', [sourceId])).rows
  const beforeCount = (await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n
  for (const [request, status] of [[anonymous, 401], [f1.request, 401], [admin, 403], [kine, 403]]) {
    assert.equal((await request(query(source))).status, status)
    assert.equal((await request(endpoint, post(issuance()))).status, status)
  }
  const input = issuance(), beforeMails = mails.length, invite = await issue(input)
  assert.equal(invite.codigo.length, 22); assert(invite.qr.startsWith("data:image/png;base64,"))
  assert.equal((await issue(input)).codigo, invite.codigo)
  assert.equal((await otherReception(endpoint, post(input))).status, 409)
  const stored = (await db.query('SELECT * FROM "VinculacionPresencial" WHERE id=$1', [input.id])).rows[0]
  assert.notEqual(stored.codigoHash, invite.codigo); assert(!JSON.stringify(stored).includes(invite.codigo))
  const status = await reception(query(source)); assert(status.headers.get("cache-control").includes("no-store"))
  assert(!JSON.stringify(await status.json()).match(/codigoHash|"codigo"|"qr"|diagnostico/))
  assert.equal((await reception(`${endpoint}?eventoId=${randomUUID()}&inscripcionId=${sourceId}`)).status, 404)
  for (const request of [anonymous, reception, admin, kine]) assert.equal((await request(claim, post({ ...familyConsent, codigo: invite.codigo }))).status, 401)
  const denied = await f2.request(`${claim}/consultar`, post({ ...familyConsent, codigo: invite.codigo })); assert.equal(denied.status, 404); assert(!(await denied.text()).includes(source.bebe?.nombre || "Bebé para vincular"))
  assert.equal((await owner.request(`${claim}/consultar`, post({ ...familyConsent, codigo: `CASKU:INSCRIPCION:${invite.codigo}` }))).status, 400)
  const preview = await owner.request(`${claim}/consultar`, post({ ...familyConsent, codigo: `CASKU:VINCULACION:${invite.codigo}` })); assert.equal(preview.status, 200)
  assert.equal((await preview.json()).vinculada, false); assert.deepEqual(await owners(sourceId), beforeOwner)
  const accepted = await Promise.all([owner.request(claim, post({ ...familyConsent, codigo: invite.codigo, apoderadoId: f2.user.id, pacienteId: "falso" })), owner.request(claim, post({ ...familyConsent, codigo: invite.codigo }))])
  assert.deepEqual(accepted.map(response => response.status), [200, 200])
  assert.deepEqual(await owners(sourceId), { pacienteId: patientId, apoderadoId: ownerId, owner: ownerId })
  assert.deepEqual((await db.query('SELECT * FROM "EntradaFila" WHERE "inscripcionId"=$1', [sourceId])).rows, beforeQueue)
  assert.deepEqual((await db.query('SELECT numero,origen,"qrToken","pacienteId" FROM "Inscripcion" WHERE id=$1', [sourceId])).rows, beforeReceipt)
  assert.equal((await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n, beforeCount)
  assert.equal(mails.length, beforeMails, "Vincular no publica ni envía resultados automáticamente")
  assert((await (await owner.request("/api/familias/inscripciones")).json()).inscripciones.some(row => row.id === sourceId))
  assert.equal((await owner.request(`/api/familias/inscripciones/${sourceId}/qr`)).status, 200)
  const verifiedEnvelope = (await db.query('SELECT "datosFamilia","revisionContenido",estado FROM "CorreoInscripcion" WHERE "inscripcionId"=$1', [sourceId])).rows[0]
  assert.equal(verifiedEnvelope.datosFamilia.correo, owner.user.email); assert.equal(verifiedEnvelope.datosFamilia.conCuenta, true)
  assert.equal(verifiedEnvelope.estado, "PENDIENTE")
  assert.equal((await (await kine(detail)).json()).resultado.publicable, true)
  const published = await kine(`${detail}/publicar`, post({ revision: 1 })); assert.equal(published.status, 201)
  const publication = (await published.json()).resultado.publicacion
  assert.equal((await owner.request(`/api/familias/resultados/${publication.id}`)).status, 200)
  assert.equal((await f2.request(`/api/familias/resultados/${publication.id}`)).status, 404)
  assert([].concat(mails.at(-1).to).includes(owner.user.email)); assert.equal(mails.length, beforeMails + 1)
  assert.equal((await reception(`${endpoint}/${input.id}/revocar`, post(input))).status, 409)
  assert.equal((await reception(endpoint, post(issuance()))).status, 409)
  await db.query('UPDATE "VinculacionPresencial" SET "expiraAt"=$1 WHERE id=$2', [new Date(Date.now() - 1000), input.id])
  assert.equal((await owner.request(claim, post({ ...familyConsent, codigo: invite.codigo }))).status, 200, "Reintentar una aceptación no crea otra ficha")
  console.log("OK vinculación: cuenta verificada y código independiente, permisos, aceptación simultánea, mismos IDs/fila/QR y publicación de evaluación previa a la cuenta correcta.")

  const safety = await family("link-safety@example.com"), row = await onsite("Bebé códigos reemplazados")
  const first = await issue(issuance(row, safety.user.email)), secondInput = issuance(row, safety.user.email), second = await issue(secondInput)
  assert.equal((await safety.request(claim, post({ ...familyConsent, codigo: first.codigo }))).status, 404)
  assert.equal((await reception(`${endpoint}/${secondInput.id}/revocar`, post(secondInput))).status, 200)
  assert.equal((await safety.request(claim, post({ ...familyConsent, codigo: second.codigo }))).status, 404)
  const expiredInput = issuance(row, safety.user.email), expired = await issue(expiredInput)
  await db.query('UPDATE "VinculacionPresencial" SET "expiraAt"=$1 WHERE id=$2', [new Date(Date.now() - 1000), expiredInput.id])
  assert.equal((await safety.request(claim, post({ ...familyConsent, codigo: expired.codigo }))).status, 404)
  const recoveryInput = issuance(row, safety.user.email), recovery = await issue(recoveryInput)
  await db.exec(`CREATE FUNCTION linking_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."consumidaAt" IS NOT NULL THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END $$; CREATE TRIGGER linking_fail_trigger BEFORE UPDATE ON "VinculacionPresencial" FOR EACH ROW EXECUTE FUNCTION linking_fail();`)
  assert.equal((await safety.request(claim, post({ ...familyConsent, codigo: recovery.codigo }))).status, 503)
  assert.equal((await owners(row.id)).owner, null); assert.equal((await owners(row.id)).apoderadoId, null)
  assert.equal((await db.query('SELECT "consumidaAt" FROM "VinculacionPresencial" WHERE id=$1', [recoveryInput.id])).rows[0].consumidaAt, null)
  await db.exec('DROP TRIGGER linking_fail_trigger ON "VinculacionPresencial"; DROP FUNCTION linking_fail();')
  assert.equal((await safety.request(claim, post({ ...familyConsent, codigo: recovery.codigo }))).status, 200)
  const duplicate = await onsite("Bebé para vincular", "Otro apoderado ficticio"), collision = await issue(issuance(duplicate))
  assert.equal((await owner.request(claim, post({ ...familyConsent, codigo: collision.codigo }))).status, 409)
  assert.equal((await owners(duplicate.id)).owner, null)
  const limited = await family("link-limited@example.com")
  for (let i = 0; i < 10; i++) assert.equal((await limited.request(`${claim}/consultar`, post({ ...familyConsent, codigo: randomBytes(16).toString("base64url") }))).status, 404)
  assert.equal((await limited.request(`${claim}/consultar`, post({ ...familyConsent, codigo: randomBytes(16).toString("base64url") }))).status, 429)
  assert.equal((await owner.request("/familias")).status, 200)
  console.log("OK códigos: reemplazo, revocación y vencimiento, rechazo de ficha duplicada, límite de intentos y reversión completa ante fallo de escritura.")
}
