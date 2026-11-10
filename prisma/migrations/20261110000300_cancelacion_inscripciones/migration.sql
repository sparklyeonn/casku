BEGIN;
-- AlterEnum
ALTER TYPE "EstadoFila" ADD VALUE 'CANCELADO';

-- AlterEnum
ALTER TYPE "EstadoCorreo" ADD VALUE 'CANCELADO';

-- CreateTable
CREATE TABLE "CancelacionInscripcion" (
    "id" UUID NOT NULL,
    "inscripcionId" UUID NOT NULL,
    "actorId" TEXT NOT NULL,
    "perfilActor" TEXT NOT NULL,
    "nombreActor" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "estadoFilaAnterior" TEXT,
    "estadoCorreoAnterior" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancelacionInscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CancelacionInscripcion_inscripcionId_key" ON "CancelacionInscripcion"("inscripcionId");

-- AddForeignKey
ALTER TABLE "CancelacionInscripcion" ADD CONSTRAINT "CancelacionInscripcion_inscripcionId_fkey" FOREIGN KEY ("inscripcionId") REFERENCES "Inscripcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CancelacionInscripcion" ADD CONSTRAINT "CancelacionInscripcion_perfil_check" CHECK ("perfilActor" IN ('ADMIN','RECEPCION','APODERADO'));
COMMIT;
