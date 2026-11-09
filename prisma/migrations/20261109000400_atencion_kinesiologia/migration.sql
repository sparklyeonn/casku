-- AlterTable
ALTER TABLE "Evaluacion" ADD COLUMN     "filaId" UUID;

-- AlterTable
ALTER TABLE "EntradaFila" ADD COLUMN     "finalizadaAt" TIMESTAMP(3),
ADD COLUMN     "llamadaAt" TIMESTAMP(3),
ADD COLUMN     "profesionalId" TEXT,
ADD COLUMN     "reservaId" UUID;

-- CreateTable
CREATE TABLE "LlamadaFila" (
    "id" UUID NOT NULL,
    "profesionalId" TEXT NOT NULL,
    "eventoId" UUID NOT NULL,
    "entradaId" UUID,
    "reservaId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlamadaFila_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Evaluacion_filaId_key" ON "Evaluacion"("filaId");

-- CreateIndex
CREATE INDEX "EntradaFila_profesionalId_estado_idx" ON "EntradaFila"("profesionalId", "estado");

-- AddForeignKey
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_filaId_fkey" FOREIGN KEY ("filaId") REFERENCES "EntradaFila"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlamadaFila" ADD CONSTRAINT "LlamadaFila_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlamadaFila" ADD CONSTRAINT "LlamadaFila_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "EntradaFila"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariante global: una profesional no mantiene dos atenciones activas entre eventos.
CREATE UNIQUE INDEX "EntradaFila_profesional_activa_key" ON "EntradaFila" ("profesionalId") WHERE "estado" = 'EN_ATENCION' AND "profesionalId" IS NOT NULL;
