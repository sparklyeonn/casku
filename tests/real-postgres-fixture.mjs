import assert from "node:assert/strict"
import { Pool, types } from "pg"

// Solo acepta una base recién creada y marcada por el orquestador. Nunca usa
// DATABASE_URL de la aplicación como destino de migraciones o datos de prueba.
export async function realPostgresFixture() {
  const url = process.env.CASKU_REAL_TEST_URL, marker = process.env.CASKU_REAL_TEST_MARKER
  assert(url && /^[a-f0-9]{48}$/.test(marker || ""), "Usa npm run test:postgres para aislar la base")
  const database = decodeURIComponent(new URL(url).pathname.slice(1))
  assert(/^casku_test_[a-f0-9]{24}$/.test(database))
  const pool = new Pool({connectionString:url,max:8,connectionTimeoutMillis:20000,types:{getTypeParser:(oid,format)=>oid===1114 && format!=="binary" ? value=>new Date(value.replace(" ","T")+"Z") : types.getTypeParser(oid,format)}})
  try {
    const {rows:[row]}=await pool.query("SELECT current_database() AS name,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")
    assert.equal(row.name,database);assert.equal(row.marker,marker)
    assert.equal((await pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0,"La base de pruebas debe estar vacía")
    // Probar backends simultáneos sin el multiplexor serial de PGlite.
    const acquisition=await Promise.allSettled(Array.from({length:4},()=>pool.connect()))
    const connections=acquisition.filter(result=>result.status==="fulfilled").map(result=>result.value)
    try {
      const failed=acquisition.find(result=>result.status==="rejected")
      if(failed) throw failed.reason
      const pids=await Promise.all(connections.map(c=>c.query("SELECT pg_backend_pid() AS pid,pg_sleep(0.1)")))
      assert.equal(new Set(pids.map(r=>r.rows[0].pid)).size,4)
    } finally {connections.forEach(c=>c.release())}
    console.log("OK aislamiento: base temporal vacía y cuatro backends PostgreSQL independientes.")
    return {pool,url,db:{pool,query:(sql,values)=>pool.query(sql,values?.map(v=>v instanceof Date?v.toISOString():v)),exec:sql=>pool.query(sql)}}
  } catch(error) {await pool.end();throw error}
}
