import test from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"

test("migración Calendly: conserva inscripción histórica y exige cita completa y referencia única", async () => {
 const db = new PGlite()
 const migration = "20261119000200_vincular_citas_calendly"
 try {
  for (const name of (await readdir("prisma/migrations")).filter(name => /^\d/.test(name) && name < migration).sort()) await db.exec(await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"))
  await db.exec(`INSERT INTO "Evento" (id,nombre,fecha,lugar,cupos,"creadoPorId","updatedAt") VALUES ('047c4f7f-a32f-4f4a-96c3-39da98abb140','Evento ficticio','2026-11-19','Prueba',10,'fixture',CURRENT_TIMESTAMP);
   INSERT INTO "Paciente" (id,nombre,"fechaNacimiento") VALUES ('historico-qa','Bebé histórico ficticio','2026-01-01');
   INSERT INTO "Inscripcion" (id,"solicitudHash","eventoId","pacienteId",numero,"qrToken",origen,"contactoNombre","registradoPorId") VALUES ('047c4f7f-a32f-4f4a-96c3-39da98abb141','fixture','047c4f7f-a32f-4f4a-96c3-39da98abb140','historico-qa',1,'qr-historico','PRESENCIAL','Apoderado ficticio','recepcion-ficticia')`)
  const before = (await db.query<{ data: unknown }>('SELECT to_jsonb(i) AS data FROM "Inscripcion" i')).rows[0].data
  await db.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"))
  const after = (await db.query<{ data: unknown }>(`SELECT to_jsonb(i)-'calendlyReservaId'-'calendlyInvitadoId'-'citaInicio'-'citaFin'-'citaConfirmadaAt' AS data FROM "Inscripcion" i`)).rows[0].data
  assert.deepEqual(after, before)
  assert.equal((await db.query<{ citaInicio: string | null }>('SELECT "citaInicio" FROM "Inscripcion"')).rows[0].citaInicio, null)
  await assert.rejects(db.exec(`UPDATE "Inscripcion" SET "calendlyInvitadoId"='incompleto'`))
  await assert.rejects(db.exec(`UPDATE "Inscripcion" SET origen='PREVIA'`), "No basta con marcar PREVIA sin cuenta ni cita confirmada")
  await db.exec(`UPDATE "Inscripcion" SET origen='PREVIA',"calendlyReservaId"='reserva',"calendlyInvitadoId"='invitado',"citaInicio"='2026-11-19 15:00',"citaFin"='2026-11-19 15:10',"citaConfirmadaAt"=CURRENT_TIMESTAMP`)
  await assert.rejects(db.exec(`UPDATE "Inscripcion" SET "citaFin"=NULL`))
  await assert.rejects(db.exec(`UPDATE "Inscripcion" SET "citaFin"="citaInicio"`))
  await assert.rejects(db.exec(`UPDATE "Inscripcion" SET "contactoNombre"=NULL`))
 } finally { await db.close() }
})
