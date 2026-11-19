import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { checkDeploymentEnvironment } from "../src/lib/deployment-policy.ts"
const base = { AUTH_URL:"https://ensayo.example.test", AUTH_SECRET:"a".repeat(48), DATABASE_URL:"postgresql://usuario:fixture@db.example.test/ensayo?sslmode=verify-full", CASKU_MAIL_ENABLED:"0", CASKU_MAIL_MODE:"pruebas", CASKU_MAIL_AUTOMATION:"0", BREVO_WEBHOOK_ENABLED:"0", CALENDLY_ENABLED:"0", CASKU_PASSWORD_RECOVERY_ENABLED:"0" }
const mail = {...base,CASKU_MAIL_ENABLED:"1",BREVO_API_KEY:"clave-ficticia-sin-uso",BREVO_SENDER_EMAIL:"contacto@example.test",BREVO_SENDER_VERIFIED:"1",CASKU_MAIL_DELIVERY_SECRET:"d".repeat(48),CASKU_MAIL_SUPPRESSION_SECRET:"s".repeat(48),CASKU_MAIL_TEST_RECIPIENTS:"prueba@example.test"}
test("despliegue: ensayo sin correo es explícito y no acredita una publicación completa",()=>{
 const result=checkDeploymentEnvironment(base,"ensayo")
 assert(result.variablesValidas);assert(result.avisos.some(item=>item.variable==="CASKU_MAIL_ENABLED"));assert(result.avisos.some(item=>item.variable==="DATABASE_URL"))
 assert(!checkDeploymentEnvironment(base,"produccion").variablesValidas)
 assert(checkDeploymentEnvironment({...mail,CASKU_MAIL_MODE:"produccion"},"produccion").variablesValidas)
 assert.throws(()=>checkDeploymentEnvironment(base,"otra" as "ensayo"))
})
test("despliegue: no publicar simuladores ni activar envíos generales durante un ensayo",()=>{
 for(const change of [{CASKU_TEST_MODE:"1"},{CASKU_PRODUCTION_TEST:"1"},{CASKU_TEST_MAIL_URL:"http://127.0.0.1:9000"},{NODE_OPTIONS:"--import ./tests/production-mail-preload.mjs"},{CASKU_MAIL_AUTOMATION:"1"},{CASKU_MAIL_MODE:"produccion"}])assert(!checkDeploymentEnvironment({...base,...change},"ensayo").variablesValidas)
 for(const change of [{CASKU_MAIL_TEST_RECIPIENTS:""},{CASKU_MAIL_TEST_RECIPIENTS:"invalido"},{BREVO_API_KEY:"brevo_local_test_only"},{BREVO_SENDER_VERIFIED:"0"},{CASKU_MAIL_DELIVERY_SECRET:base.AUTH_SECRET}])assert(!checkDeploymentEnvironment({...mail,...change},"ensayo").variablesValidas)
 assert(checkDeploymentEnvironment(mail,"ensayo").variablesValidas)
})
test("despliegue: origen HTTPS y base remota segura, sin inferir el destino desde el navegador",()=>{
 for(const AUTH_URL of ["http://ensayo.example.test","https://usuario:clave@ensayo.example.test","https://ensayo.example.test/login","https://localhost","https://sin-configurar.invalid","https://ensayo.example.test/?token=x"])assert(!checkDeploymentEnvironment({...base,AUTH_URL},"ensayo").variablesValidas)
 for(const DATABASE_URL of ["","https://db.example.test","postgres://usuario:clave@127.0.0.1/ensayo","postgres://usuario:clave@db.example.test/ensayo?sslmode=disable"])assert(!checkDeploymentEnvironment({...base,DATABASE_URL},"ensayo").variablesValidas)
 assert(!checkDeploymentEnvironment({...base,NEXTAUTH_URL:"https://otro.example.test"},"ensayo").variablesValidas)
})
test("despliegue: recuperación y webhook requieren claves independientes y programación externa",()=>{
 const settings={...mail,CASKU_PASSWORD_RECOVERY_ENABLED:"1",CASKU_PASSWORD_RECOVERY_QUEUE_KEY:Buffer.alloc(32,4).toString("base64url"),CASKU_PASSWORD_RECOVERY_WORKER_SECRET:"w".repeat(48),BREVO_WEBHOOK_ENABLED:"1",BREVO_WEBHOOK_SECRET:"h".repeat(48)}
 const result=checkDeploymentEnvironment(settings,"ensayo")
 assert(result.variablesValidas);assert(result.avisos.some(v=>v.variable==="CASKU_PASSWORD_RECOVERY_WORKER_SECRET"))
 for(const change of [{CASKU_PASSWORD_RECOVERY_QUEUE_KEY:"incorrecta"},{CASKU_PASSWORD_RECOVERY_WORKER_SECRET:""},{BREVO_WEBHOOK_SECRET:""},{CASKU_MAIL_ENABLED:"0"}])assert(!checkDeploymentEnvironment({...settings,...change},"ensayo").variablesValidas)
 assert(!checkDeploymentEnvironment({...settings,VERCEL:"1"},"ensayo").variablesValidas)
 assert(checkDeploymentEnvironment({...settings,VERCEL:"1",CRON_SECRET:"v".repeat(48)},"ensayo").variablesValidas)
 assert(!checkDeploymentEnvironment({...settings,VERCEL:"1",CRON_SECRET:settings.CASKU_PASSWORD_RECOVERY_WORKER_SECRET},"ensayo").variablesValidas)
 const output=JSON.stringify(result)
 for(const secret of [settings.AUTH_SECRET,settings.DATABASE_URL,settings.BREVO_API_KEY,settings.CASKU_PASSWORD_RECOVERY_QUEUE_KEY,settings.BREVO_WEBHOOK_SECRET])assert(!output.includes(secret))
})
test("CLI de despliegue: rechaza argumentos incorrectos y no carga archivos privados locales",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"casku-deploy-check-"))
 try {
  const marker="NO_PUBLICAR_SECRETO_LOCAL_DE_PRUEBA_123456789"
  await writeFile(join(dir,".env.local"),`AUTH_SECRET=${marker}\n`)
  const env:NodeJS.ProcessEnv={PATH:process.env.PATH,NODE_ENV:"production"},script=new URL("../scripts/verificar-despliegue.mjs",import.meta.url).pathname
  const result=spawnSync(process.execPath,["--experimental-strip-types",script,"--stage","ensayo"],{cwd:dir,env,encoding:"utf8"})
  assert.equal(result.status,1);const body=JSON.parse(result.stdout);assert(body.errores.some((v:{variable:string})=>v.variable==="AUTH_SECRET"));assert(!result.stdout.includes(marker));assert(!result.stderr.includes(marker))
  const bad=spawnSync(process.execPath,["--experimental-strip-types",script],{cwd:dir,env,encoding:"utf8"})
  assert.equal(bad.status,1);assert.match(bad.stderr,/Uso:/)
 } finally {await rm(dir,{recursive:true,force:true})}
})
