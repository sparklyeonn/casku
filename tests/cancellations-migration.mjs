import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
export async function seedBeforeCancellationMigration(db) {
  const event = randomUUID(), patient = randomUUID(), inscription = randomUUID(), entry = randomUUID(), mail = randomUUID()
  await db.query('INSERT INTO "Evento" (id,nombre,fecha,lugar,cupos,"creadoPorId","updatedAt",inscritos,"ultimoNumero","ultimoOrdenFila") VALUES ($1,\'Reserva previa ficticia\',\'2026-01-01\',\'Lugar ficticio\',3,\'fixture\',CURRENT_TIMESTAMP,1,1,1)', [event])
  await db.query('INSERT INTO "Paciente" (id,nombre,"fechaNacimiento") VALUES ($1,\'Bebé anterior ficticio\',\'2025-01-01\')', [patient])
  await db.query('INSERT INTO "Inscripcion" (id,"eventoId","pacienteId","solicitudHash",numero,"qrToken",origen,"contactoNombre","registradoPorId") VALUES ($1,$2,$3,\'fixture\',1,$4,\'PRESENCIAL\',\'Contacto ficticio\',\'fixture\')', [inscription, event, patient, randomUUID()])
  await db.query('INSERT INTO "EntradaFila" (id,"eventoId","inscripcionId",orden,"confirmadoPorId",estado) VALUES ($1,$2,$3,1,\'fixture\',\'AUSENTE\')', [entry, event, inscription])
  await db.query('INSERT INTO "CorreoInscripcion" (id,"inscripcionId",estado,intentos,"updatedAt") VALUES ($1,$2,\'FALLIDO\',1,CURRENT_TIMESTAMP)', [mail, inscription])
  const records = [["Evento", event], ["Paciente", patient], ["Inscripcion", inscription], ["EntradaFila", entry], ["CorreoInscripcion", mail]]
  const before = await Promise.all(records.map(async ([table, id]) => (await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t WHERE id=$1`, [id])).rows[0].row))
  return async () => {
    for (const [index, [table, id]] of records.entries()) assert.deepEqual((await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t WHERE id=$1`, [id])).rows[0].row, before[index])
    assert.equal((await db.query('SELECT count(*)::int n FROM "CancelacionInscripcion"')).rows[0].n, 0)
    console.log("OK migración de cancelación: conserva reserva, contador, ficha, ausencia y correo anteriores; no cancela ni libera cupos automáticamente.")
  }
}
