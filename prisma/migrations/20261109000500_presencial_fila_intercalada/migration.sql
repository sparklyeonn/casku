-- CreateEnum
CREATE TYPE "OrigenInscripcion" AS ENUM ('PREVIA', 'PRESENCIAL');

-- AlterTable
ALTER TABLE "Evento" ADD COLUMN     "previosConsecutivos" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Evaluacion" ALTER COLUMN "correoPadre" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Inscripcion" ADD COLUMN     "contactoCorreo" TEXT,
ADD COLUMN     "contactoNombre" TEXT,
ADD COLUMN     "contactoTelefono" TEXT,
ADD COLUMN     "origen" "OrigenInscripcion" NOT NULL DEFAULT 'PREVIA',
ADD COLUMN     "registradoPorId" TEXT,
ALTER COLUMN "apoderadoId" DROP NOT NULL;

ALTER TABLE "Evento" ADD CONSTRAINT "Evento_previos_consecutivos_check" CHECK ("previosConsecutivos" BETWEEN 0 AND 3);
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_contacto_presencial_check" CHECK ("apoderadoId" IS NOT NULL OR ("origen" = 'PRESENCIAL' AND "contactoNombre" IS NOT NULL AND "registradoPorId" IS NOT NULL));

