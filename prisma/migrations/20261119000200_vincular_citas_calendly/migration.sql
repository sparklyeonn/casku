-- Campos opcionales: las inscripciones y evaluaciones anteriores se conservan.
ALTER TABLE "Inscripcion"
 ADD COLUMN "calendlyReservaId" TEXT,
 ADD COLUMN "calendlyInvitadoId" TEXT,
 ADD COLUMN "citaInicio" TIMESTAMP(3),
 ADD COLUMN "citaFin" TIMESTAMP(3),
 ADD COLUMN "citaConfirmadaAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Inscripcion_calendlyInvitadoId_key" ON "Inscripcion"("calendlyInvitadoId");
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_cita_completa_check" CHECK (
 ("calendlyReservaId" IS NULL AND "calendlyInvitadoId" IS NULL AND "citaInicio" IS NULL AND "citaFin" IS NULL AND "citaConfirmadaAt" IS NULL)
 OR ("calendlyReservaId" IS NOT NULL AND "calendlyInvitadoId" IS NOT NULL AND "citaInicio" IS NOT NULL AND "citaFin" IS NOT NULL AND "citaFin" > "citaInicio" AND "citaConfirmadaAt" IS NOT NULL)
);
CREATE INDEX "Inscripcion_eventoId_citaInicio_idx" ON "Inscripcion"("eventoId", "citaInicio");

-- Se permite la reserva previa confirmada en recepción sin inventar una cuenta familiar.
-- Se conserva la exigencia de contacto y funcionario responsable para registros sin cuenta.
ALTER TABLE "Inscripcion" DROP CONSTRAINT "Inscripcion_contacto_presencial_check";
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_contacto_presencial_check" CHECK (
 "apoderadoId" IS NOT NULL OR (
  ("origen" = 'PRESENCIAL' OR ("origen" = 'PREVIA' AND "calendlyInvitadoId" IS NOT NULL))
  AND "contactoNombre" IS NOT NULL AND "registradoPorId" IS NOT NULL
 )
);
