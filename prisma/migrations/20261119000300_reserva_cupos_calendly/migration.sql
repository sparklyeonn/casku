-- Reserva logística sin crear bebés, cuentas, inscripciones ni correos.
CREATE TABLE "JornadaCalendly" (
 "eventoId" UUID PRIMARY KEY REFERENCES "Evento"("id") ON DELETE RESTRICT,
 "fecha" DATE NOT NULL UNIQUE,
 "sincronizadaAt" TIMESTAMP(3),
 "bloqueoToken" UUID,
 "bloqueoHasta" TIMESTAMP(3),
 "errorSincronizacion" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT "JornadaCalendly_bloqueo_check" CHECK (("bloqueoToken" IS NULL) = ("bloqueoHasta" IS NULL))
);
CREATE TABLE "ReservaCupoCalendly" (
 "invitadoId" TEXT PRIMARY KEY,
 "reservaId" TEXT NOT NULL,
 "eventoId" UUID NOT NULL REFERENCES "JornadaCalendly"("eventoId") ON DELETE RESTRICT,
 "inicio" TIMESTAMP(3) NOT NULL,
 "fin" TIMESTAMP(3) NOT NULL,
 "estado" TEXT NOT NULL CHECK ("estado" IN ('ACTIVA','CANCELADA')),
 "inscripcionId" UUID UNIQUE,
 "verificadaAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ReservaCupoCalendly_horario_check" CHECK ("fin" > "inicio"),
 FOREIGN KEY ("inscripcionId","eventoId") REFERENCES "Inscripcion"("id","eventoId") ON DELETE RESTRICT
);
CREATE INDEX "ReservaCupoCalendly_eventoId_estado_idx" ON "ReservaCupoCalendly"("eventoId","estado");
CREATE UNIQUE INDEX "ReservaCupoCalendly_inscripcionId_eventoId_key" ON "ReservaCupoCalendly"("inscripcionId","eventoId");
