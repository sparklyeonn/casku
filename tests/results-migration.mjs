import assert from "node:assert/strict"
export async function seedBeforeResultsMigration(db) {
  await db.exec(`UPDATE "EntradaFila" SET estado='ATENDIDO',"profesionalId"='migration-clinician',"finalizadaAt"=CURRENT_TIMESTAMP WHERE id='30000000-0000-4000-8000-000000000006';
    INSERT INTO "Evaluacion" (id,"pacienteId","correoPadre",anteroposterior,biparietal,"diagonalIzq","diagonalDer","indiceCraneal","indiceAsimetria",diagnostico,recomendacion,kinesiologa,"filaId") VALUES ('result-migration-evaluation','absence-migration-patient',null,140,120,135,138,85.7,3,'Ejemplo','Ejemplo','Profesional ficticio','30000000-0000-4000-8000-000000000006');`)
  const before = (await db.query('SELECT to_jsonb(e) AS row FROM "Evaluacion" e WHERE id=$1', ["result-migration-evaluation"])).rows[0].row
  return async () => {
    const after = (await db.query('SELECT to_jsonb(e) - \'autorId\' - \'revision\' AS row, "autorId",revision FROM "Evaluacion" e WHERE id=$1', ["result-migration-evaluation"])).rows[0]
    assert.deepEqual(after.row, before); assert.equal(after.autorId, "migration-clinician"); assert.equal(after.revision, 1)
    assert.equal((await db.query('SELECT "autorId" FROM "Evaluacion" WHERE id=$1', ["legacy-evaluation"])).rows[0].autorId, null)
    assert.equal((await db.query('SELECT count(*)::int n FROM "ResultadoPublicado"')).rows[0].n, 0)
    console.log("OK migración de resultados: conserva datos clínicos, recupera autoría por atención y no publica ni vincula por nombre.")
  }
}
