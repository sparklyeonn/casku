-- Campos opcionales exclusivamente para conservar intactas las filas anteriores.
-- No hay UPDATE, backfill, valores por defecto ni asociación por fecha/correo/nombre.
CREATE TYPE "OrigenEvaluacion" AS ENUM ('CALENDLY','WEB','PRESENCIAL','DIRECTA_SIN_INSCRIPCION');
ALTER TABLE "Evaluacion" ADD COLUMN "eventoId" UUID, ADD COLUMN origen "OrigenEvaluacion";
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_contexto_completo" CHECK (("eventoId" IS NULL AND origen IS NULL) OR ("eventoId" IS NOT NULL AND origen IS NOT NULL));
CREATE INDEX "Evaluacion_eventoId_origen_idx" ON "Evaluacion"("eventoId",origen);

CREATE FUNCTION validar_contexto_evaluacion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fila_evento UUID; fila_paciente TEXT; origen_esperado "OrigenEvaluacion";
BEGIN
 IF TG_OP='UPDATE' AND OLD."eventoId" IS NOT NULL AND
   (NEW."eventoId" IS DISTINCT FROM OLD."eventoId" OR NEW.origen IS DISTINCT FROM OLD.origen OR NEW."filaId" IS DISTINCT FROM OLD."filaId") THEN
   RAISE EXCEPTION 'El contexto de una evaluación registrada no se modifica desde la edición clínica' USING ERRCODE='23514';
 END IF;
 IF NEW."eventoId" IS NULL AND NEW.origen IS NULL THEN RETURN NEW; END IF;
 IF NEW."filaId" IS NULL THEN
   IF NEW.origen IS DISTINCT FROM 'DIRECTA_SIN_INSCRIPCION'::"OrigenEvaluacion" THEN
     RAISE EXCEPTION 'La atención directa debe conservar su origen sin inscripción' USING ERRCODE='23514';
   END IF;
 ELSE
   SELECT f."eventoId",i."pacienteId",CASE WHEN i."calendlyInvitadoId" IS NOT NULL AND i."calendlyReservaId" IS NOT NULL THEN 'CALENDLY'::"OrigenEvaluacion" WHEN i.origen='PRESENCIAL' THEN 'PRESENCIAL'::"OrigenEvaluacion" ELSE 'WEB'::"OrigenEvaluacion" END
   INTO fila_evento,fila_paciente,origen_esperado FROM "EntradaFila" f JOIN "Inscripcion" i ON i.id=f."inscripcionId" WHERE f.id=NEW."filaId";
   IF NOT FOUND OR fila_evento IS DISTINCT FROM NEW."eventoId" OR fila_paciente IS DISTINCT FROM NEW."pacienteId" OR origen_esperado IS DISTINCT FROM NEW.origen THEN
     RAISE EXCEPTION 'La evaluación debe corresponder al evento, bebé y origen de su inscripción' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Evaluacion_validar_contexto" BEFORE INSERT OR UPDATE OF "eventoId",origen,"filaId" ON "Evaluacion" FOR EACH ROW EXECUTE FUNCTION validar_contexto_evaluacion();
