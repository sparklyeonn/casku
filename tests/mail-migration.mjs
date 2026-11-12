import assert from "node:assert/strict"
export async function beforeMailMigration(db) {
 const names=["Paciente","Apoderado","Evento","Inscripcion","EntradaFila","Evaluacion","ResultadoPublicado","CorreoResultado","CorreoInscripcion","AutorizacionPrivacidad","CambioPrivacidad","AccesoPrivado"]
 const snapshot=async name=>(await db.query(`SELECT to_jsonb(t) data FROM "${name}" t ORDER BY id`)).rows
 const before=await Promise.all(names.map(snapshot))
 return async()=>{
  for(const [index,name]of names.entries())assert.deepEqual(await snapshot(name),before[index])
  for(const name of ["OrdenCorreo","IntentoCorreo","NotificacionCorreo","SupresionCorreo"])assert.equal((await db.query(`SELECT count(*)::int n FROM "${name}"`)).rows[0].n,0)
  console.log("OK migración de correos: conserva registros y envíos anteriores, sin campañas retroactivas ni aprobaciones automáticas.")
 }
}
