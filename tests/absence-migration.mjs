import assert from "node:assert/strict"

export async function seedBeforeAbsenceMigration(db) {
  await db.exec(`INSERT INTO "Evento" (id,nombre,fecha,lugar,cupos,"creadoPorId","updatedAt",inscritos,"ultimoNumero","ultimoOrdenFila") VALUES ('10000000-0000-4000-8000-000000000006','Migración ficticia','2026-01-01','Lugar ficticio',1,'fixture',CURRENT_TIMESTAMP,1,1,1);
    INSERT INTO "Paciente" (id,nombre,"fechaNacimiento") VALUES ('absence-migration-patient','Bebé de migración ficticio','2026-01-01');
    INSERT INTO "Inscripcion" (id,"solicitudHash","eventoId","pacienteId",numero,"qrToken",origen,"contactoNombre","registradoPorId") VALUES ('20000000-0000-4000-8000-000000000006','fixture','10000000-0000-4000-8000-000000000006','absence-migration-patient',1,'absence-migration-token','PRESENCIAL','Familia ficticia','fixture');
    INSERT INTO "EntradaFila" (id,"eventoId","inscripcionId",orden,"llegadaAt","confirmadoPorId") VALUES ('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000006',1,'2026-01-01 12:00:00','fixture');`)
  const before = (await db.query('SELECT to_jsonb(f) AS row FROM "EntradaFila" f WHERE id=\'30000000-0000-4000-8000-000000000006\'')).rows[0].row
  return async () => {
    const after = (await db.query('SELECT to_jsonb(f) - \'esperaDesde\' - \'ausenciaId\' - \'ausenteAt\' - \'reincorporadaAt\' AS row, "esperaDesde", "llegadaAt" FROM "EntradaFila" f WHERE id=\'30000000-0000-4000-8000-000000000006\'')).rows[0]
    assert.deepEqual(after.row, before)
    assert.equal(new Date(after.esperaDesde).getTime(), new Date(after.llegadaAt).getTime())
    console.log("OK migración de ausencias: conserva los campos y la espera de una entrada anterior.")
  }
}
