-- CreateTable
CREATE TABLE "Paciente" (
    "id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaNacimiento" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluacion" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "correoPadre" TEXT NOT NULL,
    "anteroposterior" DOUBLE PRECISION NOT NULL,
    "biparietal" DOUBLE PRECISION NOT NULL,
    "diagonalIzq" DOUBLE PRECISION NOT NULL,
    "diagonalDer" DOUBLE PRECISION NOT NULL,
    "indiceCraneal" DOUBLE PRECISION NOT NULL,
    "indiceAsimetria" DOUBLE PRECISION NOT NULL,
    "diagnostico" TEXT NOT NULL,
    "recomendacion" TEXT NOT NULL,
    "kinesiologa" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_rut_key" ON "Paciente"("rut");

-- AddForeignKey
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
