import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import { config } from "dotenv"
import pg from "pg"
import { access, readFile } from "node:fs/promises"
import { chromium, webkit } from "@playwright/test"

config({path:[".env.local",".env"],quiet:true})
const mailOnly=process.argv.includes("--mail-only")
const source=process.env.CASKU_TEST_POSTGRES_ADMIN_URL || process.env.DATABASE_URL
assert(source,"Configura CASKU_TEST_POSTGRES_ADMIN_URL o DATABASE_URL; se creará otra base sin tocar sus tablas")
const name=`casku_test_${randomBytes(12).toString("hex")}`,marker=randomBytes(24).toString("hex")
const testUrl=new URL(source);testUrl.pathname=`/${name}`
const admin=new pg.Client({connectionString:source,connectionTimeoutMillis:20000})
let created=false,running,interrupted=false
function stopRun() {
  if (!running?.pid) return
  try { process.kill(-running.pid,"SIGTERM") } catch(error) { if(error.code!=="ESRCH") throw error }
}
const interrupt=()=>{interrupted=true;stopRun()}
process.on("SIGINT",interrupt);process.on("SIGTERM",interrupt)
async function run(args,env={}) {
  if(interrupted) throw new Error("Prueba interrumpida")
  const code=await new Promise((resolve,reject)=>{
    running=spawn(process.execPath,args,{stdio:"inherit",detached:true,env:{...process.env,...env}})
    const timer=setTimeout(stopRun,90*60*1000)
    running.once("error",error=>{clearTimeout(timer);reject(error)})
    running.once("exit",code=>{clearTimeout(timer);resolve(code)})
  })
  running=undefined
  assert.equal(code,0,"La batería de pruebas debe finalizar correctamente")
}
try {
  for (const engine of mailOnly?[]:[chromium,webkit]) await access(engine.executablePath())
  await admin.connect()
  const permissions=(await admin.query("SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user")).rows[0]
  assert(permissions.rolcreatedb,"La cuenta de pruebas necesita CREATE DATABASE; usa CASKU_TEST_POSTGRES_ADMIN_URL")
  // name/marker se generan aquí y contienen exclusivamente caracteres hexadecimales.
  await admin.query(`CREATE DATABASE "${name}"`);created=true
  await admin.query(`COMMENT ON DATABASE "${name}" IS '${marker}'`)
  if(!process.argv.includes("--skip-build")) {
    await run(["node_modules/prisma/build/index.js","generate"])
    if(!mailOnly) await run(["node_modules/next/dist/bin/next","build"],{NODE_ENV:"production",CASKU_PRODUCTION_TEST:"1",CASKU_TEST_MODE:"0",DATABASE_URL:"postgresql://postgres:postgres@127.0.0.1:1/not_used",CASKU_TEAM_ACCOUNTS:"[]",AUTH_SECRET:randomBytes(32).toString("base64url"),AUTH_URL:"http://localhost:3120",NEXTAUTH_URL:"http://localhost:3120",BREVO_API_KEY:"brevo_local_test_only",BREVO_SENDER_EMAIL:"test@example.com",BREVO_SENDER_VERIFIED:"1",CASKU_MAIL_ENABLED:"1",CASKU_MAIL_DELIVERY_SECRET:randomBytes(32).toString("base64url"),CASKU_MAIL_AUTOMATION:"0"})
  }
  if(!mailOnly) assert((await readFile(".next-production-tests/BUILD_ID","utf8")).trim(),"Compila primero; --skip-build solo reutiliza una compilación ya verificada")
  await run(mailOnly?["--experimental-strip-types","tests/brevo-delivery.mjs","--postgres"]:["tests/families-http.mjs","--production","--postgres",...(process.argv.includes("--queue-only")?["--queue-only"]:[])],{CASKU_REAL_TEST_URL:testUrl.href,CASKU_REAL_TEST_MARKER:marker,CASKU_REAL_TEST_PORT:process.env.CASKU_REAL_TEST_PORT || "3120"})
} catch(error) {
  // No imprimir objetos pg completos: pueden contener datos de conexión.
  console.error(`Prueba PostgreSQL: ${error.code || error.name}. ${error instanceof assert.AssertionError?error.message:"No se completó; revisa permisos, conectividad o la salida de pruebas anterior. Instala los navegadores con npx playwright install chromium webkit."}`)
  process.exitCode=1
} finally {
  if(created) {
    try {
      const row=(await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",[name])).rows[0]
      assert.equal(row?.marker,marker,"No eliminar una base cuya marca no coincide")
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
      console.log("OK limpieza: base temporal de pruebas eliminada.")
    } catch(error) {console.error(`No se pudo limpiar la base temporal ${name}: ${error.code || error.name}. Requiere revisión.`);process.exitCode=1}
  }
  await admin.end();process.off("SIGINT",interrupt);process.off("SIGTERM",interrupt)
}
