ALTER TABLE "Inscripcion" ADD COLUMN "revisionCalendlyPendiente" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE "EstadoWebhookCalendly" (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, huella TEXT,
 "conectadaAt" TIMESTAMP(3), "verificadaAt" TIMESTAMP(3), fallo BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE "AvisoCalendly" (
 id TEXT PRIMARY KEY, tipo TEXT NOT NULL, "invitadoUri" TEXT NOT NULL,
 "creadoAt" TIMESTAMP(3) NOT NULL, estado TEXT NOT NULL DEFAULT 'PENDIENTE',
 intentos INTEGER NOT NULL DEFAULT 0, "disponibleAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "bloqueoToken" UUID, "bloqueoHasta" TIMESTAMP(3), resultado TEXT,
 "recibidoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "procesadoAt" TIMESTAMP(3),
 CHECK (estado IN ('PENDIENTE','PROCESANDO','PROCESADO','IGNORADO','REVISION')),
 CHECK (("bloqueoToken" IS NULL) = ("bloqueoHasta" IS NULL))
);
CREATE INDEX "AvisoCalendly_estado_disponibleAt_idx" ON "AvisoCalendly"(estado,"disponibleAt");

CREATE TABLE "CambioCitaCalendly" (
 id UUID PRIMARY KEY, "inscripcionId" UUID NOT NULL REFERENCES "Inscripcion"(id) ON DELETE RESTRICT,
 "invitadoNuevo" TEXT NOT NULL, anterior JSONB NOT NULL, nueva JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CambioCitaCalendly_inscripcionId_invitadoNuevo_key" ON "CambioCitaCalendly"("inscripcionId","invitadoNuevo");
