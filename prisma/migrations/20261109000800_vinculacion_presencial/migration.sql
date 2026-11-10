BEGIN;

-- CreateTable
CREATE TABLE "VinculacionPresencial" (
    "id" UUID NOT NULL,
    "inscripcionId" UUID NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "creadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraAt" TIMESTAMP(3) NOT NULL,
    "revocadaAt" TIMESTAMP(3),
    "revocadaPorId" TEXT,
    "consumidaAt" TIMESTAMP(3),
    "apoderadoId" UUID,

    CONSTRAINT "VinculacionPresencial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VinculacionPresencial_codigoHash_key" ON "VinculacionPresencial"("codigoHash");

-- CreateIndex
CREATE INDEX "VinculacionPresencial_inscripcionId_createdAt_idx" ON "VinculacionPresencial"("inscripcionId", "createdAt");

-- AddForeignKey
ALTER TABLE "VinculacionPresencial" ADD CONSTRAINT "VinculacionPresencial_inscripcionId_fkey" FOREIGN KEY ("inscripcionId") REFERENCES "Inscripcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculacionPresencial" ADD CONSTRAINT "VinculacionPresencial_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculacionPresencial" ADD CONSTRAINT "VinculacionPresencial_apoderadoId_fkey" FOREIGN KEY ("apoderadoId") REFERENCES "Apoderado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una sola invitación pendiente por inscripción, incluidas las que esperan renovación.
CREATE UNIQUE INDEX "VinculacionPresencial_pendiente_key" ON "VinculacionPresencial" ("inscripcionId") WHERE "revocadaAt" IS NULL AND "consumidaAt" IS NULL;
ALTER TABLE "VinculacionPresencial" ADD CONSTRAINT "VinculacionPresencial_consumida_check" CHECK (("consumidaAt" IS NULL AND "apoderadoId" IS NULL) OR ("consumidaAt" IS NOT NULL AND "apoderadoId" IS NOT NULL));
COMMIT;
