import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

export async function overviewChecks({ db, client, signIn, password, accounts, admin, anonymous, f1, post, createEvent, mails }) {
  const reception = client(), kine = client()
  for (const [request, account] of [[reception, accounts[0]], [kine, accounts[2]]]) await signIn(request, "equipo", { email: account.email, password })
  const event = await createEvent(admin, "Resumen ficticio A", 20, false), other = await createEvent(admin, "Resumen ficticio B", 20, false)
  const path = id => `/api/eventos/${id}/resumen`
  const zero = { inscritos: 0, enEspera: 0, enAtencion: 0, atendidos: 0, ausentes: 0, sinLlegada: 0, resultadosPendientes: 0, resultadosPublicados: 0 }
  const empty = await admin(path(event.id)); assert.equal(empty.status, 200); assert.deepEqual((await empty.json()).totales, zero)
  for (const [request, status] of [[anonymous, 401], [f1.request, 401], [reception, 403], [kine, 403]]) assert.equal((await request(path(event.id))).status, status)
  assert.equal((await admin(path("inválido"))).status, 400)
  assert.equal((await admin(path(randomUUID()))).status, 404)
  assert.equal((await admin(path(event.id), post({}))).status, 405)
  const owner = f1.user.id.replace(/^familia:/, ""), rows = []
  const states = [null, "EN_ESPERA", "EN_ESPERA", "EN_ESPERA", "EN_ATENCION", "ATENDIDO", "ATENDIDO", "AUSENTE"]
  for (const [index, state] of states.entries()) {
    const row = { id: randomUUID(), patient: randomUUID(), entry: randomUUID(), absence: randomUUID(), evaluation: randomUUID() }
    const linked = index === 1 || index === 2
    await db.query('INSERT INTO "Paciente" (id,nombre,"fechaNacimiento","apoderadoId") VALUES ($1,$2,\'2026-01-01\',$3)', [row.patient, `Bebé privado ${index}`, linked ? owner : null])
    await db.query('INSERT INTO "Inscripcion" (id,"solicitudHash","eventoId","pacienteId",numero,"qrToken",origen,"apoderadoId","contactoNombre","contactoCorreo","registradoPorId") VALUES ($1,\'fixture\',$2,$3,$4,$5,$6,$7,\'Contacto privado\',\'privado@example.com\',\'fixture\')', [row.id, event.id, row.patient, index + 1, randomUUID(), linked ? "PREVIA" : "PRESENCIAL", linked ? owner : null])
    if (state) await db.query('INSERT INTO "EntradaFila" (id,"eventoId","inscripcionId",orden,"confirmadoPorId",estado,"profesionalId","ausenciaId") VALUES ($1,$2,$3,$4,\'fixture\',$5,$6,$7)', [row.entry, event.id, row.id, index + 1, state, state === "EN_ATENCION" ? "summary-active-fixture" : null, state === "AUSENTE" ? row.absence : null])
    if (state === "ATENDIDO") await evaluation(row.evaluation, row.patient, row.entry)
    rows.push(row)
  }
  async function evaluation(id, patient, entry) {
    await db.query('INSERT INTO "Evaluacion" (id,"pacienteId","filaId",anteroposterior,biparietal,"diagonalIzq","diagonalDer","indiceCraneal","indiceAsimetria",diagnostico,recomendacion,kinesiologa) VALUES ($1,$2,$3,140,120,135,138,85.7,3,\'Diagnóstico privado\',\'Recomendación privada\',\'Profesional privada\')', [id, patient, entry])
  }
  async function publish(row) {
    await db.query('INSERT INTO "ResultadoPublicado" (id,"evaluacionId","apoderadoId","publicadoPorId",revision,datos) VALUES ($1,$2,$3,\'fixture\',1,\'{"diagnostico":"privado"}\'::jsonb)', [randomUUID(), row.evaluation, owner])
  }
  await db.query('UPDATE "Evento" SET inscritos=8,"ultimoNumero"=8,"ultimoOrdenFila"=8 WHERE id=$1', [event.id])
  await publish(rows[5])
  // El mismo bebé tiene otra evaluación en otro evento y una sin inscripción.
  const foreign = { id: randomUUID(), entry: randomUUID(), evaluation: randomUUID() }
  await db.query('INSERT INTO "Inscripcion" (id,"solicitudHash","eventoId","pacienteId",numero,"qrToken",origen,"contactoNombre","registradoPorId") VALUES ($1,\'fixture\',$2,$3,1,$4,\'PRESENCIAL\',\'Familia privada\',\'fixture\')', [foreign.id, other.id, rows[5].patient, randomUUID()])
  await db.query('INSERT INTO "EntradaFila" (id,"eventoId","inscripcionId",orden,"confirmadoPorId",estado) VALUES ($1,$2,$3,1,\'fixture\',\'ATENDIDO\')', [foreign.entry, other.id, foreign.id])
  await evaluation(foreign.evaluation, rows[5].patient, foreign.entry)
  await evaluation(randomUUID(), rows[5].patient, null)
  await db.query('UPDATE "Evento" SET inscritos=1,"ultimoNumero"=1,"ultimoOrdenFila"=1 WHERE id=$1', [other.id])
  // Varios ciclos históricos de ausencia siguen representando una única ausencia actual.
  for (let i = 0; i < 3; i++) await db.query('INSERT INTO "MovimientoFila" (id,"entradaId","ausenciaId",tipo,"usuarioId") VALUES ($1,$2,$3,\'AUSENCIA\',\'fixture\')', [randomUUID(), rows[7].entry, i === 2 ? rows[7].absence : randomUUID()])
  const beforeMails = mails.length
  const before = (await db.query('SELECT to_jsonb(i) AS row FROM "Inscripcion" i WHERE "eventoId"=$1 UNION ALL SELECT to_jsonb(f) FROM "EntradaFila" f WHERE "eventoId"=$1', [event.id])).rows
  const response = await admin(path(event.id)); assert.equal(response.status, 200); assert(response.headers.get("cache-control").includes("no-store"))
  const result = await response.json()
  assert.deepEqual(Object.keys(result).sort(), ["consultadoAt", "evento", "totales"])
  assert.deepEqual(result.evento, { id: event.id, nombre: event.nombre, cupos: 20 })
  assert(Number.isFinite(Date.parse(result.consultadoAt)))
  assert.deepEqual(result.totales, { inscritos: 8, enEspera: 3, enAtencion: 1, atendidos: 2, ausentes: 1, sinLlegada: 1, resultadosPendientes: 1, resultadosPublicados: 1 })
  assert(!JSON.stringify(result).match(/privado|nombreBebe|pacienteId|apoderadoId|diagnostico|recomendacion|medidas|correo|qrToken|profesionalId/i))
  assert.deepEqual((await (await admin(path(other.id))).json()).totales, { ...zero, inscritos: 1, atendidos: 1, resultadosPendientes: 1 })
  assert.deepEqual((await db.query('SELECT to_jsonb(i) AS row FROM "Inscripcion" i WHERE "eventoId"=$1 UNION ALL SELECT to_jsonb(f) FROM "EntradaFila" f WHERE "eventoId"=$1', [event.id])).rows, before)
  assert.equal(mails.length, beforeMails)
  // Consultar otro resumen no cambia la selección guardada de la cuenta.
  assert.equal((await (await admin("/api/eventos")).json()).seleccionadoId, other.id)
  assert.equal((await reception("/api/recepcion/reincorporar", post({ eventoId: event.id, inscripcionId: rows[7].id, ausenciaId: rows[7].absence }))).status, 200)
  let changed = (await (await admin(path(event.id))).json()).totales
  assert.equal(changed.ausentes, 0); assert.equal(changed.enEspera, 4); assert.equal(changed.inscritos, 8)
  await publish(rows[6])
  changed = (await (await admin(path(event.id))).json()).totales
  assert.equal(changed.resultadosPendientes, 0); assert.equal(changed.resultadosPublicados, 2); assert.equal(changed.atendidos, 2)
  const page = await admin("/administracion"); assert.equal(page.status, 200); assert((await page.text()).includes("El resumen del evento seleccionado se actualiza automáticamente."))
  console.log("OK resumen: ceros reales, estados por inscripción, aislamiento entre eventos, borradores sin vinculación, publicación y reincorporación actualizadas, privacidad y lectura sin efectos.")
}
