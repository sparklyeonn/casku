BEGIN;
-- CreateTable
CREATE TABLE "SesionEquipo" (
    "id" UUID NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "secretoHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actividadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraAt" TIMESTAMP(3) NOT NULL,
    "revocadaAt" TIMESTAMP(3),
    "motivo" TEXT,

    CONSTRAINT "SesionEquipo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SesionEquipo_secretoHash_key" ON "SesionEquipo"("secretoHash");

-- CreateIndex
CREATE INDEX "SesionEquipo_cuentaId_createdAt_idx" ON "SesionEquipo"("cuentaId", "createdAt");

-- CreateIndex
CREATE INDEX "SesionEquipo_expiraAt_idx" ON "SesionEquipo"("expiraAt");

-- AddForeignKey
ALTER TABLE "SesionEquipo" ADD CONSTRAINT "SesionEquipo_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaEquipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SesionEquipo" ADD CONSTRAINT "SesionEquipo_plazos_check" CHECK ("expiraAt">"createdAt" AND "actividadAt">="createdAt" AND version>0);
COMMIT;
