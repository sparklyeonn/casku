-- Migración aditiva. Paciente y Evaluacion permanecen sin cambios.
CREATE TABLE "Evento" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "lugar" TEXT NOT NULL,
    "cupos" INTEGER NOT NULL,
    "creadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Evento_cupos_check" CHECK ("cupos" BETWEEN 1 AND 100000)
);

CREATE TABLE "EventoSeleccionado" (
    "usuarioId" TEXT NOT NULL,
    "eventoId" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventoSeleccionado_pkey" PRIMARY KEY ("usuarioId")
);

CREATE INDEX "Evento_fecha_createdAt_idx" ON "Evento"("fecha", "createdAt");
CREATE INDEX "EventoSeleccionado_eventoId_idx" ON "EventoSeleccionado"("eventoId");
ALTER TABLE "EventoSeleccionado" ADD CONSTRAINT "EventoSeleccionado_eventoId_fkey"
    FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
