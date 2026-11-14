CREATE TABLE "EnvioTransaccional" (
  "clave" TEXT NOT NULL PRIMARY KEY,
  "finalidad" TEXT NOT NULL,
  "hashMensaje" TEXT,
  "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "motivo" TEXT,
  "intentos" INTEGER NOT NULL DEFAULT 0,
  "disponibleAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bloqueoToken" UUID,
  "bloqueoHasta" TIMESTAMPTZ(3),
  "proveedorId" TEXT,
  "aceptadoAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnvioTransaccional_estado_check" CHECK (estado IN ('PENDIENTE','ENVIANDO','ACEPTADO','REINTENTABLE','RECHAZADO','REVISION')),
  CONSTRAINT "EnvioTransaccional_intentos_check" CHECK (intentos >= 0)
);
CREATE INDEX "EnvioTransaccional_estado_disponibleAt_idx" ON "EnvioTransaccional"(estado,"disponibleAt");
-- No repetir con otro proveedor confirmaciones que ya tuvieron un intento incierto.
-- Se conservan intactos la inscripción, el correo anterior y su historial.
INSERT INTO "EnvioTransaccional" (clave,finalidad,estado,motivo)
SELECT 'registration-' || id::text || CASE WHEN "revisionContenido"=1 THEN '' ELSE '-revision-' || "revisionContenido"::text END,
       'CONFIRMACION','REVISION','PROVEEDOR_ANTERIOR'
FROM "CorreoInscripcion" WHERE intentos>0 AND estado<>'ENVIADO';
