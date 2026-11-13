import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { readFile } from "node:fs/promises"
const env = {
  ...process.env,
  NODE_ENV: "production",
  CASKU_PRODUCTION_TEST: "1",
  CASKU_TEST_MODE: "0",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:1/casku_build?sslmode=disable&connect_timeout=1",
  AUTH_SECRET: randomBytes(32).toString("base64url"),
  AUTH_URL: "http://localhost:3120",
  NEXTAUTH_URL: "http://localhost:3120",
  RESEND_API_KEY: "re_local_test_only",
  RESEND_FROM: "Casku <test@example.com>",
  CASKU_TEAM_ACCOUNTS: "[]",
}
async function run(args) {
  const child = spawn(process.execPath, args, {env, stdio:"inherit"})
  const code = await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",(code,signal)=>resolve(signal ? 1 : code))})
  assert.equal(code,0,`Falló la comprobación: ${args.join(" ")}`)
}
if (!process.argv.includes("--skip-build")) {
  await run(["node_modules/prisma/build/index.js","generate"])
  await run(["node_modules/next/dist/bin/next","build"])
}
assert((await readFile(".next-production-tests/BUILD_ID","utf8")).trim())
await run(["tests/http-smoke.mjs","--production"])
await run(["tests/families-http.mjs","--production",...(process.argv.includes("--devices")?["--devices"]:[])])
console.log("OK producción: compilación aislada, recursos, acceso por perfil y recorridos familiares sobre next start, sin usar la base ni el correo reales.")
