BEGIN;
-- CreateEnum
CREATE TYPE "EstadoListaEspera" AS ENUM ('PENDIENTE', 'ASIGNADA', 'RETIRADA', 'NO_ELEGIBLE');

-- AlterTable
ALTER TABLE "Evento" ADD COLUMN     "ultimoOrdenEspera" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ListaEspera" (
    "id" UUID NOT NULL,
    "eventoId" UUID NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "apoderadoId" UUID NOT NULL,
    "nombreBebe" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "estado" "EstadoListaEspera" NOT NULL DEFAULT 'PENDIENTE',
    "solicitudHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltaAt" TIMESTAMP(3),
    "motivoResolucion" TEXT,
    "origenResolucion" TEXT,
    "inscripcionId" UUID,

    CONSTRAINT "ListaEspera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListaEspera_inscripcionId_key" ON "ListaEspera"("inscripcionId");

-- CreateIndex
CREATE INDEX "ListaEspera_eventoId_estado_orden_idx" ON "ListaEspera"("eventoId", "estado", "orden");

-- CreateIndex
CREATE INDEX "ListaEspera_apoderadoId_createdAt_idx" ON "ListaEspera"("apoderadoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ListaEspera_eventoId_orden_key" ON "ListaEspera"("eventoId", "orden");

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_apoderadoId_fkey" FOREIGN KEY ("apoderadoId") REFERENCES "Apoderado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_inscripcionId_fkey" FOREIGN KEY ("inscripcionId") REFERENCES "Inscripcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ListaEspera_pendiente_bebe_key" ON "ListaEspera" ("eventoId","pacienteId") WHERE estado='PENDIENTE';
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_orden_check" CHECK (orden>0);
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_orden_espera_check" CHECK ("ultimoOrdenEspera">=0);
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_resolucion_check" CHECK ((estado='PENDIENTE' AND "resueltaAt" IS NULL AND "inscripcionId" IS NULL) OR (estado='ASIGNADA' AND "resueltaAt" IS NOT NULL AND "inscripcionId" IS NOT NULL) OR (estado IN ('RETIRADA','NO_ELEGIBLE') AND "resueltaAt" IS NOT NULL AND "inscripcionId" IS NULL));
COMMIT;
