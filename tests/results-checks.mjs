import { familyConsent } from "./privacy-fixtures.mjs"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

export async function resultsChecks({ db, client, signIn, password, accounts, admin, anonymous, f1, f2, post, createEvent, mails, setResultFailure }) {
  const kine = client(), otherKine = client(), reception = client()
  for (const [request, account] of [[kine, accounts[2]], [otherKine, accounts[3]], [reception, accounts[0]]]) await signIn(request, "equipo", { email: account.email, password })
  for (const request of [kine, otherKine]) {
    const active = (await (await request("/api/kinesiologia/atencion")).json()).atencion
    if (active) await request("/api/kinesiologia/devolver", post({ atencionId: active.id, reservaId: active.reservaId }))
  }
  const event = await createEvent(admin, "Publicación ficticia", 6, true), registrations = []
  for (let i = 0; i < 4; i++) {
    const response = await f1.request("/api/familias/inscripciones", post({ ...familyConsent, id: randomUUID(), eventoId: event.id, nombreBebe: i === 0 ? "Bebé <script>ficticio</script>" : `Bebé publicación ${i}`, fechaNacimiento: "2026-01-01", nombreApoderado: "Apoderado ficticio" }))
    assert.equal(response.status, 201); const row = (await response.json()).inscripcion; registrations.push(row)
    assert.equal((await reception("/api/recepcion/llegadas", post({ eventoId: event.id, inscripcionId: row.id }))).status, 201)
  }
  const measures = { ap: 140, bp: 120, di: 135, dd: 138 }
  async function evaluate() {
    const called = await kine("/api/kinesiologia/llamar", post({ id: randomUUID(), eventoId: event.id })); assert.equal(called.status, 200)
    const attention = (await called.json()).atencion
    const response = await kine("/api/evaluaciones", post({ atencionId: attention.id, reservaId: attention.reservaId, ...measures, autorId: accounts[3].id })); assert.equal(response.status, 201)
    return (await response.json()).evaluacionId
  }
  const first = await evaluate(), detail = `/api/kinesiologia/resultados/${first}`
  const owned = await (await kine(detail)).json()
  assert.equal(owned.resultado.revision, 1); assert.equal(owned.resultado.publicacion, null); assert.equal(owned.resultado.publicable, true)
  assert.equal((await db.query('SELECT "autorId" FROM "Evaluacion" WHERE id=$1', [first])).rows[0].autorId, accounts[2].id)
  for (const [request, status] of [[anonymous, 401], [f1.request, 401], [admin, 403], [reception, 403]]) {
    assert.equal((await request("/api/kinesiologia/resultados")).status, status)
    assert.equal((await request(detail)).status, status)
    assert.equal((await request(detail, { ...post({ revision: 1, ...measures }), method: "PATCH" })).status, status)
    assert.equal((await request(`${detail}/publicar`, post({ revision: 1 }))).status, status)
    assert.equal((await request(`${detail}/correo`, post({}))).status, status)
  }
  assert.equal((await otherKine(detail)).status, 404)
  assert.equal((await otherKine(`${detail}/publicar`, post({ revision: 1 }))).status, 404)
  assert.equal((await otherKine(detail, { ...post({ revision: 1, ...measures }), method: "PATCH" })).status, 404)
  assert.equal((await otherKine(`${detail}/correo`, post({}))).status, 404)
  assert.equal((await kine("/api/kinesiologia/resultados/legacy-evaluation")).status, 404, "No se reclama autoría por conocer el nombre")
  assert.equal((await (await f1.request("/api/familias/resultados")).json()).total, 0)
  const previewPage = await kine(`/kinesiologia/resultados/${first}`)
  assert.equal(previewPage.status, 200); assert((await previewPage.text()).includes("Revisar resultado"))
  assert.equal((await kine(detail, { ...post({ revision: 1, ...measures, ap: -1 }), method: "PATCH" })).status, 400)
  const changedMeasures = { ...measures, ap: 141 }
  const changed = await kine(detail, { ...post({ revision: 1, ...changedMeasures, diagnostico: "falso", correo: "intruso@example.com" }), method: "PATCH" })
  assert.equal(changed.status, 200)
  const corrected = (await changed.json()).resultado
  assert.equal(corrected.revision, 2); assert.equal(corrected.datos.indiceCraneal, 120 / 141 * 100); assert.notEqual(corrected.datos.diagnostico, "falso")
  assert.equal((await db.query('SELECT count(*)::int n FROM "RevisionEvaluacion" WHERE "evaluacionId"=$1', [first])).rows[0].n, 1)
  assert.equal((await kine(detail, { ...post({ revision: 1, ...measures }), method: "PATCH" })).status, 409)
  assert.equal((await kine(`${detail}/publicar`, post({ revision: 1 }))).status, 409)
  assert.equal((await db.query('SELECT count(*)::int n FROM "ResultadoPublicado"')).rows[0].n, 0)
  await db.query('UPDATE "Evaluacion" SET "correoPadre"=$1 WHERE id=$2', ["intruso@example.com", first])
  const beforeMails = mails.length
  const responses = await Promise.all([kine(`${detail}/publicar`, post({ revision: 2, correo: "intruso@example.com", apoderadoId: f2.user.id })), kine(`${detail}/publicar`, post({ revision: 2 }))])
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 201])
  const publishedResponses = await Promise.all(responses.map(r => r.json())), published = publishedResponses[0].resultado.publicacion
  assert.equal(published.id, publishedResponses[1].resultado.publicacion.id)
  assert.equal(mails.length, beforeMails + 1, `Correo tras publicar: ${JSON.stringify(publishedResponses.map(row => row.resultado.publicacion.correo))}`)
  const resultMail = mails.at(-1)
  assert.equal(resultMail.subject, "Tu resultado de craneometría en Casku")
  assert([].concat(resultMail.to).includes(f1.user.email)); assert(![].concat(resultMail.to).includes("intruso@example.com"))
  assert(resultMail.text.includes(corrected.datos.diagnostico)); assert(resultMail.text.includes(corrected.datos.recomendacion))
  assert(!resultMail.html.includes("<script>")); assert(resultMail.html.includes("&lt;script&gt;"))
  const familyDetail = `/api/familias/resultados/${published.id}`
  for (const request of [anonymous, kine, reception, admin]) assert.equal((await request(familyDetail)).status, 401)
  assert.equal((await f2.request(familyDetail)).status, 404)
  assert.equal((await f2.request(`${familyDetail}/correo`, post({}))).status, 404)
  const family = await f1.request(familyDetail)
  assert.equal(family.status, 200); assert(family.headers.get("cache-control").includes("no-store"))
  const actual = (await family.json()).resultado
  assert.deepEqual(actual.datos, corrected.datos)
  assert(!JSON.stringify(actual).match(/correoPadre|destinatario|autorId|apoderadoId|rut|solicitudHash/))
  assert.equal((await (await f1.request("/api/familias/resultados")).json()).total, 1)
  assert.equal((await (await f2.request("/api/familias/resultados")).json()).total, 0)
  assert.equal((await kine(detail, { ...post({ revision: 2, ...measures }), method: "PATCH" })).status, 409)
  const html = await (await f1.request(`/familias/resultados/${published.id}`)).text()
  assert(html.includes("Resultado publicado")); assert(html.includes("&lt;script&gt;"))
  const otherHtml = await (await f2.request(`/familias/resultados/${published.id}`)).text()
  assert(otherHtml.includes("Resultado no disponible")); assert(!otherHtml.includes("&lt;script&gt;"))
  const loginResponse = await anonymous(`/familias/resultados/${published.id}`)
  const loginHtml = await loginResponse.text()
  assert((loginResponse.headers.get("location") || loginHtml).includes(`resultado=${published.id}`))
  assert(!loginHtml.includes("&lt;script&gt;"))
  // La copia de publicación y el cuerpo idempotente no cambian al editar después la ficha.
  await db.query('UPDATE "Paciente" SET nombre=$1 WHERE id=$2', ["Nombre de ficha actualizado", registrations[0].bebe.id])
  assert.deepEqual((await (await f1.request(familyDetail)).json()).resultado.datos, corrected.datos)
  await db.query('UPDATE "CorreoResultado" SET estado=\'FALLIDO\',"disponibleAt"=$1 WHERE "publicacionId"=$2', [new Date(Date.now() - 1000), published.id])
  const countBeforeReplay = mails.length
  const replayMail = await kine(`${detail}/correo`, post({})); assert.equal(replayMail.status, 200)
  assert.equal((await replayMail.json()).resultado.publicacion.correo.estado, "ENVIADO"); assert.equal(mails.length, countBeforeReplay)
  console.log("OK resultados: autoría propia, borrador revisable, versión publicada inmutable, privacidad familiar, destinatario verificado e idempotencia.")

  const second = await evaluate(), secondDetail = `/api/kinesiologia/resultados/${second}`
  setResultFailure(true)
  const pending = await kine(`${secondDetail}/publicar`, post({ revision: 1 })); assert.equal(pending.status, 201)
  const pendingPublished = (await pending.json()).resultado.publicacion
  assert.equal(pendingPublished.correo.estado, "FALLIDO")
  assert.equal((await f1.request(`/api/familias/resultados/${pendingPublished.id}`)).status, 200)
  setResultFailure(false)
  const beforeCooldown = mails.length
  await kine(`${secondDetail}/correo`, post({})); assert.equal(mails.length, beforeCooldown)
  await db.query('UPDATE "CorreoResultado" SET "disponibleAt"=$1 WHERE "publicacionId"=$2', [new Date(Date.now() - 1000), pendingPublished.id])
  const retry = await f1.request(`/api/familias/resultados/${pendingPublished.id}/correo`, post({ correo: "intruso@example.com" }))
  assert.equal(retry.status, 200); assert.equal((await retry.json()).resultado.correo.estado, "ENVIADO")
  assert([].concat(mails.at(-1).to).includes(f1.user.email))
  // Revocar la propiedad impide leer y enviar a la cuenta anterior.
  const owner = (await db.query('SELECT "apoderadoId" FROM "Paciente" WHERE id=$1', [registrations[0].bebe.id])).rows[0].apoderadoId
  await db.query('UPDATE "Paciente" SET "apoderadoId"=NULL WHERE id=$1', [registrations[0].bebe.id])
  assert.equal((await f1.request(familyDetail)).status, 404)
  assert(!(await (await f1.request("/api/familias/resultados")).json()).resultados.some(row => row.id === published.id))
  await db.query('UPDATE "CorreoResultado" SET estado=\'FALLIDO\',"disponibleAt"=$1 WHERE "publicacionId"=$2', [new Date(Date.now() - 1000), published.id])
  const beforeRevoked = mails.length
  await kine(`${detail}/correo`, post({})); assert.equal(mails.length, beforeRevoked)
  await db.query('UPDATE "Paciente" SET "apoderadoId"=$1 WHERE id=$2', [owner, registrations[0].bebe.id])

  const third = await evaluate(), thirdDetail = `/api/kinesiologia/resultados/${third}`
  await db.exec(`CREATE FUNCTION publication_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER publication_fail_trigger BEFORE INSERT ON "CorreoResultado" FOR EACH ROW EXECUTE FUNCTION publication_fail();`)
  assert.equal((await kine(`${thirdDetail}/publicar`, post({ revision: 1 }))).status, 503)
  assert.equal((await db.query('SELECT count(*)::int n FROM "ResultadoPublicado" WHERE "evaluacionId"=$1', [third])).rows[0].n, 0)
  await db.exec('DROP TRIGGER publication_fail_trigger ON "CorreoResultado"; DROP FUNCTION publication_fail();')
  assert.equal((await kine(`${thirdDetail}/publicar`, post({ revision: 1 }))).status, 201)
  const fourth = await evaluate(), fourthDetail = `/api/kinesiologia/resultados/${fourth}`
  await db.exec(`CREATE FUNCTION revision_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER revision_fail_trigger BEFORE INSERT ON "RevisionEvaluacion" FOR EACH ROW EXECUTE FUNCTION revision_fail();`)
  assert.equal((await kine(fourthDetail, { ...post({ revision: 1, ...changedMeasures }), method: "PATCH" })).status, 503)
  assert.equal((await (await kine(fourthDetail)).json()).resultado.revision, 1)
  await db.exec('DROP TRIGGER revision_fail_trigger ON "RevisionEvaluacion"; DROP FUNCTION revision_fail();')
  const competing = await Promise.all([kine(fourthDetail, { ...post({ revision: 1, ...changedMeasures }), method: "PATCH" }), kine(`${fourthDetail}/publicar`, post({ revision: 1 }))])
  assert(competing.every(response => [200, 201, 409].includes(response.status)))
  assert.equal(competing.filter(response => response.status === 409).length, 1)
  // Un registro presencial sin cuenta no recibe contenido clínico por conocer un correo.
  const onsiteEvaluation = (await db.query('SELECT e.id FROM "Evaluacion" e JOIN "EntradaFila" f ON f.id=e."filaId" JOIN "Inscripcion" i ON i.id=f."inscripcionId" WHERE i."apoderadoId" IS NULL AND e."autorId"=$1 LIMIT 1', [accounts[2].id])).rows[0]
  assert(onsiteEvaluation)
  const siteReview = (await (await kine(`/api/kinesiologia/resultados/${onsiteEvaluation.id}`)).json()).resultado
  assert.equal(siteReview.publicable, false)
  assert.equal((await kine(`/api/kinesiologia/resultados/${onsiteEvaluation.id}/publicar`, post({ revision: siteReview.revision }))).status, 409)
  // Paginación del listado clínico con borradores adicionales, sin publicarlos.
  await db.query(`INSERT INTO "Evaluacion" (id,"pacienteId",anteroposterior,biparietal,"diagonalIzq","diagonalDer","indiceCraneal","indiceAsimetria",diagnostico,recomendacion,kinesiologa,"autorId") SELECT 'list-result-fixture-'||n,$1,140,120,135,138,85.7,3,'Ejemplo','Ejemplo','Profesional ficticia',$2 FROM generate_series(1,21) n`, [registrations[0].bebe.id, accounts[2].id])
  const page1 = await (await kine("/api/kinesiologia/resultados?estado=BORRADOR")).json()
  assert.equal(page1.resultados.length, 20); assert(page1.hayMas)
  const page2 = await (await kine("/api/kinesiologia/resultados?estado=BORRADOR&pagina=2")).json(); assert(page2.resultados.length > 0)
  assert.equal((await kine("/api/kinesiologia/resultados?pagina=0")).status, 400)
  assert.equal((await kine("/api/kinesiologia/resultados?estado=OTRO")).status, 400)
  assert.equal((await (await kine(`/api/kinesiologia/resultados?estado=PUBLICADO&eventoId=${event.id}`)).json()).resultados.some(row => row.id === first), true)
  assert.equal((await kine("/kinesiologia/resultados")).status, 200)
  assert.equal((await f1.request("/familias/resultados")).status, 200)
  console.log("OK publicación y correo: fallos recuperables, propiedad revocada, transacciones, conflictos de revisión y bloqueo de resultados sin vinculación.")
}
