BEGIN;
CREATE TABLE "ResultadoContacto" (
 "id" UUID NOT NULL PRIMARY KEY,
 "evaluacionId" TEXT NOT NULL REFERENCES "Evaluacion"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "revision" INTEGER NOT NULL CHECK (revision > 0),
 "protocolo" TEXT NOT NULL,
 "destinatario" TEXT NOT NULL,
 "nombreApoderado" TEXT NOT NULL,
 "datos" JSONB NOT NULL,
 "hashDatos" TEXT NOT NULL,
 "mensaje" JSONB NOT NULL,
 "consentimientoVersion" TEXT NOT NULL,
 "consentimientoTextos" JSONB NOT NULL,
 "confirmarApoderado" BOOLEAN NOT NULL CHECK ("confirmarApoderado"),
 "autorizarCorreo" BOOLEAN NOT NULL CHECK ("autorizarCorreo"),
 "canal" TEXT NOT NULL DEFAULT 'PRESENCIAL' CHECK (canal='PRESENCIAL'),
 "actorId" TEXT NOT NULL REFERENCES "CuentaEquipo"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "autorizacionId" UUID NOT NULL REFERENCES "AutorizacionPrivacidad"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "autorizacionRevision" INTEGER NOT NULL CHECK ("autorizacionRevision">0),
 "contexto" TEXT NOT NULL,
 "solicitudHash" TEXT NOT NULL,
 "claveEnvio" TEXT NOT NULL UNIQUE,
 "motivo" TEXT CHECK (motivo IS NULL OR length(motivo) BETWEEN 5 AND 500),
 "anteriorId" UUID REFERENCES "ResultadoContacto"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "estado" TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ENVIANDO','ACEPTADO','REINTENTABLE','REVISION','RECHAZADO','CANCELADO')),
 "proveedorId" TEXT,
 "ultimoError" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ResultadoContacto_evaluacionId_revision_contexto_key" UNIQUE ("evaluacionId",revision,contexto)
);
CREATE INDEX "ResultadoContacto_actorId_createdAt_idx" ON "ResultadoContacto"("actorId","createdAt");
CREATE FUNCTION preservar_resultado_contacto() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'La copia de contacto es inmutable' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['estado','proveedorId','ultimoError','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['estado','proveedorId','ultimoError','updatedAt']) THEN
  RAISE EXCEPTION 'La copia y autorizacion de contacto son inmutables' USING ERRCODE='23514';
 END IF;
 IF OLD.estado='ACEPTADO' AND (NEW.estado<>'ACEPTADO' OR NEW."proveedorId" IS DISTINCT FROM OLD."proveedorId") THEN
  RAISE EXCEPTION 'La aceptacion de contacto se conserva' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ResultadoContacto_inmutable" BEFORE UPDATE OR DELETE ON "ResultadoContacto" FOR EACH ROW EXECUTE FUNCTION preservar_resultado_contacto();
CREATE TRIGGER "ResultadoContacto_no_truncar" BEFORE TRUNCATE ON "ResultadoContacto" FOR EACH STATEMENT EXECUTE FUNCTION preservar_resultado_contacto();
COMMIT;
