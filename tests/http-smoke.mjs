import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { setTimeout as pause } from "node:timers/promises"
import { hashPassword } from "../src/lib/passwords.mjs"
const base = "http://localhost:3117", password = randomBytes(20).toString("base64url")
const accounts = await Promise.all(["KINESIOLOGO", "RECEPCION", "ADMIN"].map(async role => ({ id: `smoke-${role}`, email: `${role.toLowerCase()}@example.com`, name: `Prueba ${role}`, role, active: true, passwordHash: await hashPassword(password) })))
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "3117"], {
  cwd: process.cwd(), env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: "1", CASKU_TEAM_ACCOUNTS: JSON.stringify(accounts), AUTH_SECRET: randomBytes(32).toString("base64url"), AUTH_URL: base, NEXTAUTH_URL: base, AUTH_TRUST_HOST: "true", DATABASE_URL: "postgresql://smoke:smoke@127.0.0.1:1/smoke?connect_timeout=1" }, stdio: ["ignore", "pipe", "pipe"],
})
let log = "", exited = false
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
    assert((await page.text()).includes("casku"))
    const { csrfToken: signoutToken } = await (await request("/api/auth/csrf")).json()
    await request("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", origin: base }, body: new URLSearchParams({ csrfToken: signoutToken, callbackUrl: base + "/login" }) })
    assert(!(await (await request("/api/auth/session")).json())?.user)
    console.log(`OK HTTP: ${account.role}, permisos y cierre de sesión.`)
  }
  console.log("Pruebas HTTP completas. No se usó la base real ni se enviaron correos.")
} catch (error) { console.error(error); console.error(log); process.exitCode = 1 }
finally { child.kill("SIGTERM") }
