import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
export async function seedBeforeEventEditMigration(db) {
  const eventId = randomUUID(), patientId = randomUUID(), inscriptionId = randomUUID(), mailId = randomUUID()
  await db.query('INSERT INTO "Evento" (id,nombre,fecha,lugar,cupos,"creadoPorId","updatedAt",inscritos,"ultimoNumero") VALUES ($1,\'Evento anterior ficticio\',\'2026-01-01\',\'Lugar anterior\',2,\'fixture\',CURRENT_TIMESTAMP,1,1)', [eventId])
  await db.query('INSERT INTO "Paciente" (id,nombre,"fechaNacimiento") VALUES ($1,\'Bebé anterior ficticio\',\'2025-01-01\')', [patientId])
  await db.query('INSERT INTO "Inscripcion" (id,"eventoId","pacienteId","solicitudHash",numero,"qrToken",origen,"contactoNombre","registradoPorId") VALUES ($1,$2,$3,\'fixture\',1,$4,\'PRESENCIAL\',\'Familia ficticia\',\'fixture\')', [inscriptionId, eventId, patientId, randomUUID()])
  await db.query('INSERT INTO "CorreoInscripcion" (id,"inscripcionId",estado,intentos,"proveedorId","updatedAt") VALUES ($1,$2,\'ENVIADO\',2,\'provider-fixture\',CURRENT_TIMESTAMP)', [mailId, inscriptionId])
  const beforeMail = (await db.query('SELECT to_jsonb(c) AS row FROM "CorreoInscripcion" c WHERE id=$1', [mailId])).rows[0].row
  const beforeEvent = (await db.query('SELECT to_jsonb(e) AS row FROM "Evento" e WHERE id=$1', [eventId])).rows[0].row
  return async () => {
    assert.deepEqual((await db.query('SELECT to_jsonb(c)-\'datosEvento\' AS row FROM "CorreoInscripcion" c WHERE id=$1', [mailId])).rows[0].row, beforeMail)
    assert.deepEqual((await db.query('SELECT to_jsonb(e)-\'revision\' AS row FROM "Evento" e WHERE id=$1', [eventId])).rows[0].row, beforeEvent)
    assert.deepEqual((await db.query('SELECT "datosEvento" FROM "CorreoInscripcion" WHERE id=$1', [mailId])).rows[0].datosEvento, { nombre: "Evento anterior ficticio", fecha: "2026-01-01", lugar: "Lugar anterior" })
    assert.equal((await db.query('SELECT revision FROM "Evento" WHERE id=$1', [eventId])).rows[0].revision, 1)
    console.log("OK migración de edición: conserva evento y estado/id del correo previo, añade revisión y fija su copia de datos públicos.")
  }
}
