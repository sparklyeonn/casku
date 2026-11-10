BEGIN;

-- AlterTable
ALTER TABLE "Evaluacion" ADD COLUMN     "autorId" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ResultadoPublicado" (
    "id" UUID NOT NULL,
    "evaluacionId" TEXT NOT NULL,
    "apoderadoId" UUID NOT NULL,
    "publicadoPorId" TEXT NOT NULL,
    "publicadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL,
    "datos" JSONB NOT NULL,

    CONSTRAINT "ResultadoPublicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionEvaluacion" (
    "id" UUID NOT NULL,
    "evaluacionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "autorId" TEXT NOT NULL,
    "anterior" JSONB NOT NULL,
    "nueva" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevisionEvaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorreoResultado" (
    "id" UUID NOT NULL,
    "publicacionId" UUID NOT NULL,
    "destinatario" TEXT NOT NULL,
    "portalUrl" TEXT,
    "estado" "EstadoCorreo" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "disponibleAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloqueoToken" UUID,
    "bloqueoHasta" TIMESTAMP(3),
    "enviadoAt" TIMESTAMP(3),
    "proveedorId" TEXT,
    "ultimoError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorreoResultado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResultadoPublicado_evaluacionId_key" ON "ResultadoPublicado"("evaluacionId");

-- CreateIndex
CREATE INDEX "ResultadoPublicado_apoderadoId_publicadoAt_idx" ON "ResultadoPublicado"("apoderadoId", "publicadoAt");

-- CreateIndex
CREATE UNIQUE INDEX "RevisionEvaluacion_evaluacionId_revision_key" ON "RevisionEvaluacion"("evaluacionId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "CorreoResultado_publicacionId_key" ON "CorreoResultado"("publicacionId");

-- CreateIndex
CREATE INDEX "CorreoResultado_estado_disponibleAt_idx" ON "CorreoResultado"("estado", "disponibleAt");

-- CreateIndex
CREATE INDEX "Evaluacion_autorId_createdAt_idx" ON "Evaluacion"("autorId", "createdAt");

-- AddForeignKey
ALTER TABLE "ResultadoPublicado" ADD CONSTRAINT "ResultadoPublicado_evaluacionId_fkey" FOREIGN KEY ("evaluacionId") REFERENCES "Evaluacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoPublicado" ADD CONSTRAINT "ResultadoPublicado_apoderadoId_fkey" FOREIGN KEY ("apoderadoId") REFERENCES "Apoderado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionEvaluacion" ADD CONSTRAINT "RevisionEvaluacion_evaluacionId_fkey" FOREIGN KEY ("evaluacionId") REFERENCES "Evaluacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorreoResultado" ADD CONSTRAINT "CorreoResultado_publicacionId_fkey" FOREIGN KEY ("publicacionId") REFERENCES "ResultadoPublicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Solo se recupera autoría respaldada por una atención finalizada; nunca por nombre.
UPDATE "Evaluacion" e SET "autorId"=f."profesionalId" FROM "EntradaFila" f WHERE e."filaId"=f.id AND f.estado='ATENDIDO' AND f."profesionalId" IS NOT NULL;
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_revision_check" CHECK (revision > 0);
ALTER TABLE "ResultadoPublicado" ADD CONSTRAINT "ResultadoPublicado_revision_check" CHECK (revision > 0);
COMMIT;
