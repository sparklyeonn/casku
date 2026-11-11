BEGIN;
-- AlterTable
ALTER TABLE "Evaluacion" ADD COLUMN     "autorizacionId" UUID;

-- AlterTable
ALTER TABLE "Inscripcion" ADD COLUMN     "autorizacionId" UUID;

-- AlterTable
ALTER TABLE "ListaEspera" ADD COLUMN     "autorizacionId" UUID;

-- CreateTable
CREATE TABLE "AutorizacionPrivacidad" (
    "id" UUID NOT NULL,
    "ambito" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "eventoId" UUID,
    "apoderadoId" UUID,
    "datos" BOOLEAN NOT NULL,
    "correoResultados" BOOLEAN NOT NULL DEFAULT false,
    "seguimiento" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "versionTexto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutorizacionPrivacidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CambioPrivacidad" (
    "id" UUID NOT NULL,
    "autorizacionId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "perfilActor" TEXT NOT NULL,
    "declarante" TEXT NOT NULL,
    "referencia" TEXT,
    "canal" TEXT NOT NULL,
    "versionTexto" TEXT NOT NULL,
    "textos" JSONB NOT NULL,
    "anterior" JSONB,
    "nueva" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CambioPrivacidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccesoPrivado" (
    "id" UUID NOT NULL,
    "actorId" TEXT NOT NULL,
    "perfilActor" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "recursoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccesoPrivado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutorizacionPrivacidad_ambito_key" ON "AutorizacionPrivacidad"("ambito");

-- CreateIndex
CREATE INDEX "AutorizacionPrivacidad_apoderadoId_updatedAt_idx" ON "AutorizacionPrivacidad"("apoderadoId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CambioPrivacidad_autorizacionId_revision_key" ON "CambioPrivacidad"("autorizacionId", "revision");

-- CreateIndex
CREATE INDEX "AccesoPrivado_createdAt_id_idx" ON "AccesoPrivado"("createdAt", "id");

-- CreateIndex
CREATE INDEX "AccesoPrivado_actorId_createdAt_idx" ON "AccesoPrivado"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_autorizacionId_fkey" FOREIGN KEY ("autorizacionId") REFERENCES "AutorizacionPrivacidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_autorizacionId_fkey" FOREIGN KEY ("autorizacionId") REFERENCES "AutorizacionPrivacidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_autorizacionId_fkey" FOREIGN KEY ("autorizacionId") REFERENCES "AutorizacionPrivacidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutorizacionPrivacidad" ADD CONSTRAINT "AutorizacionPrivacidad_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutorizacionPrivacidad" ADD CONSTRAINT "AutorizacionPrivacidad_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutorizacionPrivacidad" ADD CONSTRAINT "AutorizacionPrivacidad_apoderadoId_fkey" FOREIGN KEY ("apoderadoId") REFERENCES "Apoderado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPrivacidad" ADD CONSTRAINT "CambioPrivacidad_autorizacionId_fkey" FOREIGN KEY ("autorizacionId") REFERENCES "AutorizacionPrivacidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutorizacionPrivacidad" ADD CONSTRAINT "AutorizacionPrivacidad_opciones_check" CHECK
(revision>0 AND (NOT "correoResultados" OR datos) AND (NOT seguimiento OR "correoResultados"));
ALTER TABLE "CambioPrivacidad" ADD CONSTRAINT "CambioPrivacidad_revision_check" CHECK (revision>0);
CREATE FUNCTION "impedir_cambio_historial_privacidad"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'El historial de privacidad es de solo insercion' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "CambioPrivacidad_inmutable" BEFORE UPDATE OR DELETE ON "CambioPrivacidad" FOR EACH ROW EXECUTE FUNCTION "impedir_cambio_historial_privacidad"();
CREATE TRIGGER "AccesoPrivado_inmutable" BEFORE UPDATE OR DELETE ON "AccesoPrivado" FOR EACH ROW EXECUTE FUNCTION "impedir_cambio_historial_privacidad"();
COMMIT;
