BEGIN;
-- AlterTable
ALTER TABLE "Paciente" ADD COLUMN     "revisionDatos" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Apoderado" ADD COLUMN     "revisionDatos" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Inscripcion" ADD COLUMN     "revisionContacto" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "CorreoInscripcion" ADD COLUMN     "datosFamilia" JSONB,
ADD COLUMN     "revisionContenido" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "CambioDatos" (
    "id" UUID NOT NULL,
    "entidad" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "perfilActor" TEXT NOT NULL,
    "apoderadoId" UUID,
    "motivo" TEXT NOT NULL,
    "anterior" JSONB NOT NULL,
    "nueva" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CambioDatos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CambioDatos_apoderadoId_createdAt_idx" ON "CambioDatos"("apoderadoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CambioDatos_entidad_registroId_revision_key" ON "CambioDatos"("entidad", "registroId", "revision");

ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_revision_datos_check" CHECK ("revisionDatos">0);
ALTER TABLE "Apoderado" ADD CONSTRAINT "Apoderado_revision_datos_check" CHECK ("revisionDatos">0);
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_revision_contacto_check" CHECK ("revisionContacto">0);
ALTER TABLE "CorreoInscripcion" ADD CONSTRAINT "CorreoInscripcion_revision_contenido_check" CHECK ("revisionContenido">0);
ALTER TABLE "CambioDatos" ADD CONSTRAINT "CambioDatos_entidad_check" CHECK (entidad IN ('BEBE','APODERADO','CONTACTO'));
ALTER TABLE "CambioDatos" ADD CONSTRAINT "CambioDatos_revision_check" CHECK (revision>1);
UPDATE "CorreoInscripcion" c SET "datosFamilia"=jsonb_build_object('nombreBebe',p.nombre,'correo',coalesce(a.correo,i."contactoCorreo"),'conCuenta',i."apoderadoId" IS NOT NULL) FROM "Inscripcion" i JOIN "Paciente" p ON p.id=i."pacienteId" LEFT JOIN "Apoderado" a ON a.id=i."apoderadoId" WHERE c."inscripcionId"=i.id;
ALTER TABLE "CambioDatos" ADD CONSTRAINT "CambioDatos_perfil_actor_check" CHECK ("perfilActor" IN ('ADMIN','RECEPCION','APODERADO'));
COMMIT;
