BEGIN;

-- CreateEnum
CREATE TYPE "TipoMovimientoFila" AS ENUM ('AUSENCIA', 'REINCORPORACION');

-- AlterTable
ALTER TABLE "EntradaFila" ADD COLUMN     "ausenciaId" UUID,
ADD COLUMN     "ausenteAt" TIMESTAMP(3),
ADD COLUMN     "esperaDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reincorporadaAt" TIMESTAMP(3);

-- Las llegadas existentes conservan su espera acumulada en el nuevo reloj.
UPDATE "EntradaFila" SET "esperaDesde" = "llegadaAt";

-- CreateTable
CREATE TABLE "MovimientoFila" (
    "id" UUID NOT NULL,
    "entradaId" UUID NOT NULL,
    "ausenciaId" UUID NOT NULL,
    "tipo" "TipoMovimientoFila" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoFila_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimientoFila_entradaId_createdAt_idx" ON "MovimientoFila"("entradaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoFila_entradaId_ausenciaId_tipo_key" ON "MovimientoFila"("entradaId", "ausenciaId", "tipo");

-- CreateIndex
CREATE INDEX "EntradaFila_eventoId_estado_esperaDesde_orden_idx" ON "EntradaFila"("eventoId", "estado", "esperaDesde", "orden");

-- AddForeignKey
ALTER TABLE "MovimientoFila" ADD CONSTRAINT "MovimientoFila_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "EntradaFila"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


COMMIT;
