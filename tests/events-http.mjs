import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { randomBytes, randomUUID } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { setTimeout as pause } from "node:timers/promises"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { hashPassword } from "../src/lib/passwords.mjs"

// PostgreSQL efímero. Nunca toma DATABASE_URL del entorno ni escribe en Neon.
const db = new PGlite()
const socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0 })
const base = "http://localhost:3118", password = randomBytes(20).toString("base64url")
let child, exited = false, log = ""
function client() {
  const cookies = new Map()
  return async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, redirect: "manual", signal: AbortSignal.timeout(45000), headers: { ...options.headers, cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } })
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], at = pair.indexOf("="); cookies.set(pair.slice(0, at), pair.slice(at + 1)) }
    return response
  }
}
const post = body => ({ method: "POST", headers: { "Content-Type": "application/json", origin: base }, body: JSON.stringify(body) })
async function login(account) {
  const request = client()
  const { csrfToken } = await (await request("/api/auth/csrf")).json()
  await request("/api/auth/callback/equipo", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", origin: base }, body: new URLSearchParams({ csrfToken, email: account.email, password, callbackUrl: base + "/panel" }) })
  assert.equal((await (await request("/api/auth/session")).json()).user.role, account.role)
  return request
}
try {
  await db.waitReady
  const migrations = (await readdir("prisma/migrations", { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort()
  for (const migration of migrations.filter(name => name < "20261109000100_eventos")) await db.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"))
  await db.exec(`INSERT INTO "Paciente" ("id","rut","nombre","fechaNacimiento") VALUES ('legacy-patient','12345678-9','Paciente ficticio previo','2026-01-01');
    INSERT INTO "Evaluacion" ("id","pacienteId","correoPadre","anteroposterior","biparietal","diagonalIzq","diagonalDer","indiceCraneal","indiceAsimetria","diagnostico","recomendacion","kinesiologa") VALUES ('legacy-evaluation','legacy-patient','test@example.com',140,120,135,138,85.7,3,'Ejemplo','Ejemplo','Profesional de prueba');`)
  const before = await db.query(`SELECT to_jsonb(p) - 'apoderadoId' - 'nombreNormalizado' AS row FROM "Paciente" p UNION ALL SELECT to_jsonb(e) - 'filaId' - 'autorId' - 'revision' FROM "Evaluacion" e`)
  for (const migration of migrations.filter(name => name >= "20261109000100_eventos")) await db.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"))
  assert.deepEqual((await db.query(`SELECT to_jsonb(p) - 'apoderadoId' - 'nombreNormalizado' AS row FROM "Paciente" p UNION ALL SELECT to_jsonb(e) - 'filaId' - 'autorId' - 'revision' FROM "Evaluacion" e`)).rows, before.rows)
  console.log("OK migración: conserva intactos paciente y evaluación anteriores.")
  await socket.start()
  const accounts = await Promise.all(["ADMIN", "ADMIN", "RECEPCION", "KINESIOLOGO"].map(async (role, i) => ({ id: `events-${i}`, email: `events-${i}@example.com`, name: `Prueba ${i}`, role, active: true, passwordHash: await hashPassword(password) })))
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "3118"], {
    cwd: process.cwd(), env: { ...process.env, CASKU_TEST_MODE: "1", NODE_DISABLE_COMPILE_CACHE: "1", CASKU_TEAM_ACCOUNTS: JSON.stringify(accounts), AUTH_SECRET: randomBytes(32).toString("base64url"), AUTH_URL: base, NEXTAUTH_URL: base, AUTH_TRUST_HOST: "true", DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?sslmode=disable` }, stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout.on("data", value => { log = (log + value).slice(-12000) }); child.stderr.on("data", value => { log = (log + value).slice(-12000) }); child.on("exit", () => { exited = true })
  let ready = false
  for (const started = Date.now(); Date.now() - started < 180000;) {
    if (exited) throw new Error("El servidor de pruebas no inició: " + log)
    try { if ((await fetch(base + "/api/auth/csrf", { signal: AbortSignal.timeout(5000) })).ok) { ready = true; break } } catch {}
    await pause(200)
  }
  assert(ready, "El servidor no inició a tiempo.")
  const anonymous = client()
  assert.equal((await anonymous("/api/eventos")).status, 401)
  assert.equal((await anonymous("/api/eventos", post({}))).status, 401)
  assert.equal((await anonymous("/api/eventos/seleccion", post({}))).status, 401)
  for (const account of accounts.slice(2)) {
    const request = await login(account)
    assert.equal((await request("/api/eventos")).status, 403)
    assert.equal((await request("/api/eventos", post({}))).status, 403)
    assert.equal((await request("/api/eventos/seleccion", post({}))).status, 403)
  }
  console.log("OK permisos: anónimos, recepción y kinesiología no gestionan eventos.")
  const admin = await login(accounts[0]), otherAdmin = await login(accounts[1])
  assert.deepEqual(await (await admin("/api/eventos")).json(), { eventos: [], seleccionadoId: null })
  const event = { id: randomUUID(), nombre: "Evento de prueba A", fecha: "2026-12-01", lugar: "Recinto ficticio A", cupos: 80 }
  const createdResponse = await admin("/api/eventos", post({ ...event, creadoPorId: accounts[1].id }))
  assert.equal(createdResponse.status, 201)
  const created = await createdResponse.json()
  assert.equal(created.evento.fecha, "2026-12-01"); assert.equal(created.seleccionadoId, event.id)
  assert.equal((await admin("/api/eventos", post(event))).status, 201)
  assert.equal((await db.query('SELECT count(*)::int AS total FROM "Evento"')).rows[0].total, 1)
  assert.equal((await db.query('SELECT "creadoPorId" FROM "Evento" WHERE id=$1', [event.id])).rows[0].creadoPorId, accounts[0].id)
  assert.equal((await admin("/api/eventos", post({ ...event, nombre: "Contenido cambiado" }))).status, 409)
  assert.equal((await admin("/api/eventos", post({ ...event, id: randomUUID(), cupos: -2 }))).status, 400)
  assert.equal((await admin("/api/eventos", post({ ...event, id: randomUUID(), fecha: "2026-02-30" }))).status, 400)
  assert.equal((await admin("/api/eventos", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status, 400)
  assert.equal((await admin("/api/eventos", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(event) })).status, 400)
  const second = { ...event, id: randomUUID(), nombre: "Evento de prueba B", fecha: "2027-01-02", cupos: 120 }
  assert.equal((await otherAdmin("/api/eventos", post(second))).status, 201)
  assert.equal((await admin("/api/eventos/seleccion", post({ eventoId: second.id, usuarioId: accounts[1].id }))).status, 200)
  assert.equal((await otherAdmin("/api/eventos/seleccion", post({ eventoId: event.id }))).status, 200)
  const own = await (await admin("/api/eventos")).json(), other = await (await otherAdmin("/api/eventos")).json()
  assert.equal(own.seleccionadoId, second.id); assert.equal(other.seleccionadoId, event.id)
  assert.equal(own.eventos.length, 2)
  assert.equal((await admin("/api/eventos/seleccion", post({ eventoId: randomUUID() }))).status, 404)
  assert.equal((await (await admin("/api/eventos")).json()).seleccionadoId, second.id)
  const relogged = await login(accounts[0])
  assert.equal((await (await relogged("/api/eventos")).json()).seleccionadoId, second.id)
  console.log("OK eventos: creación, fecha, cupos, reintentos sin duplicación y selección persistida por cuenta.")

  // Una selección fallida debe deshacer también la creación del evento.
  await db.exec(`CREATE FUNCTION test_reject_selection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test selection failure'; END; $$;
    CREATE TRIGGER test_reject_selection BEFORE INSERT OR UPDATE ON "EventoSeleccionado" FOR EACH ROW EXECUTE FUNCTION test_reject_selection();`)
  const atomicId = randomUUID()
  assert.equal((await admin("/api/eventos", post({ ...event, id: atomicId }))).status, 503)
  assert.equal((await db.query('SELECT count(*)::int AS total FROM "Evento" WHERE id=$1', [atomicId])).rows[0].total, 0)
  await db.exec('DROP TRIGGER test_reject_selection ON "EventoSeleccionado"; DROP FUNCTION test_reject_selection();')
  await assert.rejects(db.query('UPDATE "Evento" SET cupos=0 WHERE id=$1', [event.id]))
  assert.deepEqual((await db.query(`SELECT to_jsonb(p) - 'apoderadoId' - 'nombreNormalizado' AS row FROM "Paciente" p UNION ALL SELECT to_jsonb(e) - 'filaId' - 'autorId' - 'revision' FROM "Evaluacion" e`)).rows, before.rows)
  const page = await admin("/administracion")
  assert.equal(page.status, 200); assert((await page.text()).includes("Crear evento"))
  console.log("OK atomicidad y restricciones: no quedan eventos a medio crear ni se alteran datos clínicos.")
  console.log("Pruebas completas en PostgreSQL temporal. No se usó Neon ni se enviaron correos.")
} catch (error) { console.error(error); console.error(log); process.exitCode = 1 }
finally {
  if (child && !exited) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), pause(5000)]) }
  await socket.stop(); await db.close()
}
