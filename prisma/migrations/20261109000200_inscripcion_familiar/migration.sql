-- CreateEnum
CREATE TYPE "EstadoCorreo" AS ENUM ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'FALLIDO');

-- AlterTable
ALTER TABLE "Evento" ADD COLUMN     "inscripcionesAbiertas" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inscritos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ultimoNumero" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Paciente" ADD COLUMN     "apoderadoId" UUID,
ADD COLUMN     "nombreNormalizado" TEXT,
ALTER COLUMN "rut" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Apoderado" (
    "id" UUID NOT NULL,
    "correo" TEXT NOT NULL,
    "nombre" TEXT,
    "telefono" TEXT,
    "rut" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "versionSesion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Apoderado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodigoAccesoFamilia" (
    "correo" TEXT NOT NULL,
    "desafioId" UUID NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "navegadorHash" TEXT NOT NULL,
    "expiraAt" TIMESTAMP(3) NOT NULL,
    "consumidoAt" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CodigoAccesoFamilia_pkey" PRIMARY KEY ("correo")
);

-- CreateTable
CREATE TABLE "LimiteSolicitud" (
    "clave" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "expiraAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LimiteSolicitud_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "Inscripcion" (
    "id" UUID NOT NULL,
    "solicitudHash" TEXT NOT NULL,
    "eventoId" UUID NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "apoderadoId" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "qrToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorreoInscripcion" (
    "id" UUID NOT NULL,
    "inscripcionId" UUID NOT NULL,
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

    CONSTRAINT "CorreoInscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Apoderado_correo_key" ON "Apoderado"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "CodigoAccesoFamilia_desafioId_key" ON "CodigoAccesoFamilia"("desafioId");

-- CreateIndex
CREATE INDEX "LimiteSolicitud_expiraAt_idx" ON "LimiteSolicitud"("expiraAt");

-- CreateIndex
CREATE UNIQUE INDEX "Inscripcion_qrToken_key" ON "Inscripcion"("qrToken");

-- CreateIndex
CREATE INDEX "Inscripcion_apoderadoId_createdAt_idx" ON "Inscripcion"("apoderadoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Inscripcion_eventoId_numero_key" ON "Inscripcion"("eventoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Inscripcion_eventoId_pacienteId_key" ON "Inscripcion"("eventoId", "pacienteId");

-- CreateIndex
CREATE UNIQUE INDEX "CorreoInscripcion_inscripcionId_key" ON "CorreoInscripcion"("inscripcionId");

-- CreateIndex
CREATE INDEX "CorreoInscripcion_estado_disponibleAt_idx" ON "CorreoInscripcion"("estado", "disponibleAt");

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_apoderadoId_nombreNormalizado_fechaNacimiento_key" ON "Paciente"("apoderadoId", "nombreNormalizado", "fechaNacimiento");

-- AddForeignKey
ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_apoderadoId_fkey" FOREIGN KEY ("apoderadoId") REFERENCES "Apoderado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_apoderadoId_fkey" FOREIGN KEY ("apoderadoId") REFERENCES "Apoderado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorreoInscripcion" ADD CONSTRAINT "CorreoInscripcion_inscripcionId_fkey" FOREIGN KEY ("inscripcionId") REFERENCES "Inscripcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Límites que también se mantienen bajo inscripciones concurrentes.
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_inscritos_check" CHECK ("inscritos" >= 0 AND "inscritos" <= "cupos");
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_numero_check" CHECK ("ultimoNumero" >= "inscritos");
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_numero_check" CHECK ("numero" > 0);
