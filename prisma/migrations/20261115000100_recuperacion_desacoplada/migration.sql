CREATE TABLE "SolicitudRecuperacion" (
 id UUID NOT NULL PRIMARY KEY,
 orden BIGSERIAL NOT NULL UNIQUE,
 "destinatarioHash" TEXT NOT NULL,
 "correoCifrado" TEXT,
 estado TEXT NOT NULL DEFAULT 'PENDIENTE',
 motivo TEXT,
 "recuperacionId" UUID,
 "bloqueoToken" UUID,
 "bloqueoHasta" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiraAt" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP+interval '10 minutes'),
 "terminadoAt" TIMESTAMPTZ(3),
 CONSTRAINT "SolicitudRecuperacion_estado_check" CHECK (estado IN ('PENDIENTE','ENVIANDO','ENVIADO','OMITIDO','FALLIDO','REVISION'))
);
CREATE INDEX "SolicitudRecuperacion_estado_orden_idx" ON "SolicitudRecuperacion"(estado,orden);
CREATE INDEX "SolicitudRecuperacion_destinatarioHash_orden_idx" ON "SolicitudRecuperacion"("destinatarioHash",orden);
-- Solo cola nueva. No altera contraseñas, sesiones, enlaces o envíos existentes.
