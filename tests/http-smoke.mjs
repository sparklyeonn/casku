import { protocolGate } from "./pglite-protocol-gate.mjs"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { once } from "node:events"
import { setTimeout as pause } from "node:timers/promises"
import { hashPassword } from "../src/lib/passwords.mjs"
const production = process.argv.includes("--production")
const base = "http://localhost:3117", password = randomBytes(20).toString("base64url")
const accounts = await Promise.all(["KINESIOLOGO", "RECEPCION", "ADMIN"].map(async role => ({ id: `smoke-${role}`, email: `${role.toLowerCase()}@example.com`, name: `Prueba ${role}`, role, active: true, passwordHash: await hashPassword(password) })))
const db = new PGlite(), socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 20 })
await db.waitReady
for (const migration of (await readdir("prisma/migrations", { withFileTypes: true })).filter(value => value.isDirectory()).map(value => value.name).sort()) await db.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"))
await socket.start()
const gate = production ? await protocolGate({host:"127.0.0.1",port:Number(socket.getServerConn().split(":").at(-1))}) : null
const databaseHost = gate ? `127.0.0.1:${gate.port}` : socket.getServerConn()
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", production ? "start" : "dev", "--port", "3117"], {
  cwd: process.cwd(), env: { ...process.env, NODE_ENV: production ? "production" : "development", CASKU_PRODUCTION_TEST: production ? "1" : "0", CASKU_TEST_MODE: production ? "0" : "1", RESEND_API_KEY: "", RESEND_FROM: "", NODE_DISABLE_COMPILE_CACHE: "1", CASKU_TEAM_ACCOUNTS: JSON.stringify(accounts), AUTH_SECRET: randomBytes(32).toString("base64url"), AUTH_URL: base, NEXTAUTH_URL: base, AUTH_TRUST_HOST: "true", DATABASE_URL: `postgresql://postgres:postgres@${databaseHost}/postgres?sslmode=disable` }, stdio: ["ignore", "pipe", "pipe"],
})
let log = "", exited = false, testFailed = false
child.stdout.on("data", b => { log = (log + b).slice(-10000) }); child.stderr.on("data", b => { log = (log + b).slice(-10000) }); child.on("exit", () => { exited = true })
function client() {
  const cookies = new Map()
  return async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, redirect: "manual", signal: AbortSignal.timeout(45000), headers: { ...options.headers, cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } })
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], at = pair.indexOf("="); cookies.set(pair.slice(0, at), pair.slice(at + 1)) }
    return response
  }
}
try {
  let ready = false
  for (const started = Date.now(); Date.now() - started < 180000;) {
    if (exited) throw new Error("El servidor de pruebas no pudo iniciarse: " + log)
    try { if ((await fetch(base + "/api/auth/csrf", { signal: AbortSignal.timeout(5000) })).ok) { ready = true; break } } catch {}
    await pause(200)
  }
  assert(ready, "El servidor no inició a tiempo: " + log)
  const anonymous = client()
  if (production) {
    const home = await anonymous("/")
    assert.equal(home.status,200)
    const html = await home.text()
    const assets = [...html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g)].map(match=>match[1].replaceAll("&amp;","&"))
    assert(assets.some(path=>path.endsWith(".css")),"La página debe incluir estilos compilados")
    assert(assets.some(path=>path.endsWith(".js")),"La página debe incluir JavaScript compilado")
    for (const asset of new Set(assets)) {
      assert(asset.startsWith("/_next/static/"))
      const response=await anonymous(asset)
      assert.equal(response.status,200,asset)
      if (asset.endsWith(".css")) assert.match(response.headers.get("content-type") || "", /text\/css/)
      if (asset.endsWith(".js")) assert.match(response.headers.get("content-type") || "", /javascript/)
      assert((await response.arrayBuffer()).byteLength>0,asset)
    }
    assert.equal((await anonymous("/api/familias/acceso",{method:"POST",headers:{"Content-Type":"application/json",origin:base},body:JSON.stringify({correo:"sin-remitente@example.com"})})).status,503)
    console.log("OK producción: HTML, CSS y JavaScript compilados; códigos de acceso bloqueados sin remitente.")
  }
  assert.equal((await anonymous("/api/evaluaciones", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } })).status, 401)
  assert.equal((await anonymous("/api/historial")).status, 403)
  for (const account of accounts) {
    const request = client()
    const { csrfToken } = await (await request("/api/auth/csrf")).json()
    const login = await request("/api/auth/callback/equipo", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", origin: base }, body: new URLSearchParams({ csrfToken, email: account.email, password, callbackUrl: base + "/panel" }) })
    assert.equal(login.status, 200)
    const session = await (await request("/api/auth/session")).json()
    assert.equal(session.user?.role, account.role)
    const response = await request("/api/evaluaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    assert.equal(response.status, account.role === "KINESIOLOGO" ? 400 : 403)
    const page = await request(account.role === "KINESIOLOGO" ? "/evaluacion" : account.role === "ADMIN" ? "/administracion" : "/recepcion")
    assert.equal(page.status, 200)
    const pageHtml = await page.text()
    assert(pageHtml.includes("casku"), `No se mostró la vista autenticada: ${pageHtml.slice(-2500)}`)
    const { csrfToken: signoutToken } = await (await request("/api/auth/csrf")).json()
    await request("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", origin: base }, body: new URLSearchParams({ csrfToken: signoutToken, callbackUrl: base + "/login" }) })
    assert(!(await (await request("/api/auth/session")).json())?.user)
    console.log(`OK HTTP: ${account.role}, permisos y cierre de sesión.`)
  }
  console.log("Pruebas HTTP completas. No se usó la base real ni se enviaron correos.")
} catch (error) { console.error(error); console.error(log); testFailed = true }
finally { if (!exited) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), pause(5000)]) }; if (gate) await gate.close(); await socket.stop(); await db.close() }

if (testFailed) process.exitCode = 1
