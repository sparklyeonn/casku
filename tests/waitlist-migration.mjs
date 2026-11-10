import assert from "node:assert/strict"
export async function beforeWaitlistMigration(db) {
  const tables = ["Evento", "Paciente", "Apoderado", "Inscripcion", "EntradaFila", "CorreoInscripcion", "CancelacionInscripcion", "Evaluacion"]
  const snapshot = async table => (await db.query(`SELECT to_jsonb(t) - 'ultimoOrdenEspera' AS row FROM "${table}" t ORDER BY id`)).rows
  const before = await Promise.all(tables.map(snapshot))
  return async () => {
    for (const [index, table] of tables.entries()) assert.deepEqual(await snapshot(table), before[index])
    assert.equal((await db.query('SELECT count(*)::int n FROM "ListaEspera"')).rows[0].n, 0)
    assert.equal((await db.query('SELECT count(*)::int n FROM "Evento" WHERE "ultimoOrdenEspera"<>0')).rows[0].n, 0)
    console.log("OK migración de espera: conserva eventos, fichas, reservas, cancelaciones, fila, evaluaciones y correos; no genera solicitudes ni asignaciones.")
  }
}
