BEGIN;
-- AlterTable
ALTER TABLE "CuentaEquipo" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RecuperacionClave" (
    "id" UUID NOT NULL,
    "orden" BIGSERIAL NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "versionCuenta" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "expiraAt" TIMESTAMP(3) NOT NULL,
    "usadaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecuperacionClave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecuperacionClave_orden_key" ON "RecuperacionClave"("orden");

-- CreateIndex
CREATE UNIQUE INDEX "RecuperacionClave_tokenHash_key" ON "RecuperacionClave"("tokenHash");

-- CreateIndex
CREATE INDEX "RecuperacionClave_cuentaId_estado_idx" ON "RecuperacionClave"("cuentaId", "estado");

-- CreateIndex
CREATE INDEX "RecuperacionClave_expiraAt_idx" ON "RecuperacionClave"("expiraAt");

-- AddForeignKey
ALTER TABLE "RecuperacionClave" ADD CONSTRAINT "RecuperacionClave_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaEquipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "RecuperacionClave" ADD CONSTRAINT "RecuperacionClave_estado_check" CHECK (estado IN ('PENDIENTE','ACTIVA','USADA','ANULADA','FALLIDO'));
ALTER TABLE "RecuperacionClave" ADD CONSTRAINT "RecuperacionClave_version_check" CHECK ("versionCuenta">0 AND "tokenHash" ~ '^[a-f0-9]{64}$' AND "expiraAt">"createdAt");
ALTER TABLE "RecuperacionClave" ADD CONSTRAINT "RecuperacionClave_uso_check" CHECK ((estado='USADA')=("usadaAt" IS NOT NULL));
CREATE UNIQUE INDEX "RecuperacionClave_una_activa" ON "RecuperacionClave" ("cuentaId") WHERE estado='ACTIVA';
COMMIT;
