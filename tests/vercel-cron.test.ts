import test from "node:test"
import assert from "node:assert/strict"
import { runVercelRecoveryCron } from "../src/lib/team-passwords/vercel-cron.ts"
const env = { VERCEL_ENV: "production", CASKU_PASSWORD_RECOVERY_ENABLED: "1", CRON_SECRET: "c".repeat(48), CASKU_PASSWORD_RECOVERY_WORKER_SECRET: "w".repeat(48) }
const request = (authorization = `Bearer ${env.CRON_SECRET}`) => new Request("https://example.test/api/interno/recuperaciones/cron", { headers: { authorization, "user-agent": "vercel-cron/1.0" } })

test("cron Vercel: rechaza solicitudes y configuración sin credenciales antes de invocar el procesador", async () => {
  let calls = 0
  const process = async () => { calls++; return Response.json({}) }
  for (const authorization of ["", "Bearer incorrecto", `Bearer ${env.CRON_SECRET}x`, `Bearer ${env.CASKU_PASSWORD_RECOVERY_WORKER_SECRET}`]) {
    assert.equal((await runVercelRecoveryCron(request(authorization), env, process)).status, 401)
  }
  for (const CRON_SECRET of [undefined, "", "corto"]) assert.equal((await runVercelRecoveryCron(request(), { ...env, CRON_SECRET }, process)).status, 401)
  assert.equal(calls, 0)
})

test("cron Vercel: preview, desarrollo y recuperación desactivada nunca procesan la cola", async () => {
  let calls = 0
  const process = async () => { calls++; return Response.json({}) }
  for (const VERCEL_ENV of [undefined, "preview", "development"]) {
    const response = await runVercelRecoveryCron(request(), { ...env, VERCEL_ENV }, process)
    assert.deepEqual(await response.json(), { estado: "DESACTIVADO" })
    assert.equal(response.headers.get("cache-control"), "no-store")
  }
  await runVercelRecoveryCron(request(), { ...env, CASKU_PASSWORD_RECOVERY_ENABLED: "0" }, process)
  assert.equal(calls, 0)
})

test("cron Vercel: usa el procesador POST con su secreto independiente y conserva su respuesta", async () => {
  let calls = 0
  const response = await runVercelRecoveryCron(request(), env, async internal => {
    calls++
    assert.equal(internal.method, "POST")
    assert.equal(internal.headers.get("authorization"), `Bearer ${env.CASKU_PASSWORD_RECOVERY_WORKER_SECRET}`)
    assert.equal(new URL(internal.url).hostname, "internal.invalid")
    return Response.json({ procesadas: 1 }, { status: 200, headers: { "Cache-Control": "no-store" } })
  })
  assert.equal(calls, 1)
  assert.deepEqual(await response.json(), { procesadas: 1 })
  assert.equal(response.headers.get("cache-control"), "no-store")
  const failed = await runVercelRecoveryCron(request(), env, async () => Response.json({ error: "Lote fallido" }, { status: 503 }))
  assert.equal(failed.status, 503)
})

test("cron Vercel: configuración inválida y excepciones no filtran claves ni procesan sin autorización", async () => {
  let calls = 0
  for (const worker of ["", "corto", env.CRON_SECRET]) {
    const response = await runVercelRecoveryCron(request(), { ...env, CASKU_PASSWORD_RECOVERY_WORKER_SECRET: worker }, async () => { calls++; return Response.json({}) })
    assert.equal(response.status, 503)
  }
  assert.equal(calls, 0)
  const response = await runVercelRecoveryCron(request(), env, async () => { throw new Error(env.CASKU_PASSWORD_RECOVERY_WORKER_SECRET) })
  assert.equal(response.status, 503)
  const output = await response.text()
  assert(!output.includes(env.CRON_SECRET))
  assert(!output.includes(env.CASKU_PASSWORD_RECOVERY_WORKER_SECRET))
})

test("cron Vercel: HEAD y POST no disparan procesamiento a través del adaptador GET", async () => {
 let calls = 0
 for (const method of ["HEAD", "POST"]) {
  const request = new Request("https://example.test/cron", { method, headers: { authorization: `Bearer ${env.CRON_SECRET}` } })
  const response = await runVercelRecoveryCron(request, env, async () => { calls++; return Response.json({}) })
  assert.equal(response.status, 405)
 }
 assert.equal(calls, 0)
})
