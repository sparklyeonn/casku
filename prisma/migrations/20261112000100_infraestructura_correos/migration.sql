BEGIN;
-- CreateTable
CREATE TABLE "OrdenCorreo" (
    "id" UUID NOT NULL,
    "publicacionId" UUID NOT NULL,
    "etapa" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BLOQUEADO',
    "motivo" TEXT DEFAULT 'PENDIENTE_PROTOCOLO',
    "claveIdempotencia" TEXT NOT NULL,
    "destinatario" TEXT,
    "mensaje" JSONB,
    "politicaVersion" TEXT,
    "protocoloVersion" TEXT,
    "plantillaVersion" TEXT,
    "programadoAt" TIMESTAMP(3),
    "disponibleAt" TIMESTAMP(3),
    "limiteAt" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "primerIntentoAt" TIMESTAMP(3),
    "bloqueoToken" UUID,
    "bloqueoHasta" TIMESTAMP(3),
    "proveedor" TEXT,
    "proveedorId" TEXT,
    "aceptadoAt" TIMESTAMP(3),
    "entrega" TEXT NOT NULL DEFAULT 'SIN_CONFIRMAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenCorreo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentoCorreo" (
    "id" UUID NOT NULL,
    "ordenId" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "resultado" TEXT NOT NULL DEFAULT 'INICIADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadoAt" TIMESTAMP(3),

    CONSTRAINT "IntentoCorreo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificacionCorreo" (
    "id" UUID NOT NULL,
    "proveedor" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ocurridoAt" TIMESTAMP(3) NOT NULL,
    "ordenId" UUID,
    "aplicadaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificacionCorreo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupresionCorreo" (
    "clave" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupresionCorreo_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCorreo_claveIdempotencia_key" ON "OrdenCorreo"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "OrdenCorreo_estado_disponibleAt_idx" ON "OrdenCorreo"("estado", "disponibleAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCorreo_publicacionId_etapa_key" ON "OrdenCorreo"("publicacionId", "etapa");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCorreo_proveedor_proveedorId_key" ON "OrdenCorreo"("proveedor", "proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "IntentoCorreo_ordenId_numero_key" ON "IntentoCorreo"("ordenId", "numero");

-- CreateIndex
CREATE INDEX "NotificacionCorreo_proveedor_mensajeId_idx" ON "NotificacionCorreo"("proveedor", "mensajeId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificacionCorreo_proveedor_eventoId_key" ON "NotificacionCorreo"("proveedor", "eventoId");

-- AddForeignKey
ALTER TABLE "OrdenCorreo" ADD CONSTRAINT "OrdenCorreo_publicacionId_fkey" FOREIGN KEY ("publicacionId") REFERENCES "ResultadoPublicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoCorreo" ADD CONSTRAINT "IntentoCorreo_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "OrdenCorreo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificacionCorreo" ADD CONSTRAINT "NotificacionCorreo_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "OrdenCorreo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "OrdenCorreo" ADD CONSTRAINT "OrdenCorreo_etapa_check" CHECK (etapa IN ('INICIAL','SEMANA','MES'));
ALTER TABLE "OrdenCorreo" ADD CONSTRAINT "OrdenCorreo_estado_check" CHECK (estado IN ('BLOQUEADO','PENDIENTE','ENVIANDO','ACEPTADO','OMITIDO','CANCELADO','AGOTADO','REVISION'));
ALTER TABLE "OrdenCorreo" ADD CONSTRAINT "OrdenCorreo_intentos_check" CHECK (intentos BETWEEN 0 AND 5);
ALTER TABLE "OrdenCorreo" ADD CONSTRAINT "OrdenCorreo_entrega_check" CHECK (entrega IN ('SIN_CONFIRMAR','ENTREGADO','REBOTE','QUEJA'));
ALTER TABLE "OrdenCorreo" ADD CONSTRAINT "OrdenCorreo_payload_check" CHECK (estado NOT IN ('PENDIENTE','ENVIANDO') OR (mensaje IS NOT NULL AND destinatario IS NOT NULL AND "politicaVersion" IS NOT NULL AND "programadoAt" IS NOT NULL AND "limiteAt" IS NOT NULL AND "disponibleAt" IS NOT NULL));
ALTER TABLE "OrdenCorreo" ADD CONSTRAINT "OrdenCorreo_bloqueo_check" CHECK ((estado='ENVIANDO') = ("bloqueoToken" IS NOT NULL AND "bloqueoHasta" IS NOT NULL));
ALTER TABLE "IntentoCorreo" ADD CONSTRAINT "IntentoCorreo_numero_check" CHECK (numero BETWEEN 1 AND 5);
ALTER TABLE "NotificacionCorreo" ADD CONSTRAINT "NotificacionCorreo_tipo_check" CHECK (tipo IN ('ENTREGADO','REBOTE','QUEJA'));
COMMIT;
