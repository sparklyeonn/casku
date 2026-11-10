import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { randomBytes, createHmac, createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { setTimeout as pause } from "node:timers/promises"
import { protocolGate } from "./pglite-protocol-gate.mjs"
import { Pool } from "pg"
import { encode, decode } from "next-auth/jwt"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { hashPassword } from "../src/lib/passwords.mjs"
const embedded = new PGlite(), socket = new PGLiteSocketServer({ db: embedded, host: "127.0.0.1", port: 0, maxConnections: 20 })
const secret = randomBytes(32).toString("base64url"), password = randomBytes(20).toString("base64url"), bases = ["http://localhost:3130", "http://localhost:3131"]
const accounts = await Promise.all(["ADMIN", "RECEPCION", "KINESIOLOGO", "RECEPCION"].map(async (role, index) => ({ id: `security-${index}`, email: `security-${index}@example.com`, name: `Prueba seguridad ${index}`, role, active: true, passwordHash: await hashPassword(password) })))
let db, gate, failed = false
const children = [], logs = ["", ""]
const hash = value => createHmac("sha256", secret).update(value).digest("hex")
const accountKey = email => hash(`team-auth:account:${email.toLowerCase().trim()}`), globalKey = hash("team-auth:global")
function client(initial = []) {
  const cookies = new Map(initial)
  const request = async (path, options = {}, instance = 0) => {
    const response = await fetch(bases[instance] + path, { ...options, redirect: "manual", signal: AbortSignal.timeout(60000), headers: { ...options.headers, cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } })
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], at = pair.indexOf("="); cookies.set(pair.slice(0, at), pair.slice(at + 1)) }
    return response
  }
  request.copy = () => client([...cookies]); request.cookies = cookies
  return request
}
const post = value => ({ method: "POST", headers: { "Content-Type": "application/json", origin: bases[0] }, body: JSON.stringify(value) })
async function login(request, account, input = password, instance = 0, email = account.email) {
  const { csrfToken } = await (await request("/api/auth/csrf", {}, instance)).json()
  const response = await request("/api/auth/callback/equipo", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", origin: bases[0] }, body: new URLSearchParams({ csrfToken, email, password: input, callbackUrl: bases[0] + "/panel" }) }, instance)
  assert.equal(response.status, 200)
  return (await response.json()).url
}
async function signed(account, instance = 0) {
  const request = client(); await login(request, account, password, instance)
  assert.equal((await session(request, instance))?.user?.id, account.id)
  return request
}
const session = async (request, instance = 0) => (await request("/api/auth/session", {}, instance)).json()
const sessions = async (request, instance = 0) => (await request("/api/equipo/sesiones", {}, instance)).json()
const expireLimit = async email => db.query('UPDATE "LimiteSolicitud" SET "expiraAt"=now()-interval \'1 second\' WHERE clave=$1', [accountKey(email)])
async function start(index) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(3130 + index)], { cwd: process.cwd(), env: { ...process.env, CASKU_TEST_MODE: "1", CASKU_TEST_INSTANCE: index ? "secondary" : "primary", NODE_DISABLE_COMPILE_CACHE: "1", CASKU_TEAM_ACCOUNTS: JSON.stringify(accounts), AUTH_SECRET: secret, AUTH_URL: bases[0], NEXTAUTH_URL: bases[0], AUTH_TRUST_HOST: "true", DATABASE_URL: `postgresql://postgres:postgres@${`127.0.0.1:${gate.port}`}/postgres?sslmode=disable` }, stdio: ["ignore", "pipe", "pipe"] })
  children[index] = child
  child.stdout.on("data", value => { logs[index] = (logs[index] + value).slice(-7000) }); child.stderr.on("data", value => { logs[index] = (logs[index] + value).slice(-7000) })
  for (const start = Date.now(); Date.now() - start < 180000;) {
    if (child.exitCode !== null) throw new Error("No inició el servidor temporal")
    try { if ((await fetch(bases[index] + "/api/auth/csrf", { signal: AbortSignal.timeout(3000) })).ok) return } catch {}
    await pause(200)
  }
  throw new Error("El servidor no respondió")
}
async function stop(index) { const child = children[index]; if (child && child.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), pause(5000)]) } }
try {
  await embedded.waitReady
  for (const migration of (await readdir("prisma/migrations", { withFileTypes: true })).filter(row => row.isDirectory()).map(row => row.name).sort()) {
    if (migration === "20261110000500_seguridad_equipo") await embedded.query('INSERT INTO "CuentaEquipo" (id,email,name,role,"passwordHash",active,version,"updatedAt") VALUES (\'previous-security\',\'previous@example.com\',\'Cuenta anterior\',\'ADMIN\',$1,true,7,CURRENT_TIMESTAMP)', [accounts[0].passwordHash])
    const before = migration === "20261110000500_seguridad_equipo" ? (await embedded.query('SELECT to_jsonb(c) row FROM "CuentaEquipo" c WHERE id=\'previous-security\'')).rows : null
    await embedded.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"))
    if (before) { assert.deepEqual((await embedded.query('SELECT to_jsonb(c) row FROM "CuentaEquipo" c WHERE id=\'previous-security\'')).rows, before); assert.equal((await embedded.query('SELECT count(*)::int n FROM "SesionEquipo"')).rows[0].n, 0) }
  }
  await socket.start(); gate = await protocolGate({ host: "127.0.0.1", port: Number(socket.getServerConn().split(":").at(-1)) }); db = new Pool({ host: "127.0.0.1", port: gate.port, user: "postgres", password: "postgres", database: "postgres", max: 1 })
  await start(0); await start(1)
  const anonymous = client()
  assert.equal((await anonymous("/api/equipo/sesiones")).status, 401)
  const noCsrf = client()
  await noCsrf("/api/auth/callback/equipo", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", origin: bases[0] }, body: new URLSearchParams({ csrfToken: "forged", email: accounts[0].email, password }) })
  assert(!(await session(noCsrf))?.user)
  assert.equal((await anonymous("/api/equipo/sesiones", post({ accion: "CERRAR_TODAS" }))).status, 401)
  // Termina la importación inicial y compila ambos callbacks antes de aplicar carga.
  // Así la prueba de contadores no compite con el arranque del adaptador temporal.
  await signed(accounts[0])
  await login(client(), { email: "warmup@example.com" }, "incorrecta", 1)
  // Same account, mixed casing, simultaneous requests handled by both processes.
  const attackers = Array.from({ length: 10 }, () => client())
  const denied = await Promise.all(attackers.map((request, i) => login(request, accounts[1], "contraseña incorrecta", i % 2, i % 2 ? " SECURITY-1@EXAMPLE.COM " : accounts[1].email)))
  assert(denied.every(url => url.includes("error=")))
  assert.equal((await db.query('SELECT cantidad FROM "LimiteSolicitud" WHERE clave=$1', [accountKey(accounts[1].email)])).rows[0].cantidad, 6)
  const blocked = client(); assert((await login(blocked, accounts[1], password, 1)).includes("error=")); assert(!(await session(blocked, 1))?.user)
  await stop(0); await start(0)
  assert((await login(client(), accounts[1])).includes("error="), "Reiniciar un servidor no borra el bloqueo")
  await expireLimit(accounts[1].email)
  const reception = await signed(accounts[1], 1)
  assert.equal((await db.query('SELECT cantidad FROM "LimiteSolicitud" WHERE clave=$1', [accountKey(accounts[1].email)])).rows[0].cantidad, 0)
  // A successful attempt releases its own reservation, never other failures.
  await expireLimit(accounts[3].email)
  await login(client(), accounts[3], "incorrecta")
  const right = await signed(accounts[3])
  assert.equal((await db.query('SELECT cantidad FROM "LimiteSolicitud" WHERE clave=$1', [accountKey(accounts[3].email)])).rows[0].cantidad, 1)
  const missing = { email: "missing@example.com" }
  assert((await login(client(), missing, "incorrecta")).includes("error="))
  assert.equal((await db.query('SELECT count(*)::int n FROM "LimiteSolicitud" WHERE clave LIKE \'%example.com%\'')).rows[0].n, 0)
  assert.equal((await db.query('SELECT count(*)::int n FROM "SesionEquipo" WHERE "cuentaId"=$1', [accounts[1].id])).rows[0].n, 1)
  console.log("OK límites compartidos: dos procesos, concurrencia, normalización, reinicio, ventana fija, éxito sin borrar otros fallos y claves privadas.")

  const admin = await signed(accounts[0]), kine = await signed(accounts[2]), other = await signed(accounts[1])
  const securityPage = await admin("/seguridad"); assert.equal(securityPage.status, 200); assert((await securityPage.text()).includes("Seguridad y sesiones"))
  const receptionRows = await sessions(reception, 1), ownId = receptionRows.sesiones.find(row => row.actual).id, otherId = receptionRows.sesiones.find(row => !row.actual).id
  const decoded = await decode({ secret, salt: "authjs.session-token", token: reception.cookies.get("authjs.session-token") })
  const stored = (await db.query('SELECT "secretoHash" FROM "SesionEquipo" WHERE id=$1', [ownId])).rows[0].secretoHash
  assert.notEqual(stored, decoded.teamSessionToken); assert.equal(stored, hash(`team-session:${decoded.teamSessionToken}`))
  assert.equal((await reception("/api/equipo/sesiones", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" })).status, 400)
  assert(!JSON.stringify(receptionRows).includes("secretoHash")); assert(!JSON.stringify(await session(reception, 1)).includes("teamSessionToken"))
  assert.equal((await reception("/api/equipo/sesiones", post({ accion: "CERRAR_UNA", sesionId: (await sessions(admin)).sesiones[0].id }))).status, 404)
  const oldCookie = other.copy()
  assert.equal((await reception("/api/equipo/sesiones", post({ accion: "CERRAR_UNA", sesionId: otherId }))).status, 200)
  assert(!(await session(other, 1))?.user); assert(!(await session(oldCookie))?.user)
  assert.equal((await oldCookie("/api/evaluaciones", post({}))).status, 401)
  assert.equal((await session(reception, 0)).user.id, accounts[1].id)
  // Normal signout also revokes the server record; a copied cookie cannot return.
  const cloned = right.copy(), { csrfToken } = await (await right("/api/auth/csrf")).json()
  await right("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", origin: bases[0] }, body: new URLSearchParams({ csrfToken, callbackUrl: bases[0] + "/login" }) })
  assert(!(await session(cloned, 1))?.user)
  const headerLogout = await signed(accounts[3]), headerCopy = headerLogout.copy()
  assert.equal((await headerLogout("/api/equipo/sesiones", post({ accion: "CERRAR_ACTUAL" }))).status, 200)
  assert(!(await session(headerCopy, 1))?.user)
  // Updating a JWT session cannot inject another session or extend the absolute deadline.
  const beforeExpiry = (await db.query('SELECT "expiraAt" FROM "SesionEquipo" WHERE id=$1', [ownId])).rows[0].expiraAt
  const { csrfToken: updateCsrf } = await (await reception("/api/auth/csrf")).json()
  await reception("/api/auth/session", post({ csrfToken: updateCsrf, data: { teamSessionToken: "forged", teamExpiresAt: "2099-01-01", role: "ADMIN" } }))
  assert.equal((await session(reception)).user.role, "RECEPCION")
  assert.equal((await db.query('SELECT "expiraAt" FROM "SesionEquipo" WHERE id=$1', [ownId])).rows[0].expiraAt.getTime(), beforeExpiry.getTime())
  const legacy = client(), legacyToken = await encode({ secret, salt: "authjs.session-token", token: { id: accounts[2].id, role: "KINESIOLOGO", revision: createHash("sha256").update(`${accounts[2].id}:${accounts[2].role}:${accounts[2].passwordHash}`).digest("hex") + ":1", teamVersion: 1 }, maxAge: 3600 })
  legacy.cookies.set("authjs.session-token", legacyToken); assert(!(await session(legacy))?.user)
  await db.query('UPDATE "SesionEquipo" SET "actividadAt"=now()-interval \'31 minutes\',"createdAt"=now()-interval \'1 hour\' WHERE id=$1', [ownId])
  assert(!(await session(reception, 1))?.user)
  const absolute = await signed(accounts[1]), absoluteId = (await sessions(absolute)).sesiones.find(row => row.actual).id
  await db.query('UPDATE "SesionEquipo" SET "expiraAt"=now()-interval \'1 minute\',"createdAt"=now()-interval \'9 hours\' WHERE id=$1', [absoluteId])
  assert(!(await session(absolute, 1))?.user)
  console.log("OK sesiones: cierre remoto y normal entre servidores, cookie copiada inválida, propiedad, JWT no manipulable y vencimientos fijo/inactividad.")

  const devices = Array.from({ length: 6 }, () => client())
  await Promise.all(devices.map((request, index) => login(request, accounts[2], password, index % 2)))
  const deviceStates = await Promise.all(devices.map((request, index) => session(request, index % 2)))
  assert.equal(deviceStates.filter(value => value?.user).length, 5)
  const live = devices.find((_, index) => deviceStates[index]?.user); assert.equal((await sessions(live)).sesiones.length, 5)
  assert.equal((await live("/api/equipo/sesiones", post({ accion: "CERRAR_TODAS" }))).status, 200)
  for (const device of devices) assert(!(await session(device, 1))?.user)
  const target = await signed(accounts[1])
  const list = await (await admin("/api/administracion/cuentas")).json(), account = list.cuentas.find(row => row.id === accounts[1].id)
  const url = `/api/administracion/cuentas/${account.id}/sesiones`
  assert.equal((await target(url, post({ version: account.version }))).status, 403)
  assert.equal((await kine(url, post({ version: account.version }))).status, 401)
  await db.query(`CREATE FUNCTION fail_security_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion='CERRAR_SESIONES' THEN RAISE EXCEPTION 'local fixture'; END IF; RETURN NEW; END $$`)
  await db.query('CREATE TRIGGER security_audit BEFORE INSERT ON "CambioCuentaEquipo" FOR EACH ROW EXECUTE FUNCTION fail_security_audit()')
  assert.equal((await admin(url, post({ version: account.version }))).status, 503)
  assert.equal((await session(target, 1)).user.id, accounts[1].id)
  assert.equal((await db.query('SELECT version FROM "CuentaEquipo" WHERE id=$1', [account.id])).rows[0].version, account.version)
  await db.query('DROP TRIGGER security_audit ON "CambioCuentaEquipo"'); await db.query('DROP FUNCTION fail_security_audit()')
  assert.equal((await admin(url, post({ version: account.version }))).status, 200)
  assert(!(await session(target, 1))?.user)
  assert.equal((await admin(url, post({ version: account.version }))).status, 409)
  assert.equal((await db.query('SELECT count(*)::int n FROM "CambioCuentaEquipo" WHERE "cuentaId"=$1 AND accion=\'CERRAR_SESIONES\'', [account.id])).rows[0].n, 1)
  const outageCookie = admin.copy()
  await db.query('ALTER TABLE "SesionEquipo" RENAME TO "TestUnavailableSession"')
  assert.equal((await outageCookie("/api/equipo/sesiones")).status, 401)
  await db.query('ALTER TABLE "TestUnavailableSession" RENAME TO "SesionEquipo"')
  // A database error denies access; no process-local bypass or session creation.
  await expireLimit(accounts[1].email)
  await db.query('UPDATE "LimiteSolicitud" SET "expiraAt"=now()-interval \'1 second\' WHERE clave=$1', [globalKey])
  const beforeCount = (await db.query('SELECT count(*)::int n FROM "SesionEquipo"')).rows[0].n
  await db.query('ALTER TABLE "LimiteSolicitud" RENAME TO "TestUnavailableLimit"')
  assert((await login(client(), accounts[1])).includes("error="))
  await db.query('ALTER TABLE "TestUnavailableLimit" RENAME TO "LimiteSolicitud"')
  assert.equal((await db.query('SELECT count(*)::int n FROM "SesionEquipo"')).rows[0].n, beforeCount)
  // Shared global cap bounds requests with invented addresses.
  await db.query('INSERT INTO "LimiteSolicitud" (clave,cantidad,"expiraAt") VALUES ($1,60,now()+interval \'1 minute\') ON CONFLICT(clave) DO UPDATE SET cantidad=60,"expiraAt"=now()+interval \'1 minute\'', [globalKey])
  assert((await login(client(), accounts[1])).includes("error="))
  assert((await login(client(), { email: "another-missing@example.com" }, "incorrecta", 1)).includes("error="))
  assert.equal((await db.query('SELECT count(*)::int n FROM "LimiteSolicitud" WHERE clave=$1', [accountKey("another-missing@example.com")])).rows[0].n, 0)
  console.log("OK control: máximo de sesiones, cierre total, revocación administrativa auditada, versión obsoleta, errores de base sin acceso y límite global compartido.")
  console.log("Pruebas de seguridad completas con dos servidores, PostgreSQL temporal y sin correos ni datos reales.")
} catch (error) { failed = true; console.error(error); logs.forEach((log, index) => console.error(`Servidor ${index}: ${log.slice(-4000)}`)) }
finally { await stop(0); await stop(1); if (db) await db.end(); if (gate) await gate.close(); await socket.stop(); await embedded.close() }
if (failed) process.exitCode = 1
