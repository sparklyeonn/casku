import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { randomBytes, randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { readFile, readdir } from "node:fs/promises"
import { setTimeout as pause } from "node:timers/promises"
import QRCode from "qrcode"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { hashPassword } from "../src/lib/passwords.mjs"
import { receptionChecks } from "./reception-checks.mjs"
import { kinesiologyChecks } from "./kinesiology-checks.mjs"
import { onsiteChecks } from "./onsite-checks.mjs"
import { absenceChecks } from "./absence-checks.mjs"
import { seedBeforeAbsenceMigration } from "./absence-migration.mjs"
import { seedBeforeResultsMigration } from "./results-migration.mjs"
import { resultsChecks } from "./results-checks.mjs"

const db = new PGlite(), socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 20 })
const base = "http://localhost:3120", password = randomBytes(20).toString("base64url")
const mails = [], deduped = new Map(), sentPayloads = new Map()
let failConfirmation = false, failResults = false, failAll = false, testFailed = false, child, exited = false, log = ""
const mailServer = createServer(async (request, response) => {
  const chunks = []; for await (const chunk of request) chunks.push(chunk)
  const body = JSON.parse(Buffer.concat(chunks).toString())
  response.setHeader("Content-Type", "application/json")
  if (failAll || (failResults && body.subject === "Tu resultado de craneometría en Casku") || (failConfirmation && body.subject?.startsWith("Inscripción"))) { response.writeHead(503); response.end(JSON.stringify({ name: "test_failure", message: "Temporary failure" })); return }
  const key = request.headers["idempotency-key"]
  if (deduped.has(key)) { if (body.subject === "Tu resultado de craneometría en Casku" && JSON.stringify(body) !== JSON.stringify(sentPayloads.get(key))) { response.writeHead(409); response.end(JSON.stringify({ name: "validation_error", message: "Idempotency payload changed" })); return }; response.end(JSON.stringify({ id: deduped.get(key) })); return }
  const id = randomUUID(); deduped.set(key, id); sentPayloads.set(key, body); mails.push({ ...body, providerId: id, key })
  response.end(JSON.stringify({ id }))
})
function client() {
  const cookies = new Map()
  return async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, redirect: "manual", signal: AbortSignal.timeout(60000), headers: { ...options.headers, cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } })
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], at = pair.indexOf("="); cookies.set(pair.slice(0, at), pair.slice(at + 1)) }
    return response
  }
}
const post = body => ({ method: "POST", headers: { "Content-Type": "application/json", origin: base }, body: JSON.stringify(body) })
const session = async request => (await (await request("/api/auth/session")).json())?.user
async function signIn(request, provider, values) {
  const { csrfToken } = await (await request("/api/auth/csrf")).json()
  await request(`/api/auth/callback/${provider}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", origin: base }, body: new URLSearchParams({ csrfToken, ...values, callbackUrl: base + "/panel" }) })
  return session(request)
}
async function challenge(request, correo) {
  const response = await request("/api/familias/acceso", post({ correo }))
  assert.equal(response.status, 200, "Solicitud de código")
  const value = await response.json()
  assert(!Object.hasOwn(value, "codigo"))
  const mail = mails.filter(m => [].concat(m.to).includes(correo) && m.subject === "Tu código de acceso a Casku").at(-1)
  assert(mail)
  return { ...value, codigo: mail.text.match(/es (\d{6})\./)[1] }
}
async function family(correo) {
  const request = client(), access = await challenge(request, correo)
  const user = await signIn(request, "familias", access)
  assert.equal(user?.role, "APODERADO")
  return { request, access, user }
}
async function createEvent(admin, nombre, cupos, open = true) {
  const input = { id: randomUUID(), nombre, fecha: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), lugar: "Lugar ficticio", cupos }
  const response = await admin("/api/eventos", post(input)); assert.equal(response.status, 201)
  if (open) { const opened = await admin(`/api/eventos/${input.id}/inscripciones`, { ...post({ abiertas: true }), method: "PATCH" }); assert.equal(opened.status, 200) }
  return input
}
const registration = (event, changes = {}) => ({ id: randomUUID(), eventoId: event.id, nombreApoderado: "Apoderado ficticio", nombreBebe: "Bebé ficticio", fechaNacimiento: "2026-01-01", ...changes })
const clinicalSnapshot = () => db.query(`SELECT to_jsonb(p) - 'apoderadoId' - 'nombreNormalizado' AS row FROM "Paciente" p WHERE id='legacy-baby' UNION ALL SELECT to_jsonb(e) - 'filaId' - 'autorId' - 'revision' FROM "Evaluacion" e WHERE id='legacy-evaluation'`)
try {
  await db.waitReady
  const migrations = (await readdir("prisma/migrations", { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort()
  for (const name of migrations.filter(name => name < "20261109000200_inscripcion_familiar")) await db.exec(await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"))
  await db.exec(`INSERT INTO "Paciente" (id,rut,nombre,"fechaNacimiento") VALUES ('legacy-baby','11111111-1','Bebé anterior ficticio','2026-01-01');
    INSERT INTO "Evaluacion" (id,"pacienteId","correoPadre",anteroposterior,biparietal,"diagonalIzq","diagonalDer","indiceCraneal","indiceAsimetria",diagnostico,recomendacion,kinesiologa) VALUES ('legacy-evaluation','legacy-baby','legacy@example.com',140,120,135,138,85.7,3,'Ejemplo','Ejemplo','Profesional ficticio');`)
  const before = await clinicalSnapshot()
  for (const name of migrations.filter(name => name >= "20261109000200_inscripcion_familiar")) {
    const verify = name === "20261109000600_ausencias_reincorporacion" ? await seedBeforeAbsenceMigration(db) : name === "20261109000700_publicacion_resultados" ? await seedBeforeResultsMigration(db) : null
    await db.exec(await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"))
    if (verify) await verify()
  }
  assert.deepEqual((await clinicalSnapshot()).rows, before.rows)
  await socket.start(); await new Promise(resolve => mailServer.listen(0, "127.0.0.1", resolve))
  const adminAccount = { id: "family-test-admin", email: "admin@example.com", name: "Admin ficticio", role: "ADMIN", active: true, passwordHash: await hashPassword(password) }
  const receptionAccounts = await Promise.all(["RECEPCION", "RECEPCION", "KINESIOLOGO", "KINESIOLOGO"].map(async (role, i) => ({ id: `reception-test-${i}`, email: `reception-${i}@example.com`, name: `Equipo ficticio ${i}`, role, active: true, passwordHash: await hashPassword(password) })))
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "3120"], { cwd: process.cwd(), env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: "1", CASKU_TEST_MODE: "1", CASKU_TEAM_ACCOUNTS: JSON.stringify([adminAccount, ...receptionAccounts]), AUTH_SECRET: randomBytes(32).toString("base64url"), AUTH_URL: base, NEXTAUTH_URL: base, AUTH_TRUST_HOST: "true", RESEND_API_KEY: "re_local_test_only", RESEND_FROM: "Casku <test@example.com>", CASKU_TEST_MAIL_URL: `http://127.0.0.1:${mailServer.address().port}`, DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable` }, stdio: ["ignore", "pipe", "pipe"] })
  child.stdout.on("data", value => { log = (log + value).slice(-15000) }); child.stderr.on("data", value => { log = (log + value).slice(-15000) }); child.on("exit", () => { exited = true })
  let ready = false
  for (const started = Date.now(); Date.now() - started < 180000;) {
    if (exited) throw new Error("El servidor no inició.")
    try { if ((await fetch(base + "/api/auth/csrf", { signal: AbortSignal.timeout(5000) })).ok) { ready = true; break } } catch {}
    await pause(200)
  }
  assert(ready)
  const admin = client(); assert.equal((await signIn(admin, "equipo", { email: adminAccount.email, password })).role, "ADMIN")
  const a = await createEvent(admin, "Evento A", 2), b = await createEvent(admin, "Evento B", 20), closed = await createEvent(admin, "Evento cerrado", 10, false)
  const anonymous = client()
  assert.equal((await anonymous("/api/familias/inscripciones", post({}))).status, 401)
  assert.equal((await anonymous("/api/familias/inscripciones")).status, 401)
  const available = await (await anonymous("/api/eventos/disponibles")).json()
  assert(available.eventos.some(e => e.id === a.id)); assert(!available.eventos.some(e => e.id === closed.id))
  assert.equal((await admin("/api/familias/inscripciones")).status, 401)

  const firstRequest = client(), firstChallenge = await challenge(firstRequest, "family1@example.com")
  assert.equal((await firstRequest("/api/familias/acceso", post({ correo: "family1@example.com" }))).status, 429)
  const wrong = firstChallenge.codigo === "000000" ? "000001" : "000000"
  assert(!(await signIn(firstRequest, "familias", { ...firstChallenge, codigo: wrong })))
  assert.equal((await signIn(firstRequest, "familias", firstChallenge)).role, "APODERADO")
  assert(!(await signIn(client(), "familias", firstChallenge)), "Código de un solo uso")
  const storedChallenge = (await db.query('SELECT * FROM "CodigoAccesoFamilia" WHERE correo=$1', ["family1@example.com"])).rows[0]
  assert.notEqual(storedChallenge.codigoHash, firstChallenge.codigo); assert.notEqual(storedChallenge.navegadorHash, firstChallenge.navegador)
  const f1 = { request: firstRequest, user: await session(firstRequest) }, f2 = await family("family2@example.com")
  assert.equal((await f1.request("/api/eventos")).status, 401)
  assert.equal((await f1.request(`/api/eventos/${a.id}/inscripciones`, { ...post({ abiertas: false }), method: "PATCH" })).status, 401)

  const expiry = client(), expiredChallenge = await challenge(expiry, "expired@example.com")
  await db.query('UPDATE "CodigoAccesoFamilia" SET "expiraAt"=$1 WHERE correo=$2', [new Date(Date.now() - 1000), "expired@example.com"])
  assert(!(await signIn(expiry, "familias", expiredChallenge)))
  const locked = client(), lockedChallenge = await challenge(locked, "locked@example.com")
  for (let n = 0; n < 5; n++) assert(!(await signIn(locked, "familias", { ...lockedChallenge, codigo: lockedChallenge.codigo === "000000" ? "000001" : "000000" })))
  assert(!(await signIn(locked, "familias", lockedChallenge)))
  failAll = true
  assert.equal((await anonymous("/api/familias/acceso", post({ correo: "mailfail@example.com" }))).status, 503)
  failAll = false
  assert((await db.query('SELECT "consumidoAt" FROM "CodigoAccesoFamilia" WHERE correo=$1', ["mailfail@example.com"])).rows[0].consumidoAt)
  console.log("OK acceso: código real de prueba, expiración, un solo uso, intentos limitados y fallo de envío sin sesión.")

  assert.equal((await f1.request("/api/familias/inscripciones", post(registration(closed)))).status, 409)
  assert.equal((await f1.request("/api/familias/inscripciones", post(registration(a, { rutBebe: "11111111-1" })))).status, 409)
  assert.equal((await db.query('SELECT "apoderadoId" FROM "Paciente" WHERE id=$1', ["legacy-baby"])).rows[0].apoderadoId, null)
  const payload = registration(a, { nombreBebe: "Bebé primero", rutApoderado: "12345678-5", correo: "intruso@example.com" })
  const response = await f1.request("/api/familias/inscripciones", post(payload)); assert.equal(response.status, 201)
  const first = (await response.json()).inscripcion
  assert.equal(first.numero, 1); assert.equal(first.correo.estado, "ENVIADO")
  assert(!JSON.stringify(first).includes("qrToken"))
  const confirmation = mails.filter(m => m.subject.startsWith("Inscripción")).at(-1)
  assert([].concat(confirmation.to).includes("family1@example.com")); assert(![].concat(confirmation.to).includes("intruso@example.com"))
  assert.equal(confirmation.attachments[0].content_id, "inscripcion-qr")
  const png = Buffer.from(confirmation.attachments[0].content, "base64")
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a")
  const qr = await f1.request(`/api/familias/inscripciones/${first.id}/qr`)
  assert.equal(qr.status, 200); assert(qr.headers.get("cache-control").includes("no-store"))
  assert.deepEqual(Buffer.from(await qr.arrayBuffer()), png)
  const token = (await db.query('SELECT "qrToken" FROM "Inscripcion" WHERE id=$1', [first.id])).rows[0].qrToken
  assert.deepEqual(png, await QRCode.toBuffer(`CASKU:INSCRIPCION:${token}`, { type: "png", width: 240, margin: 4, errorCorrectionLevel: "M" }))
  assert.equal((await f2.request(`/api/familias/inscripciones/${first.id}/qr`)).status, 404)
  assert.equal((await anonymous(`/api/familias/inscripciones/${first.id}/qr`)).status, 401)
  assert.equal((await f2.request(`/api/familias/inscripciones/${first.id}/correo`, post({}))).status, 404)
  const mailCount = mails.length
  const duplicate = await (await f1.request("/api/familias/inscripciones", post(payload))).json()
  assert.equal(duplicate.inscripcion.id, first.id); assert.equal(mails.length, mailCount)
  const duplicateNewKey = await (await f1.request("/api/familias/inscripciones", post({ ...payload, id: randomUUID() }))).json()
  assert.equal(duplicateNewKey.inscripcion.numero, 1)
  const second = await (await f1.request("/api/familias/inscripciones", post(registration(a, { nombreBebe: "Bebé segundo", rutApoderado: "12345678-5" })))).json()
  assert.equal(second.inscripcion.numero, 2)
  assert.equal((await f2.request("/api/familias/inscripciones", post(registration(a, { nombreBebe: "Sin cupo" })))).status, 409)
  assert(!(await (await anonymous("/api/eventos/disponibles")).json()).eventos.some(e => e.id === a.id))
  const own2 = await (await f2.request("/api/familias/inscripciones", post(registration(b, { nombreBebe: "Bebé de otra familia" })))).json()
  assert.equal(own2.inscripcion.numero, 1)
  const otherEvent = await (await f1.request("/api/familias/inscripciones", post(registration(b, { bebeId: first.bebe.id })))).json()
  assert.equal(otherEvent.inscripcion.numero, 2); assert.equal(otherEvent.inscripcion.bebe.id, first.bebe.id)
  assert.equal((await f2.request("/api/familias/inscripciones", post(registration(b, { bebeId: first.bebe.id })))).status, 409)
  assert(!(await (await f2.request("/api/familias/inscripciones")).json()).inscripciones.some(row => row.id === first.id))
  console.log("OK inscripción: bebés sin RUT, varios bebés, números por evento, cupos, reintentos y comprobante PNG privado adjunto al correo.")

  const c = await createEvent(admin, "Último cupo", 1)
  const race = await Promise.all([f1.request("/api/familias/inscripciones", post(registration(c, { bebeId: first.bebe.id }))), f2.request("/api/familias/inscripciones", post(registration(c, { bebeId: own2.inscripcion.bebe.id })))])
  assert.deepEqual(race.map(r => r.status).sort(), [201, 409])
  assert.equal((await db.query('SELECT inscritos FROM "Evento" WHERE id=$1', [c.id])).rows[0].inscritos, 1)

  failConfirmation = true
  const failedPayload = registration(b, { nombreBebe: "Bebé con correo pendiente" })
  const failedResponse = await f1.request("/api/familias/inscripciones", post(failedPayload)); assert.equal(failedResponse.status, 201)
  const failed = (await failedResponse.json()).inscripcion
  assert.equal(failed.correo.estado, "FALLIDO")
  assert.equal((await (await f1.request("/api/familias/inscripciones", post(failedPayload))).json()).inscripcion.numero, failed.numero)
  failConfirmation = false
  await db.query('UPDATE "CorreoInscripcion" SET "disponibleAt"=$1 WHERE "inscripcionId"=$2', [new Date(Date.now() - 1000), failed.id])
  const retry = await f1.request(`/api/familias/inscripciones/${failed.id}/correo`, post({})); assert.equal((await retry.json()).estado, "ENVIADO")
  const countAfterSent = mails.length
  await f1.request(`/api/familias/inscripciones/${failed.id}/correo`, post({})); assert.equal(mails.length, countAfterSent)
  // Simula pérdida de la respuesta del proveedor después de aceptar el correo.
  await db.query('UPDATE "CorreoInscripcion" SET estado=\'FALLIDO\', "disponibleAt"=$1 WHERE "inscripcionId"=$2', [new Date(Date.now() - 1000), failed.id])
  await f1.request(`/api/familias/inscripciones/${failed.id}/correo`, post({})); assert.equal(mails.length, countAfterSent)
  const actual = (await db.query('SELECT count(*)::int AS total FROM "Inscripcion" WHERE "eventoId"=$1', [b.id])).rows[0].total
  assert.equal((await db.query('SELECT inscritos FROM "Evento" WHERE id=$1', [b.id])).rows[0].inscritos, actual)
  const parentPage = await f1.request("/familias"); assert.equal(parentPage.status, 200); assert((await parentPage.text()).includes("Mis inscripciones"))
  assert.deepEqual((await clinicalSnapshot()).rows, before.rows)
  console.log("OK concurrencia y correo: último cupo protegido, fallos recuperables, idempotencia del envío y datos clínicos anteriores intactos.")
  await receptionChecks({ db, client, signIn, password, accounts: receptionAccounts, admin, anonymous, f1, a, b, first, second, own2, png, token, post, createEvent })
  assert.deepEqual((await clinicalSnapshot()).rows, before.rows)
  await kinesiologyChecks({ db, client, signIn, password, accounts: receptionAccounts, admin, anonymous, f1, a, b, first, second, post, mails })
  assert.deepEqual((await clinicalSnapshot()).rows, before.rows)
  await onsiteChecks({ db, client, signIn, password, accounts: receptionAccounts, admin, anonymous, f1, post, createEvent, mails, setMailFailure: value => { failConfirmation = value } })
  assert.deepEqual((await clinicalSnapshot()).rows, before.rows)
  await absenceChecks({ db, client, signIn, password, accounts: receptionAccounts, admin, anonymous, f1, post, createEvent, mails })
  assert.deepEqual((await clinicalSnapshot()).rows, before.rows)
  await resultsChecks({ db, client, signIn, password, accounts: receptionAccounts, admin, anonymous, f1, f2, post, createEvent, mails, setResultFailure: value => { failResults = value } })
  assert.deepEqual((await clinicalSnapshot()).rows, before.rows)
  console.log("Pruebas completas con PostgreSQL y correo locales. No se usó Neon ni se enviaron mensajes reales.")
} catch (error) { console.error(error); console.error(log.slice(-3000)); testFailed = true }
finally {
  if (child && !exited) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), pause(5000)]) }
  mailServer.closeAllConnections(); await new Promise(resolve => mailServer.close(resolve)); await socket.stop(); await db.close()
}

// El cierre de la base WASM puede modificar exitCode: aplicar el resultado al final.
if (testFailed) process.exitCode = 1
