import { familyConsent, paperConsent } from "./privacy-fixtures.mjs"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
export async function dataCorrectionsChecks({ db, client, signIn, password, accounts, admin, anonymous, family, post, createEvent, mails }) {
  const parent = await family("corrections@example.com"), reception = client(), kine = client()
  for (const [request, account] of [[reception, accounts[0]], [kine, accounts[2]]]) await signIn(request, "equipo", { email: account.email, password })
  const event = await createEvent(admin, "Corrección ficticia", 6)
  async function register(name) {
    const response = await parent.request("/api/familias/inscripciones", post({ ...familyConsent, id: randomUUID(), eventoId: event.id, nombreBebe: name, fechaNacimiento: "2026-01-01", nombreApoderado: "Apoderado de corrección" }))
    assert.equal(response.status, 201); return (await response.json()).inscripcion
  }
  const first = await register("Bebé de corrección"), second = await register("Segundo bebé")
  const root = "/api/datos-familias", detail = `${root}/inscripciones/${first.id}`, reason = "Dato confirmado presencialmente con la familia"
  const fetchDetail = async (id = first.id, eventoId = event.id) => (await (await reception(`${root}/inscripciones/${id}?eventoId=${eventoId}`)).json())
  const patch = (seccion, revision, datos, request = reception, extra = {}) => request(detail, { ...post({ eventoId: event.id, seccion, revision, motivo: reason, datos, actorId: "falso", apoderadoId: "falso", ...extra }), method: "PATCH" })
  let row = await fetchDetail()
  for (const [request, status] of [[anonymous, 401], [parent.request, 401], [kine, 403]]) {
    assert.equal((await request(`${root}/eventos`)).status, status)
    assert.equal((await request(`${detail}?eventoId=${event.id}`)).status, status)
    assert.equal((await request(`${root}/buscar`, post({ eventoId: event.id, consulta: String(first.numero) }))).status, status)
    assert.equal((await patch("BEBE", row.ficha.bebe.revision, row.ficha.bebe, request)).status, status)
  }
  const lookup = await admin(`${root}/buscar`, post({ eventoId: event.id, consulta: String(first.numero) }))
  assert.equal(lookup.status, 200); assert(lookup.headers.get("cache-control").includes("no-store"))
  assert(!JSON.stringify(await lookup.json()).match(/diagnostico|evaluaciones|medidas|recomendacion|qrToken|passwordHash/))
  assert.equal((await reception(`${detail}?eventoId=${randomUUID()}`)).status, 404)
  assert.equal((await reception(`${detail}?eventoId=${event.id}&pagina=0`)).status, 400)
  for (const extra of [{ datos: { ...row.ficha.bebe, fechaNacimiento: "2099-01-01" } }, { datos: { ...row.ficha.bebe, rut: "12345678-9" } }, { motivo: "corto" }, { revision: 0 }]) assert.equal((await patch("BEBE", row.ficha.bebe.revision, row.ficha.bebe, reception, extra)).status, 400)
  assert.equal((await patch("APODERADO", row.ficha.apoderado.revision, { nombre: "Otro", telefono: "", rut: "", correo: "otro@example.com" })).status, 400)
  const ownerId = (await db.query('SELECT "apoderadoId" FROM "Paciente" WHERE id=$1', [first.bebe.id])).rows[0].apoderadoId
  const originalInscription = (await db.query('SELECT to_jsonb(i)-\'revisionContacto\' AS row FROM "Inscripcion" i WHERE id=$1', [first.id])).rows[0].row
  assert.equal((await reception("/api/recepcion/llegadas", post({ eventoId: event.id, inscripcionId: first.id }))).status, 201)
  const active = (await (await kine("/api/kinesiologia/atencion")).json()).atencion
  if (active) await kine("/api/kinesiologia/devolver", post({ atencionId: active.id, reservaId: active.reservaId }))
  const attention = (await (await kine("/api/kinesiologia/llamar", post({ id: randomUUID(), eventoId: event.id }))).json()).atencion
  assert.equal((await patch("BEBE", row.ficha.bebe.revision, { ...row.ficha.bebe, nombre: "Cambio durante atención" })).status, 409)
  const saved = await kine("/api/evaluaciones", post({ atencionId: attention.id, reservaId: attention.reservaId, ap: 140, bp: 120, di: 135, dd: 138 })); assert.equal(saved.status, 201)
  const evaluationId = (await saved.json()).evaluacionId
  const published = await kine(`/api/kinesiologia/resultados/${evaluationId}/publicar`, post({ revision: 1 })); assert.equal(published.status, 201)
  const publicationId = (await published.json()).resultado.publicacion.id
  const beforeClinical = (await db.query('SELECT to_jsonb(e) AS row FROM "Evaluacion" e WHERE id=$1 UNION ALL SELECT to_jsonb(p) FROM "ResultadoPublicado" p WHERE "evaluacionId"=$1', [evaluationId])).rows
  const beforeQueue = (await db.query('SELECT * FROM "EntradaFila" WHERE "inscripcionId"=$1', [first.id])).rows
  const countPatients = (await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n, mailCount = mails.length
  const corrected = { nombre: "Bebé corregido <script>", fechaNacimiento: "2026-01-02", rut: "" }, version = row.ficha.bebe.revision
  let response = await patch("BEBE", version, corrected, admin); assert.equal(response.status, 200); row = await response.json()
  assert.equal(row.ficha.bebe.id, first.bebe.id); assert.equal(row.ficha.bebe.nombre, corrected.nombre)
  assert.equal((await patch("BEBE", version, corrected)).status, 200, "Reintento sin nuevo cambio")
  assert.equal((await patch("BEBE", version, { ...corrected, nombre: "Edición antigua" })).status, 409)
  assert.equal((await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n, countPatients)
  assert.deepEqual((await db.query('SELECT to_jsonb(i)-\'revisionContacto\' AS row FROM "Inscripcion" i WHERE id=$1', [first.id])).rows[0].row, originalInscription)
  assert.deepEqual((await db.query('SELECT * FROM "EntradaFila" WHERE "inscripcionId"=$1', [first.id])).rows, beforeQueue)
  assert.deepEqual((await db.query('SELECT to_jsonb(e) AS row FROM "Evaluacion" e WHERE id=$1 UNION ALL SELECT to_jsonb(p) FROM "ResultadoPublicado" p WHERE "evaluacionId"=$1', [evaluationId])).rows, beforeClinical)
  assert.equal(mails.length, mailCount)
  assert.equal((await parent.request(`/api/familias/resultados/${publicationId}`)).status, 200)
  const history = row.historial.cambios.find(change => change.entidad === "BEBE")
  assert(history); assert.notEqual(history.actorId, "falso"); assert.equal(history.motivo, reason); assert.equal(history.anterior.nombre, "Bebé de corrección")
  const secondData = await fetchDetail(second.id)
  assert.equal((await patch("BEBE", row.ficha.bebe.revision, secondData.ficha.bebe)).status, 409)
  const legacyRutId = randomUUID()
  await db.query('INSERT INTO "Paciente" (id,nombre,"fechaNacimiento",rut) VALUES ($1,\'Ficha con RUT existente\',\'2026-01-01\',\'12.345.678-5\')', [legacyRutId])
  assert.equal((await patch("BEBE", row.ficha.bebe.revision, { ...corrected, rut: "12345678-5" })).status, 409)
  // El perfil es compartido por ambos bebés, sin cambiar correo ni propietario.
  response = await patch("APODERADO", row.ficha.apoderado.revision, { nombre: "Apoderado corregido", telefono: "+56 9 1234 5678", rut: "" }); assert.equal(response.status, 200); row = await response.json()
  assert.equal((await fetchDetail(second.id)).ficha.apoderado.nombre, "Apoderado corregido")
  assert.equal((await db.query('SELECT correo FROM "Apoderado" WHERE id=$1', [ownerId])).rows[0].correo, parent.user.email)
  const future = await createEvent(admin, "Misma ficha corregida", 2)
  const stale = { ...familyConsent, id: randomUUID(), eventoId: future.id, nombreBebe: "Bebé de corrección", fechaNacimiento: "2026-01-01", nombreApoderado: "Apoderado de corrección" }
  assert.equal((await parent.request("/api/familias/inscripciones", post(stale))).status, 409)
  const currentProfile = (await (await parent.request("/api/familias/inscripciones")).json()).perfil
  response = await parent.request("/api/familias/inscripciones", post({ ...familyConsent, id: randomUUID(), eventoId: future.id, bebeId: first.bebe.id, nombreApoderado: currentProfile.nombre, telefono: currentProfile.telefono, rutApoderado: currentProfile.rut, revisionApoderado: currentProfile.revisionDatos }))
  assert.equal(response.status, 201); assert.equal((await response.json()).inscripcion.bebe.id, first.bebe.id)
  // La confirmación preparada mantiene su cuerpo aunque se corrija el nombre del bebé.
  await db.query('UPDATE "CorreoInscripcion" SET estado=\'FALLIDO\',"disponibleAt"=$1 WHERE "inscripcionId"=$2', [new Date(Date.now() - 1000), first.id])
  const beforeRetry = mails.length
  assert.equal((await (await parent.request(`/api/familias/inscripciones/${first.id}/correo`, post({}))).json()).estado, "ENVIADO")
  assert.equal(mails.length, beforeRetry)
  console.log("OK datos: permisos, misma ficha/propietario/número/QR/fila, resultados inmutables, perfil compartido, auditoría, duplicados y formularios familiares antiguos bloqueados.")

  const day = await createEvent(admin, "Corrección presencial", 3, false)
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const part = key => parts.find(p => p.type === key).value
  await db.query('UPDATE "Evento" SET fecha=$1::date WHERE id=$2', [`${part("year")}-${part("month")}-${part("day")}`, day.id])
  response = await reception("/api/recepcion/presencial", post({ ...paperConsent, id: randomUUID(), eventoId: day.id, nombreBebe: "Bebé presencial corregible", fechaNacimiento: "2026-01-01", nombreApoderado: "Contacto presencial", correo: "contacto-anterior@example.com" })); assert.equal(response.status, 201)
  const onsite = (await response.json()).inscripcion, onsiteDetail = `${root}/inscripciones/${onsite.id}`
  let onsiteRow = await fetchDetail(onsite.id, day.id)
  const invitation = await reception("/api/recepcion/vinculaciones", post({ id: randomUUID(), eventoId: day.id, inscripcionId: onsite.id, correo: parent.user.email })); assert.equal(invitation.status, 200)
  const code = (await invitation.json()).codigo
  const patchContact = (revision, correo) => reception(onsiteDetail, { ...post({ eventoId: day.id, seccion: "CONTACTO", revision, motivo: reason, datos: { nombre: "Contacto corregido", telefono: "+56 9 1111 2222", correo } }), method: "PATCH" })
  const beforeContactMail = mails.length
  response = await patchContact(onsiteRow.ficha.apoderado.revision, "contacto-corregido@example.com"); assert.equal(response.status, 200); onsiteRow = await response.json()
  assert.equal(mails.length, beforeContactMail); assert.equal((await db.query('SELECT "apoderadoId" FROM "Inscripcion" WHERE id=$1', [onsite.id])).rows[0].apoderadoId, null)
  assert.equal((await parent.request("/api/familias/vinculaciones", post({ ...familyConsent, codigo: code }))).status, 404)
  response = await reception("/api/recepcion/correo", post({ eventoId: day.id, inscripcionId: onsite.id })); assert.equal(response.status, 200); assert.equal((await response.json()).correo, "ENVIADO")
  assert.equal(mails.length, beforeContactMail + 1); assert([].concat(mails.at(-1).to).includes("contacto-corregido@example.com"))
  await db.query('UPDATE "CorreoInscripcion" SET estado=\'ENVIANDO\' WHERE "inscripcionId"=$1', [onsite.id])
  assert.equal((await patchContact(onsiteRow.ficha.apoderado.revision, "otro@example.com")).status, 409)
  await db.query('UPDATE "CorreoInscripcion" SET estado=\'ENVIADO\' WHERE "inscripcionId"=$1', [onsite.id])
  // Dos operadores no pueden pisarse; la auditoría fallida revierte también versiones.
  row = await fetchDetail()
  const competing = await Promise.all([patch("BEBE", row.ficha.bebe.revision, { ...corrected, nombre: "Corrección simultánea A" }), patch("BEBE", row.ficha.bebe.revision, { ...corrected, nombre: "Corrección simultánea B" }, admin)])
  assert.deepEqual(competing.map(value => value.status).sort(), [200, 409])
  row = await fetchDetail()
  const oldFamilyRevision = (await db.query('SELECT "revisionDatos" FROM "Apoderado" WHERE id=$1', [ownerId])).rows[0].revisionDatos
  await db.exec(`CREATE FUNCTION data_edit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER data_edit_fail_trigger BEFORE INSERT ON "CambioDatos" FOR EACH ROW EXECUTE FUNCTION data_edit_fail();`)
  assert.equal((await patch("BEBE", row.ficha.bebe.revision, { ...corrected, nombre: "Cambio que falla" })).status, 503)
  assert.equal((await fetchDetail()).ficha.bebe.nombre, row.ficha.bebe.nombre)
  assert.equal((await db.query('SELECT "revisionDatos" FROM "Apoderado" WHERE id=$1', [ownerId])).rows[0].revisionDatos, oldFamilyRevision)
  await db.exec('DROP TRIGGER data_edit_fail_trigger ON "CambioDatos"; DROP FUNCTION data_edit_fail();')
  assert.equal((await reception("/datos-familias")).status, 200)
  assert.equal((await admin("/datos-familias")).status, 200)
  console.log("OK contactos y concurrencia: correo corregido con nueva versión sin envío automático, códigos anteriores revocados, bloqueo de envío en curso y rollback completo de datos/auditoría.")
}
