BEGIN;
-- CreateTable
CREATE TABLE "CuentaEquipo" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creadoPorId" TEXT,
    "solicitudHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaEquipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroEquipo" (
    "id" INTEGER NOT NULL,
    "importadoAt" TIMESTAMP(3),

    CONSTRAINT "RegistroEquipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CambioCuentaEquipo" (
    "id" UUID NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "anterior" JSONB,
    "nueva" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CambioCuentaEquipo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CuentaEquipo_email_key" ON "CuentaEquipo"("email");

-- CreateIndex
CREATE INDEX "CambioCuentaEquipo_cuentaId_createdAt_idx" ON "CambioCuentaEquipo"("cuentaId", "createdAt");

ALTER TABLE "CuentaEquipo" ADD CONSTRAINT "CuentaEquipo_role_check" CHECK (role IN ('ADMIN','RECEPCION','KINESIOLOGO'));
ALTER TABLE "CuentaEquipo" ADD CONSTRAINT "CuentaEquipo_version_check" CHECK (version > 0);
ALTER TABLE "CuentaEquipo" ADD CONSTRAINT "CuentaEquipo_email_check" CHECK (email = lower(btrim(email)));
ALTER TABLE "RegistroEquipo" ADD CONSTRAINT "RegistroEquipo_singleton_check" CHECK (id=1);
COMMIT;
