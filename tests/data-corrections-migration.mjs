import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
export async function seedBeforeDataCorrectionMigration(db) {
  const guardian = randomUUID(), patient = randomUUID(), event = randomUUID(), inscription = randomUUID(), mail = randomUUID()
  await db.query('INSERT INTO "Apoderado" (id,correo,nombre,"updatedAt") VALUES ($1,\'migration-data@example.com\',\'Apoderado anterior ficticio\',CURRENT_TIMESTAMP)', [guardian])
  await db.query('INSERT INTO "Paciente" (id,nombre,"fechaNacimiento","apoderadoId") VALUES ($1,\'Bebé anterior ficticio\',\'2025-01-01\',$2)', [patient, guardian])
  await db.query('INSERT INTO "Evento" (id,nombre,fecha,lugar,cupos,"creadoPorId","updatedAt",inscritos,"ultimoNumero") VALUES ($1,\'Datos anteriores ficticios\',\'2026-01-01\',\'Lugar ficticio\',2,\'fixture\',CURRENT_TIMESTAMP,1,1)', [event])
  await db.query('INSERT INTO "Inscripcion" (id,"eventoId","pacienteId","apoderadoId","solicitudHash",numero,"qrToken") VALUES ($1,$2,$3,$4,\'fixture\',1,$5)', [inscription, event, patient, guardian, randomUUID()])
  await db.query('INSERT INTO "CorreoInscripcion" (id,"inscripcionId",estado,intentos,"proveedorId","updatedAt") VALUES ($1,$2,\'ENVIADO\',2,\'fixture-provider\',CURRENT_TIMESTAMP)', [mail, inscription])
  const ids = [["Paciente", patient, ["revisionDatos"]], ["Apoderado", guardian, ["revisionDatos"]], ["Inscripcion", inscription, ["revisionContacto"]], ["CorreoInscripcion", mail, ["datosFamilia", "revisionContenido"]]]
  const before = await Promise.all(ids.map(async ([table, id]) => (await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t WHERE id=$1`, [id])).rows[0].row))
  return async () => {
    for (const [index, [table, id, added]] of ids.entries()) {
      const value = (await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t WHERE id=$1`, [id])).rows[0].row
      for (const field of added) delete value[field]
      assert.deepEqual(value, before[index])
    }
    const copied = (await db.query('SELECT "datosFamilia","revisionContenido" FROM "CorreoInscripcion" WHERE id=$1', [mail])).rows[0]
    assert.equal(copied.revisionContenido, 1)
    assert.deepEqual(copied.datosFamilia, { nombreBebe: "Bebé anterior ficticio", correo: "migration-data@example.com", conCuenta: true })
    console.log("OK migración de correcciones: conserva fichas, propietario, inscripción y estado de envío; fija identidad original del comprobante sin enviar correos.")
  }
}
