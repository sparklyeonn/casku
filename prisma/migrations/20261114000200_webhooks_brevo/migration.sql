ALTER TABLE "EnvioTransaccional" ADD COLUMN "destinatarioClave" TEXT,
  ADD COLUMN "entrega" TEXT NOT NULL DEFAULT 'SIN_CONFIRMAR';
CREATE INDEX "EnvioTransaccional_proveedorId_idx" ON "EnvioTransaccional"("proveedorId");
ALTER TABLE "EnvioTransaccional" ADD CONSTRAINT "EnvioTransaccional_entrega_check"
  CHECK (entrega IN ('SIN_CONFIRMAR','REBOTE_TEMPORAL','ENTREGADO','REBOTE','QUEJA'));
ALTER TABLE "NotificacionCorreo" ADD COLUMN "destinatarioClave" TEXT,
  ADD COLUMN "envioClave" TEXT,
  ADD COLUMN "aplicadaEnvioAt" TIMESTAMPTZ(3);
ALTER TABLE "NotificacionCorreo" DROP CONSTRAINT "NotificacionCorreo_tipo_check";
ALTER TABLE "NotificacionCorreo" ADD CONSTRAINT "NotificacionCorreo_tipo_check"
  CHECK (tipo IN ('ENTREGADO','REBOTE_TEMPORAL','REBOTE','QUEJA'));
-- No se inventan destinatarios, eventos, autorizaciones ni entregas históricas.
ALTER TABLE "OrdenCorreo" DROP CONSTRAINT "OrdenCorreo_entrega_check";
ALTER TABLE "OrdenCorreo" ADD CONSTRAINT "OrdenCorreo_entrega_check"
  CHECK (entrega IN ('SIN_CONFIRMAR','REBOTE_TEMPORAL','ENTREGADO','REBOTE','QUEJA'));
