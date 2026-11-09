-- CreateEnum
CREATE TYPE "EstadoFila" AS ENUM ('EN_ESPERA', 'EN_ATENCION', 'ATENDIDO', 'AUSENTE');

-- AlterTable
ALTER TABLE "Evento" ADD COLUMN     "ultimoOrdenFila" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EntradaFila" (
    "id" UUID NOT NULL,
    "eventoId" UUID NOT NULL,
    "inscripcionId" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "llegadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadoPorId" TEXT NOT NULL,
    "estado" "EstadoFila" NOT NULL DEFAULT 'EN_ESPERA',

    CONSTRAINT "EntradaFila_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntradaFila_inscripcionId_key" ON "EntradaFila"("inscripcionId");

-- CreateIndex
CREATE INDEX "EntradaFila_eventoId_estado_orden_idx" ON "EntradaFila"("eventoId", "estado", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "EntradaFila_eventoId_orden_key" ON "EntradaFila"("eventoId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "EntradaFila_inscripcionId_eventoId_key" ON "EntradaFila"("inscripcionId", "eventoId");

-- CreateIndex
CREATE UNIQUE INDEX "Inscripcion_id_eventoId_key" ON "Inscripcion"("id", "eventoId");

-- AddForeignKey
ALTER TABLE "EntradaFila" ADD CONSTRAINT "EntradaFila_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntradaFila" ADD CONSTRAINT "EntradaFila_inscripcionId_eventoId_fkey" FOREIGN KEY ("inscripcionId", "eventoId") REFERENCES "Inscripcion"("id", "eventoId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Evento" ADD CONSTRAINT "Evento_orden_fila_check" CHECK ("ultimoOrdenFila" >= 0);
ALTER TABLE "EntradaFila" ADD CONSTRAINT "EntradaFila_orden_check" CHECK ("orden" > 0);

