import assert from "node:assert/strict"
import { createHmac, randomInt, randomUUID } from "node:crypto"
import { paperConsent, familyConsent } from "./privacy-fixtures.mjs"
import { resultMeasurements } from "./results-input-fixtures.mjs"

// HTTP real del runner: clientes autenticados, DB efímera y proveedor local inyectados.
// No importa el servicio, Prisma, variables privadas ni transportes alternativos.
export async function resultContactChecks({ db, base, browsers = false, resetGlobalLogin, client, signIn, password, accounts, admin, anonymous, f1, f2, post, createEvent, mails, mailAttempts, authSecret, setResultFailure }) {
  const kine = client(), twin = client(), otherKine = client(), reception = client()
  const author = accounts[2]
  for (const [request, account] of [[kine, author], [twin, author], [otherKine, accounts[3]], [reception, accounts[0]]]) {
    assert.equal((await signIn(request, "equipo", { email: account.email, password })).role, account.role)
  }
  const endpoint = id => `/api/kinesiologia/resultados/${id}/contacto`
  async function json(request, path, options, status = 200) {
    const response = await request(path, options), body = await response.json()
    assert.equal(response.status, status, `${path}: ${JSON.stringify(body)}`)
    assert(response.headers.get("cache-control")?.includes("no-store"), "El contacto clínico no se cachea")
    return body
  }
  // Cada sección prueba su contrato sin agotar la ventana compartida del mismo actor.
  // Solo vence la clave de este escenario; no borra límites ni modifica la aplicación.
  async function resetPostWindow() {
    const key = createHmac("sha256", authSecret).update(`limit:result-contact:post:${author.id}`).digest("hex")
    await db.query(`UPDATE "LimiteSolicitud" SET "expiraAt"=CURRENT_TIMESTAMP-interval '1 second' WHERE clave=$1`, [key])
  }
  async function resetGetWindow() {
    const key = createHmac("sha256", authSecret).update(`limit:result-contact:get:${author.id}`).digest("hex")
    await db.query(`UPDATE "LimiteSolicitud" SET "expiraAt"=CURRENT_TIMESTAMP-interval '1 second' WHERE clave=$1`, [key])
  }
  async function fixture(label) {
    const token = randomUUID(), email = `contact-${token}@example.test`, guardian = `Apoderado ficticio ${label}`
    const response = await kine("/api/evaluaciones", post({ ...paperConsent, declaracion: { ...paperConsent.declaracion, declarante: guardian }, nombre: `Bebé contacto ${label} ${token}`, rut: `${randomInt(30000000, 99999999)}-1`, correo: email, fnac: "2026-01-01", ...resultMeasurements() }))
    assert.equal(response.status, 201, `Captura propia sin cuenta: ${await response.clone().text()}`)
    const { evaluacionId: id } = await response.json()
    const stored = (await db.query('SELECT e."autorId",e."pacienteId",e."autorizacionId",e."correoPadre",e."filaId",p."apoderadoId",a.datos,a."correoResultados",a.seguimiento,a."versionTexto" FROM "Evaluacion" e JOIN "Paciente" p ON p.id=e."pacienteId" JOIN "AutorizacionPrivacidad" a ON a.id=e."autorizacionId" WHERE e.id=$1', [id])).rows[0]
    assert.equal(stored.autorId, author.id); assert.equal(stored.apoderadoId, null); assert.equal(stored.filaId, null)
    assert.equal(stored.correoPadre, email); assert.equal(stored.datos, true)
    assert.equal(stored.correoResultados, false); assert.equal(stored.seguimiento, false)
    assert.equal(stored.versionTexto, paperConsent.privacidad.version)
    const privacy = (await db.query('SELECT * FROM "CambioPrivacidad" WHERE "autorizacionId"=$1 ORDER BY revision', [stored.autorizacionId])).rows
    assert.equal(privacy.length, 1); assert.equal(privacy[0].declarante, guardian)
    const review = (await json(kine, endpoint(id))).contacto
    assert.equal(review.habilitado, true, review.motivoBloqueo)
    assert.equal(review.destinatario, email); assert.equal(review.nombreApoderado, guardian)
    assert.equal(review.datos.medidas.protocolo, resultMeasurements().protocolo)
    assert.equal(review.datos.medidas.distanciaPOEtragusDer, 125)
    assert.equal(review.datos.medidas.distanciaPOEtragusIzq, 128)
    assert.deepEqual(review.envios, [])
    return { id, email, guardian, stored, privacy, review }
  }
  const payload = (review, extra = {}) => ({ id: randomUUID(), revision: review.revision, contexto: review.contexto, correoRepetido: review.destinatario, confirmarApoderado: true, autorizarCorreo: true, versionConsentimiento: review.versionConsentimiento, ...extra })
  const copies = async id => (await db.query('SELECT * FROM "ResultadoContacto" WHERE "evaluacionId"=$1 ORDER BY revision,"createdAt",id', [id])).rows
  const intents = async id => (await db.query('SELECT e.* FROM "EnvioTransaccional" e JOIN "ResultadoContacto" c ON c."claveEnvio"=e.clave WHERE c."evaluacionId"=$1 ORDER BY c.revision,c."createdAt",c.id', [id])).rows
  async function noFamilyPublication(id) {
    assert.equal((await db.query('SELECT count(*)::int n FROM "ResultadoPublicado" WHERE "evaluacionId"=$1', [id])).rows[0].n, 0)
    assert.equal((await db.query('SELECT count(*)::int n FROM "CorreoResultado" c JOIN "ResultadoPublicado" p ON p.id=c."publicacionId" WHERE p."evaluacionId"=$1', [id])).rows[0].n, 0)
    assert.equal((await db.query('SELECT count(*)::int n FROM "OrdenCorreo" o JOIN "ResultadoPublicado" p ON p.id=o."publicacionId" WHERE p."evaluacionId"=$1', [id])).rows[0].n, 0)
  }

  const ownersBefore = (await db.query('SELECT count(*)::int n FROM "Apoderado"')).rows[0].n
  const target = await fixture("principal"), path = endpoint(target.id), initial = payload(target.review)
  const beforeDenied = { mails: mails.length, attempts: mailAttempts.length }
  for (const [request, status] of [[anonymous, 401], [f1.request, 401], [f2.request, 401], [admin, 403], [reception, 403], [otherKine, 404]]) {
    await json(request, path, undefined, status)
    await json(request, path, post(initial), status)
  }
  await json(kine, endpoint(`contact-missing-${randomUUID()}`), undefined, 404)
  await json(kine, endpoint(`contact-missing-${randomUUID()}`), post(initial), 404)
  // La validación CSRF precede al cuerpo y a la reserva de intención.
  for (const origin of [undefined, "https://ajeno.example", "null"]) {
    const options = post(initial), headers = new Headers(options.headers)
    headers.delete("origin"); if (origin !== undefined) headers.set("origin", origin)
    await json(kine, path, { ...options, headers: Object.fromEntries(headers) }, 403)
  }
  await json(kine, path, { ...post(initial), headers: { ...post(initial).headers, "sec-fetch-site": "cross-site" } }, 403)
  await json(kine, path, { headers: { origin: "https://ajeno.example" } }, 403)
  await json(kine, path, { headers: { "sec-fetch-site": "cross-site" } }, 403)
  await json(kine, path, { ...post(initial), headers: { ...post(initial).headers, "Content-Type": "text/plain" } }, 415)
  await resetPostWindow()
  for (const extra of [
    { confirmarApoderado: false }, { autorizarCorreo: false }, { confirmarApoderado: undefined }, { autorizarCorreo: undefined },
    { confirmarApoderado: "true" }, { versionConsentimiento: "antigua" },
    { correo: "intruso@example.test" }, { destinatario: "intruso@example.test" },
  ]) await json(kine, path, post({ ...initial, ...extra }), 400)
  await json(kine, path, post({ ...initial, correoRepetido: "intruso@example.test" }), 409)
  await json(kine, path, post({ ...initial, contexto: "0".repeat(64) }), 409)
  await json(kine, path, post({ ...initial, revision: initial.revision + 1 }), 409)
  assert.equal(mails.length, beforeDenied.mails); assert.equal(mailAttempts.length, beforeDenied.attempts)
  assert.deepEqual(await copies(target.id), []); assert.deepEqual(await intents(target.id), [])
  assert.deepEqual((await db.query('SELECT * FROM "CambioPrivacidad" WHERE "autorizacionId"=$1 ORDER BY revision', [target.stored.autorizacionId])).rows, target.privacy)

  await resetPostWindow()
  // CAS de contacto, identidad y consentimiento: una revisión clínica igual no basta.
  const otherEmail = `changed-${randomUUID()}@example.test`
  await db.query('UPDATE "Evaluacion" SET "correoPadre"=$1 WHERE id=$2', [otherEmail, target.id])
  await json(kine, path, post({ ...initial, correoRepetido: otherEmail }), 409)
  const changedContact = (await json(kine, path)).contacto
  assert.notEqual(changedContact.contexto, initial.contexto)
  await db.query('UPDATE "Evaluacion" SET "correoPadre"=$1 WHERE id=$2', [target.email, target.id])
  const identityReview = (await json(kine, path)).contacto
  await db.query('UPDATE "Paciente" SET "revisionDatos"="revisionDatos"+1 WHERE id=$1', [target.stored.pacienteId])
  await json(kine, path, post(payload(identityReview)), 409)
  // La fixture registra cada cambio de autorización como una revisión nueva.
  async function changeConsent(datos) {
    const old = (await db.query('SELECT * FROM "AutorizacionPrivacidad" WHERE id=$1', [target.stored.autorizacionId])).rows[0]
    const state = value => ({ datos: value.datos, correoResultados: value.correoResultados, seguimiento: value.seguimiento, apoderadoId: value.apoderadoId, versionTexto: value.versionTexto })
    await db.query(`WITH changed AS (UPDATE "AutorizacionPrivacidad" SET datos=$2,revision=revision+1,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *)
      INSERT INTO "CambioPrivacidad" (id,"autorizacionId",revision,"actorId","perfilActor",declarante,referencia,canal,"versionTexto",textos,anterior,nueva)
      SELECT $3,id,revision,$4,'KINESIOLOGO',$5,'DOC-CONTACTO-FICTICIO','DOCUMENTO_REVISADO',"versionTexto",$6::jsonb,$7::jsonb,$8::jsonb FROM changed`,
    [old.id, datos, randomUUID(), author.id, target.guardian, JSON.stringify(target.privacy[0].textos), JSON.stringify(state(old)), JSON.stringify(state({ ...old, datos }))])
  }
  const consentBefore = (await json(kine, path)).contacto
  await changeConsent(false)
  await json(kine, path, post(payload(consentBefore)), 409)
  assert.equal((await json(kine, path)).contacto.habilitado, false)
  await changeConsent(true)
  await json(kine, path, post(payload(consentBefore)), 409)
  const current = (await json(kine, path)).contacto
  assert.notEqual(current.contexto, consentBefore.contexto); assert.equal(current.habilitado, true)
  assert.deepEqual(await copies(target.id), []); assert.equal(mails.length, beforeDenied.mails)

  await resetPostWindow()
  const consentBeforeSend = (await db.query('SELECT * FROM "AutorizacionPrivacidad" WHERE id=$1', [target.stored.autorizacionId])).rows[0]
  const privacyBeforeSend = (await db.query('SELECT * FROM "CambioPrivacidad" WHERE "autorizacionId"=$1 ORDER BY revision', [target.stored.autorizacionId])).rows
  assert.deepEqual(privacyBeforeSend[0], target.privacy[0], "Los cambios de consentimiento no reescriben su primera revisión")
  const approved = payload(current), beforeSend = { mails: mails.length, attempts: mailAttempts.length }
  const simultaneous = await Promise.all([kine(path, post(approved)), twin(path, post(approved))])
  assert(simultaneous.every(response => [200, 201, 202].includes(response.status)))
  const results = await Promise.all(simultaneous.map(response => response.json()))
  assert.equal(results[0].envio.id, results[1].envio.id)
  assert(results.every(result => ["ACEPTADO", "ENVIANDO"].includes(result.envio.estado)), JSON.stringify(results.map(result=>({estado:result.envio.estado}))))
  assert(results.some(result => result.envio.estado === "ACEPTADO"), "Al terminar ambos POST, el cliente que envía debe confirmar aceptación")
  const afterConcurrent = (await json(kine, path)).contacto
  assert.equal(afterConcurrent.envios.length, 1)
  assert.equal(afterConcurrent.envios[0].estado, "ACEPTADO")
  assert.equal(afterConcurrent.envios[0].contexto, current.contexto)
  assert.equal(mails.length, beforeSend.mails + 1); assert.equal(mailAttempts.length, beforeSend.attempts + 1)
  const original = (await copies(target.id))[0]
  assert.equal((await copies(target.id)).length, 1)
  assert.equal((await intents(target.id)).length, 1)
  assert.equal(original.actorId, author.id); assert.equal(original.destinatario, target.email)
  assert.equal(original.nombreApoderado, target.guardian); assert.equal(original.canal, "PRESENCIAL")
  assert.equal(original.confirmarApoderado, true); assert.equal(original.autorizarCorreo, true)
  assert.equal(original.consentimientoVersion, current.versionConsentimiento)
  assert.deepEqual(original.consentimientoTextos, current.textos)
  const audit = (await db.query(`SELECT "actorId","perfilActor" FROM "AccesoPrivado" WHERE recurso='RESULTADO_CONTACTO' AND "recursoId"=$1 AND accion='AUTORIZAR_ENVIO_CONTACTO'`, [original.id])).rows
  assert.deepEqual(audit, [{ actorId: author.id, perfilActor: "KINESIOLOGO" }])
  assert.equal(original.autorizacionRevision, consentBeforeSend.revision)
  assert.deepEqual(original.datos, current.datos)
  assert.deepEqual(mails.at(-1).to, [target.email]); assert.equal(mails.at(-1).providerId, original.proveedorId)
  assert(!mails.at(-1).text.includes("Disponible también en tu cuenta familiar"))
  assert(!mails.at(-1).html.includes("Puedes consultar este resultado en tu cuenta familiar"))
  const replay = await json(twin, path, post({ ...approved, id: randomUUID() }))
  assert.equal(replay.envio.id, original.id)
  assert.equal(mailAttempts.length, beforeSend.attempts + 1)
  assert.deepEqual((await db.query('SELECT * FROM "AutorizacionPrivacidad" WHERE id=$1', [target.stored.autorizacionId])).rows[0], consentBeforeSend)
  assert.deepEqual((await db.query('SELECT * FROM "CambioPrivacidad" WHERE "autorizacionId"=$1 ORDER BY revision', [target.stored.autorizacionId])).rows, privacyBeforeSend)
  await noFamilyPublication(target.id)

  await resetPostWindow()
  // Un contacto corregido permite otra copia en la MISMA revisión, con contexto nuevo.
  await db.query('UPDATE "Evaluacion" SET "correoPadre"=$1 WHERE id=$2', [otherEmail, target.id])
  await json(twin, path, post(approved), 409)
  const sameRevision = (await json(kine, path)).contacto
  assert.equal(sameRevision.revision, current.revision)
  assert.notEqual(sameRevision.contexto, current.contexto)
  assert.equal(sameRevision.destinatario, otherEmail); assert.equal(sameRevision.requiereMotivo, true)
  await json(kine, path, post(payload(sameRevision)), 409)
  const correctedContact = payload(sameRevision, { motivo: "Correo de contacto corregido y confirmado por el apoderado presente" })
  await json(kine, path, post({ ...correctedContact, autorizarCorreo: false }), 400)
  await json(kine, path, post({ ...correctedContact, confirmarApoderado: false }), 400)
  await json(kine, path, post({ ...correctedContact, correoRepetido: target.email }), 409)
  const beforeCorrection = { mails: mails.length, attempts: mailAttempts.length }
  const correctedCopy = await json(kine, path, post(correctedContact), 201)
  assert.equal(correctedCopy.envio.estado, "ACEPTADO")
  assert.equal(correctedCopy.envio.revision, original.revision)
  assert.equal(correctedCopy.envio.contexto, sameRevision.contexto)
  assert.equal(mails.length, beforeCorrection.mails + 1); assert.equal(mailAttempts.length, beforeCorrection.attempts + 1)
  assert.deepEqual(mails.at(-1).to, [otherEmail])
  const correctedReplay = await json(twin, path, post({ ...correctedContact, id: randomUUID() }))
  assert.equal(correctedReplay.envio.id, correctedCopy.envio.id)
  await json(twin, path, post({ ...correctedContact, id: original.id }), 409)
  assert.equal(mailAttempts.length, beforeCorrection.attempts + 1)
  const sameRevisionHistory = await copies(target.id)
  assert.equal(sameRevisionHistory.length, 2)
  assert(sameRevisionHistory.every(row => row.revision === original.revision))
  assert.equal(new Set(sameRevisionHistory.map(row => row.contexto)).size, 2)
  const correctedRecord = sameRevisionHistory.find(row => row.id === correctedCopy.envio.id)
  assert.equal(correctedRecord.anteriorId, original.id)
  assert.equal(correctedRecord.hashDatos, original.hashDatos, "Corregir el correo no cambia la copia clínica")
  assert.deepEqual(sameRevisionHistory.find(row => row.id === original.id), original)
  const sameRevisionView = (await json(kine, path)).contacto.envios
  assert.deepEqual(sameRevisionView.map(row => ({ id: row.id, contexto: row.contexto })), [{ id: correctedRecord.id, contexto: correctedRecord.contexto }, { id: original.id, contexto: original.contexto }])
  assert.equal((await intents(target.id)).length, 2)

  await resetPostWindow()
  // Otra revisión conserva la copia previa y requiere un motivo y confirmaciones nuevas.
  const changed = await json(kine, `/api/kinesiologia/resultados/${target.id}`, { ...post({ revision: current.revision, ...resultMeasurements({ ap: 141 }) }), method: "PATCH" })
  assert.equal(changed.resultado.revision, current.revision + 1)
  await json(twin, path, post(approved), 409)
  await db.query('UPDATE "Evaluacion" SET "correoPadre"=$1 WHERE id=$2', [otherEmail, target.id])
  const next = (await json(kine, path)).contacto
  assert.equal(next.requiereMotivo, true); assert.equal(next.destinatario, otherEmail)
  await json(kine, path, post(payload(next)), 409)
  const nextCopy = await json(kine, path, post(payload(next, { motivo: "Nueva revisión de medidas solicitada por el apoderado presente" })), 201)
  assert.equal(nextCopy.envio.estado, "ACEPTADO")
  assert.deepEqual(mails.at(-1).to, [otherEmail])
  const history = await copies(target.id)
  assert.equal(history.length, 3); assert.equal(history[2].anteriorId, correctedRecord.id)
  assert.deepEqual(history[0], original, "La revisión posterior no reescribe datos, destino ni consentimiento históricos")
  assert.deepEqual(history[1], correctedRecord)
  const readHistory = (await json(kine, path)).contacto.envios
  assert.deepEqual(readHistory.map(row => ({ id: row.id, contexto: row.contexto })), [...history].reverse().map(row => ({ id: row.id, contexto: row.contexto })))
  const originalView = readHistory.find(row => row.id === original.id)
  assert.deepEqual(originalView.datos, original.datos); assert.equal(originalView.destinatario, target.email)
  for (const statement of [
    `UPDATE "ResultadoContacto" SET destinatario='intruso@example.test' WHERE id=$1`,
    `UPDATE "ResultadoContacto" SET datos='{}'::jsonb WHERE id=$1`,
    `UPDATE "ResultadoContacto" SET "consentimientoTextos"='{}'::jsonb WHERE id=$1`,
    `DELETE FROM "ResultadoContacto" WHERE id=$1`,
  ]) await assert.rejects(db.query(statement, [original.id]), error => error.code === "23514")
  assert.deepEqual((await copies(target.id))[0], original)
  await noFamilyPublication(target.id)

  await resetPostWindow()
  const recovery = await fixture("reintento"), retryPath = endpoint(recovery.id), retryPayload = payload(recovery.review)
  const beforeRetry = { mails: mails.length, attempts: mailAttempts.length }
  let pending
  setResultFailure(true)
  try { pending = await json(kine, retryPath, post(retryPayload), 202) }
  finally { setResultFailure(false) }
  assert.equal(pending.envio.estado, "REINTENTABLE")
  assert.equal(mails.length, beforeRetry.mails); assert.equal(mailAttempts.length, beforeRetry.attempts + 1)
  const pendingRecord = (await copies(recovery.id))[0]
  await db.query(`UPDATE "EnvioTransaccional" SET "disponibleAt"=CURRENT_TIMESTAMP+interval '10 minutes' WHERE clave=$1`, [pendingRecord.claveEnvio])
  const cooldown = await json(twin, retryPath, post(retryPayload), 202)
  assert.equal(cooldown.envio.id, pending.envio.id); assert.equal(mailAttempts.length, beforeRetry.attempts + 1)
  await db.query(`UPDATE "EnvioTransaccional" SET "disponibleAt"=CURRENT_TIMESTAMP-interval '1 second' WHERE clave=$1`, [pendingRecord.claveEnvio])
  const recovered = await json(twin, retryPath, post(retryPayload))
  assert.equal(recovered.envio.estado, "ACEPTADO"); assert.equal(recovered.envio.id, pending.envio.id)
  assert.equal(mails.length, beforeRetry.mails + 1); assert.equal(mailAttempts.length, beforeRetry.attempts + 2)
  await json(kine, retryPath, post(retryPayload))
  assert.equal(mailAttempts.length, beforeRetry.attempts + 2)
  assert.equal((await copies(recovery.id)).length, 1); assert.equal((await intents(recovery.id)).length, 1)
  assert.equal((await intents(recovery.id))[0].intentos, 2)
  assert.equal(new Set(mailAttempts.slice(beforeRetry.attempts).map(attempt => attempt.key)).size, 1, "Los reintentos conservan la clave idempotente del proveedor")
  assert.deepEqual(mails.at(-1).to, [recovery.email])
  await noFamilyPublication(recovery.id)
  assert.equal((await db.query('SELECT count(*)::int n FROM "Apoderado"')).rows[0].n, ownersBefore)
  assert.equal((await db.query('SELECT "apoderadoId" FROM "Paciente" WHERE id=$1', [target.stored.pacienteId])).rows[0].apoderadoId, null)
  // Fixture de evento independiente: el snapshot ya contiene jornada/número antes de vincular.
  // Así la copia de contacto y la publicación familiar son exactamente homologables.
  await resetPostWindow()
  const linkEvent = await createEvent(admin, "Contacto y publicación familiar ficticia", 2, false)
  const dateParts = new Intl.DateTimeFormat("en", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const part = type => dateParts.find(value => value.type === type).value
  await db.query('UPDATE "Evento" SET fecha=$1::date WHERE id=$2', [`${part("year")}-${part("month")}-${part("day")}`, linkEvent.id])
  const onsite = await json(reception, "/api/recepcion/presencial", post({ ...paperConsent, id: randomUUID(), eventoId: linkEvent.id, nombreBebe: `Bebé contacto familiar ${randomUUID()}`, fechaNacimiento: "2026-01-01", nombreApoderado: "Apoderado contacto familiar ficticio", correo: f1.user.email, telefono: "" }), 201)
  const active = (await json(kine, "/api/kinesiologia/atencion")).atencion
  if (active) await json(kine, "/api/kinesiologia/devolver", post({ atencionId: active.id, reservaId: active.reservaId }))
  const attention = (await json(kine, "/api/kinesiologia/llamar", post({ id: randomUUID(), eventoId: linkEvent.id }))).atencion
  assert.equal(attention.eventoId, linkEvent.id)
  assert.equal((await db.query('SELECT "inscripcionId" FROM "EntradaFila" WHERE id=$1', [attention.id])).rows[0].inscripcionId, onsite.inscripcion.id)
  const saved = await kine("/api/evaluaciones", post({ atencionId: attention.id, reservaId: attention.reservaId, ...resultMeasurements() }))
  assert.equal(saved.status, 201)
  const linkedEvaluation = (await saved.json()).evaluacionId, linkPath = endpoint(linkedEvaluation)
  const linkReview = (await json(kine, linkPath)).contacto
  assert.equal(linkReview.habilitado, true, linkReview.motivoBloqueo)
  assert.equal(linkReview.destinatario, f1.user.email)
  const sent = await json(kine, linkPath, post(payload(linkReview)), 201)
  assert.equal(sent.envio.estado, "ACEPTADO")
  assert.equal(sent.envio.contexto, linkReview.contexto)
  const beforeLink = { mails: mails.length, attempts: mailAttempts.length }
  const originalContact = (await copies(linkedEvaluation))[0]
  const invite = await json(reception, "/api/recepcion/vinculaciones", post({ id: randomUUID(), eventoId: linkEvent.id, inscripcionId: onsite.inscripcion.id, correo: f1.user.email }))
  await json(f1.request, "/api/familias/vinculaciones", post({ ...familyConsent, codigo: invite.codigo }))
  assert.equal(mails.length, beforeLink.mails); assert.equal(mailAttempts.length, beforeLink.attempts)
  const familyOwner = f1.user.id.replace(/^familia:/, "")
  const owners = (await db.query('SELECT i."apoderadoId",p."apoderadoId" AS owner FROM "Inscripcion" i JOIN "Paciente" p ON p.id=i."pacienteId" WHERE i.id=$1', [onsite.inscripcion.id])).rows[0]
  assert.deepEqual(owners, { apoderadoId: familyOwner, owner: familyOwner })
  const publishPath = `/api/kinesiologia/resultados/${linkedEvaluation}/publicar`
  const published = (await json(kine, publishPath, post({ revision: linkReview.revision }), 201)).resultado.publicacion
  assert.equal(published.correo.estado, "ENVIADO")
  const acceptedMail = (await db.query('SELECT destinatario,estado,"proveedorId" FROM "CorreoResultado" WHERE "publicacionId"=$1', [published.id])).rows[0]
  assert.deepEqual(acceptedMail, { destinatario: f1.user.email, estado: "ENVIADO", proveedorId: sent.envio.proveedorId })
  assert.deepEqual((await json(f1.request, `/api/familias/resultados/${published.id}`)).resultado.datos, linkReview.datos)
  await json(f2.request, `/api/familias/resultados/${published.id}`, undefined, 404)
  await json(twin, publishPath, post({ revision: linkReview.revision }))
  await json(f1.request, `/api/familias/resultados/${published.id}/correo`, post({}))
  await json(kine, `/api/kinesiologia/resultados/${linkedEvaluation}/correo`, post({}))
  assert.equal(mails.length, beforeLink.mails, "Vincular, publicar y reintentar no repiten la copia clínica ya aceptada")
  assert.equal(mailAttempts.length, beforeLink.attempts)
  assert.deepEqual((await copies(linkedEvaluation))[0], originalContact)
  assert.equal((await copies(linkedEvaluation)).length, 1)
  assert.equal((await intents(linkedEvaluation)).length, 1)
  assert.equal((await db.query('SELECT count(*)::int n FROM "ResultadoPublicado" WHERE "evaluacionId"=$1', [linkedEvaluation])).rows[0].n, 1)
  assert.equal((await json(kine, linkPath)).contacto.habilitado, false)
  console.log("OK contacto a cuenta familiar: vinculación HTTP con f1, snapshot idéntico publicado, proveedorId conservado y ningún correo adicional.")
  if (browsers) {
    const { browserResultContactChecks } = await import("./browser-result-contact.mjs")
    await browserResultContactChecks({ db, base, email: author.email, password, resetGlobalLogin, mails, mailAttempts,
      createFixture: async profile => {
        await resetPostWindow()
        await resetGetWindow()
        return fixture(`UI ${profile}`)
      },
    })
  }
  console.log("OK contacto sin cuenta: HTTP por perfil y autoría, CSRF, dos consentimientos, destino guardado, CAS, dos clientes sin duplicados, recuperación con Brevo ficticio e historial inmutable.")
}
