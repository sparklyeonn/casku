import test from "node:test"
import assert from "node:assert/strict"
import {readFile,readdir} from "node:fs/promises"
import {randomUUID} from "node:crypto"
import {PGlite} from "@electric-sql/pglite"
test("contacto migración: aditiva, única por revisión y contexto y snapshot/consentimiento inmutables",async()=>{
 const db=new PGlite();await db.waitReady
 try {
  for(const migration of (await readdir("prisma/migrations")).filter(name=>/^\d/.test(name)).sort())await db.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,"utf8"))
  const authorization=randomUUID(),id=randomUUID()
  await db.exec(`INSERT INTO "CuentaEquipo" (id,email,name,role,"passwordHash","updatedAt") VALUES ('contact-author','author@example.invalid','Ficticio','KINESIOLOGO','fake',CURRENT_TIMESTAMP);
  INSERT INTO "Paciente" (id,nombre,"fechaNacimiento") VALUES ('contact-baby','Ficticio','2026-01-01');
  INSERT INTO "Evaluacion" (id,"pacienteId",anteroposterior,biparietal,"diagonalIzq","diagonalDer","indiceCraneal","indiceAsimetria",diagnostico,recomendacion,kinesiologa,"autorId") VALUES ('contact-evaluation','contact-baby',140,120,135,138,85.7,3,'Ficticio','Ficticia','Profesional','contact-author');`)
  await db.query(`INSERT INTO "AutorizacionPrivacidad" (id,ambito,"pacienteId",datos,"versionTexto","updatedAt") VALUES ($1,'contact-fixture','contact-baby',true,'fixture',CURRENT_TIMESTAMP)`,[authorization])
  const sql=`INSERT INTO "ResultadoContacto" (id,"evaluacionId",revision,protocolo,destinatario,"nombreApoderado",datos,"hashDatos",mensaje,"consentimientoVersion","consentimientoTextos","confirmarApoderado","autorizarCorreo","actorId","autorizacionId","autorizacionRevision",contexto,"solicitudHash","claveEnvio") VALUES ($1,'contact-evaluation',1,'legacy-4','contact@example.invalid','Apoderado','{}','hash','{}','fixture','{}',true,true,'contact-author',$2,1,'context','request',$3)`
  await db.query(sql,[id,authorization,`contact-${id}`])
  await assert.rejects(db.query(sql,[randomUUID(),authorization,randomUUID()]),e=>e.code==="23505")
  for(const statement of [`UPDATE "ResultadoContacto" SET datos='{"changed":true}' WHERE id=$1`,`UPDATE "ResultadoContacto" SET destinatario='other@example.invalid' WHERE id=$1`,`UPDATE "ResultadoContacto" SET "autorizarCorreo"=false WHERE id=$1`,`DELETE FROM "ResultadoContacto" WHERE id=$1`])await assert.rejects(db.query(statement,[id]),e=>e.code==="23514")
  await db.query(sql.replace("\'context\'","\'contexto-corregido\'"),[randomUUID(),authorization,randomUUID()])
  await db.query(`UPDATE "ResultadoContacto" SET estado='ACEPTADO',"proveedorId"='fake' WHERE id=$1`,[id])
  await assert.rejects(db.query(`UPDATE "ResultadoContacto" SET estado='PENDIENTE' WHERE id=$1`,[id]),e=>e.code==="23514")
  assert.equal((await db.query('SELECT count(*)::int n FROM "ResultadoPublicado"')).rows[0].n,0)
 }finally{await db.close()}
})
