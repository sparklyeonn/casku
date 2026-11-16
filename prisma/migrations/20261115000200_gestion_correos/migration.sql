ALTER TABLE "EnvioTransaccional" ADD COLUMN "idGestion" UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX "EnvioTransaccional_idGestion_key" ON "EnvioTransaccional"("idGestion");
CREATE TABLE "GestionCorreo" (
 id UUID NOT NULL PRIMARY KEY, tipo TEXT NOT NULL, "destinoId" UUID NOT NULL,
 estado TEXT NOT NULL DEFAULT 'PENDIENTE', revision INTEGER NOT NULL DEFAULT 0, "huellaCierre" TEXT,
 CONSTRAINT "GestionCorreo_tipo_destinoId_key" UNIQUE(tipo,"destinoId"),
 CHECK (estado IN ('PENDIENTE','EN_REVISION','CERRADO')), CHECK (revision>=0)
);
CREATE TABLE "CambioGestionCorreo" (
 id UUID NOT NULL PRIMARY KEY, tipo TEXT NOT NULL, "destinoId" UUID NOT NULL, "actorId" TEXT NOT NULL,"actorNombre" TEXT NOT NULL,
 accion TEXT NOT NULL, motivo TEXT NOT NULL, revision INTEGER NOT NULL, huella TEXT NOT NULL,
 anterior JSONB NOT NULL, nueva JSONB NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CambioGestionCorreo_tipo_destinoId_revision_key" UNIQUE(tipo,"destinoId",revision)
);
CREATE INDEX "CambioGestionCorreo_tipo_destinoId_createdAt_idx" ON "CambioGestionCorreo"(tipo,"destinoId","createdAt");
CREATE FUNCTION conservar_gestion_correo() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'El historial de gestión de correos es inmutable'; END $$;
CREATE TRIGGER "CambioGestionCorreo_inmutable" BEFORE UPDATE OR DELETE ON "CambioGestionCorreo"
 FOR EACH ROW EXECUTE FUNCTION conservar_gestion_correo();
-- Proyección operativa: no contiene cuerpos, direcciones, medidas, nombres de bebés ni tokens.
CREATE VIEW "VistaCorreoAdministracion" AS
WITH fuentes AS (
 SELECT 'CONFIRMACION'::text tipo,c.id,'CONFIRMACION'::text finalidad,i."eventoId",i.numero,
 'SIN_CONFIRMAR'::text entrega,c.estado::text proceso,c.intentos,c."ultimoError" motivo,c."createdAt" AT TIME ZONE 'UTC' creado,c."updatedAt" AT TIME ZONE 'UTC' actualizado,
 c."proveedorId" mensaje,'legacy'::text proveedor,
 'registration-'||c.id::text||CASE WHEN c."revisionContenido"=1 THEN '' ELSE '-revision-'||c."revisionContenido"::text END clave
 FROM "CorreoInscripcion" c JOIN "Inscripcion" i ON i.id=c."inscripcionId"
 UNION ALL
 SELECT 'CLINICO',o.id,'RESULTADO_'||o.etapa,f."eventoId",NULL::integer,o.entrega,o.estado,o.intentos,o.motivo,
 o."createdAt" AT TIME ZONE 'UTC',o."updatedAt" AT TIME ZONE 'UTC',o."proveedorId",o.proveedor,o."claveIdempotencia"
 FROM "OrdenCorreo" o JOIN "ResultadoPublicado" p ON p.id=o."publicacionId" JOIN "Evaluacion" ev ON ev.id=p."evaluacionId" LEFT JOIN "EntradaFila" f ON f.id=ev."filaId"
 UNION ALL
 SELECT 'RESULTADO_LEGADO',c.id,'RESULTADO_INICIAL',f."eventoId",NULL::integer,'SIN_CONFIRMAR',c.estado::text,c.intentos,c."ultimoError",
 c."createdAt" AT TIME ZONE 'UTC',c."updatedAt" AT TIME ZONE 'UTC',c."proveedorId",'legacy','result-'||c.id::text
 FROM "CorreoResultado" c JOIN "ResultadoPublicado" p ON p.id=c."publicacionId" JOIN "Evaluacion" ev ON ev.id=p."evaluacionId" LEFT JOIN "EntradaFila" f ON f.id=ev."filaId"
 WHERE NOT EXISTS(SELECT 1 FROM "OrdenCorreo" o WHERE o."claveIdempotencia"='result-'||c.id::text)
 UNION ALL
 SELECT 'RECUPERACION',s.id,'RECUPERACION',NULL::uuid,NULL::integer,'SIN_CONFIRMAR',s.estado,0,s.motivo,s."createdAt",COALESCE(s."terminadoAt",s."createdAt"),NULL::text,'brevo',
 CASE WHEN s."recuperacionId" IS NOT NULL THEN 'team-recovery-'||s."recuperacionId"::text ELSE NULL END
 FROM "SolicitudRecuperacion" s
), todos AS (
 SELECT f.tipo,f.id,f.finalidad,f."eventoId",f.numero,f.proceso,
 COALESCE(l.estado,CASE WHEN f.proceso='ENVIADO' THEN 'ACEPTADO' ELSE f.proceso END) estado,
 CASE WHEN COALESCE(array_position(ARRAY['SIN_CONFIRMAR','REBOTE_TEMPORAL','ENTREGADO','REBOTE','QUEJA'],l.entrega),0)>array_position(ARRAY['SIN_CONFIRMAR','REBOTE_TEMPORAL','ENTREGADO','REBOTE','QUEJA'],f.entrega) THEN l.entrega ELSE f.entrega END entrega,COALESCE(l.intentos,f.intentos) intentos,COALESCE(l.motivo,f.motivo) motivo,
 f.creado,GREATEST(f.actualizado,l."updatedAt") actualizado,COALESCE(l."proveedorId",f.mensaje) mensaje,
 CASE WHEN l.clave IS NOT NULL THEN 'brevo' ELSE f.proveedor END proveedor,f.clave,
 EXISTS(SELECT 1 FROM "SupresionCorreo" s WHERE s.clave=l."destinatarioClave") suprimido
 FROM fuentes f LEFT JOIN "EnvioTransaccional" l ON l.clave=f.clave
 UNION ALL
 SELECT 'TRANSACCIONAL',l."idGestion",l.finalidad,ri."eventoId",ri.numero,l.estado,l.estado,l.entrega,l.intentos,l.motivo,
 l."createdAt",l."updatedAt",l."proveedorId",'brevo',l.clave,EXISTS(SELECT 1 FROM "SupresionCorreo" s WHERE s.clave=l."destinatarioClave")
 FROM "EnvioTransaccional" l
 LEFT JOIN "CorreoInscripcion" ci ON ci.id=CASE WHEN l.clave~'^registration-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-revision-[0-9]+)?$' THEN substring(l.clave from 14 for 36)::uuid ELSE NULL END
 LEFT JOIN "Inscripcion" ri ON ri.id=ci."inscripcionId"
 WHERE NOT EXISTS(SELECT 1 FROM fuentes f WHERE f.clave=l.clave)
)
SELECT t.*,e.nombre "eventoNombre",
 md5(concat_ws('|',t.estado,t.proceso,t.entrega,t.intentos,t.suprimido,t.clave)) huella
 FROM todos t LEFT JOIN "Evento" e ON e.id=t."eventoId";
-- Sin campañas, reintentos, activaciones o cambios de estados anteriores.
