import test from "node:test"
import assert from "node:assert/strict"
import {parseReviewArgs,reviewHtml} from "../scripts/preparar-resultados-expo.mjs"
test("informe privado: rechaza opciones de envío o conexiones implícitas",()=>{
 for(const args of [[],["--schedule"],["--database-env","x","--expected-count","0"],["--database-env","x","--expected-count","95","--send"]])assert.throws(()=>parseReviewArgs(args))
 assert.equal(parseReviewArgs(["--database-env","fixture.env","--expected-count","95"]).expectedCount,95)
})
test("informe privado: escapa datos personales y declara explícitamente que no está programado",()=>{
 const row={autorId:"fake",profesional:"<script>test</script>",bebe:"<img onerror=evil>",correo:"fake@example.test",apoderado:"<b>fake</b>",evaluacionId:"fake",revision:1,indicadores:[],motivos:["AUTORIZACION_CORREO_PENDIENTE"]}
 const html=reviewHtml({preparedAt:"2026-11-22",digest:"a".repeat(64),rows:[row],summary:{total:1,direcciones:1,motivos:{AUTORIZACION_CORREO_PENDIENTE:1}}})
 assert(html.includes("NO PROGRAMADO"));assert(html.includes("&lt;img onerror=evil&gt;"));assert(!html.includes("<script>test</script>"));assert(html.includes("Content-Security-Policy"))
})

test("consulta del lote: esquema completo y transacción de solo lectura", async () => {
 const {PGlite}=await import("@electric-sql/pglite")
 const {readFile,readdir}=await import("node:fs/promises")
 const {EXPO_REVIEW_SQL}=await import("../scripts/preparar-resultados-expo.mjs")
 const db=new PGlite()
 try {
  await db.waitReady
  const base=new URL("../prisma/migrations/",import.meta.url)
  for(const entry of (await readdir(base,{withFileTypes:true})).filter(x=>x.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await db.exec(await readFile(new URL(entry.name+"/migration.sql",base),"utf8"))
  await db.exec("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
  assert.deepEqual((await db.query(EXPO_REVIEW_SQL)).rows,[])
  await assert.rejects(db.query('UPDATE "Evento" SET nombre=nombre'),error=>error.code==="25006")
  await db.exec("ROLLBACK")
 } finally {await db.close()}
})
