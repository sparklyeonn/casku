import assert from "node:assert/strict"
export async function beforePrivacyMigration(db){
 const tables=["Paciente","Apoderado","Inscripcion","Evaluacion","EntradaFila","ResultadoPublicado","CorreoResultado","CorreoInscripcion","ListaEspera","SesionEquipo"]
 const snapshot=async table=>(await db.query(`SELECT to_jsonb(t)-'autorizacionId' row FROM "${table}" t ORDER BY id`)).rows
 const before=await Promise.all(tables.map(snapshot))
 return async()=>{
  for(const [index,table]of tables.entries())assert.deepEqual(await snapshot(table),before[index])
  for(const table of ["AutorizacionPrivacidad","CambioPrivacidad","AccesoPrivado"])assert.equal((await db.query(`SELECT count(*)::int n FROM "${table}"`)).rows[0].n,0)
  assert.equal((await db.query('SELECT count(*)::int n FROM "Inscripcion" WHERE "autorizacionId" IS NOT NULL')).rows[0].n,0)
  console.log("OK migración de privacidad: conserva datos, filas, resultados y correos; no inventa autorizaciones ni envía campañas históricas.")
 }
}
