BEGIN;
-- DropIndex
DROP INDEX "OrdenCorreo_publicacionId_etapa_key";

-- AlterTable
ALTER TABLE "ResultadoPublicado" ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
ADD COLUMN     "revisionControl" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "versionActual" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "OrdenCorreo" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "VersionResultado" (
    "id" UUID NOT NULL,
    "publicacionId" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "revisionEvaluacion" INTEGER NOT NULL,
    "datos" JSONB NOT NULL,
    "motivo" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionResultado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CambioResultado" (
    "id" UUID NOT NULL,
    "publicacionId" UUID NOT NULL,
    "actorId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "versionAnterior" INTEGER NOT NULL,
    "versionNueva" INTEGER,
    "revisionControl" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "solicitudHash" TEXT NOT NULL,
    "enviosEnCurso" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CambioResultado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VersionResultado_publicacionId_numero_key" ON "VersionResultado"("publicacionId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "CambioResultado_publicacionId_revisionControl_key" ON "CambioResultado"("publicacionId", "revisionControl");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCorreo_publicacionId_version_etapa_key" ON "OrdenCorreo"("publicacionId", "version", "etapa");

-- AddForeignKey
ALTER TABLE "VersionResultado" ADD CONSTRAINT "VersionResultado_publicacionId_fkey" FOREIGN KEY ("publicacionId") REFERENCES "ResultadoPublicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioResultado" ADD CONSTRAINT "CambioResultado_publicacionId_fkey" FOREIGN KEY ("publicacionId") REFERENCES "ResultadoPublicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO "VersionResultado" (id,"publicacionId",numero,"revisionEvaluacion",datos,motivo,"actorId","createdAt")
SELECT id,id,1,revision,datos,'Publicación inicial',"publicadoPorId","publicadoAt" FROM "ResultadoPublicado";
ALTER TABLE "ResultadoPublicado" ADD CONSTRAINT "ResultadoPublicado_estado_check" CHECK (estado IN ('VIGENTE','RETIRADO'));
ALTER TABLE "ResultadoPublicado" ADD CONSTRAINT "ResultadoPublicado_version_check" CHECK ("versionActual">0 AND "revisionControl">0);
ALTER TABLE "VersionResultado" ADD CONSTRAINT "VersionResultado_numero_check" CHECK (numero>0 AND "revisionEvaluacion">0);
ALTER TABLE "CambioResultado" ADD CONSTRAINT "CambioResultado_accion_check" CHECK (accion IN ('CORREGIR','RETIRAR') AND length(motivo) BETWEEN 5 AND 500 AND "revisionControl">1 AND "enviosEnCurso">=0);
ALTER TABLE "OrdenCorreo" ADD CONSTRAINT "OrdenCorreo_version_check" CHECK (version>0);
CREATE FUNCTION "preservar_historial_resultado"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'El historial publicado es de solo insercion' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "VersionResultado_inmutable" BEFORE UPDATE OR DELETE ON "VersionResultado" FOR EACH ROW EXECUTE FUNCTION "preservar_historial_resultado"();
CREATE TRIGGER "VersionResultado_no_truncar" BEFORE TRUNCATE ON "VersionResultado" FOR EACH STATEMENT EXECUTE FUNCTION "preservar_historial_resultado"();
CREATE TRIGGER "CambioResultado_inmutable" BEFORE UPDATE OR DELETE ON "CambioResultado" FOR EACH ROW EXECUTE FUNCTION "preservar_historial_resultado"();
CREATE TRIGGER "CambioResultado_no_truncar" BEFORE TRUNCATE ON "CambioResultado" FOR EACH STATEMENT EXECUTE FUNCTION "preservar_historial_resultado"();
CREATE FUNCTION "preservar_publicacion_original"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.id,NEW."evaluacionId",NEW."apoderadoId",NEW."publicadoPorId",NEW."publicadoAt",NEW.revision,NEW.datos) IS DISTINCT FROM ROW(OLD.id,OLD."evaluacionId",OLD."apoderadoId",OLD."publicadoPorId",OLD."publicadoAt",OLD.revision,OLD.datos) THEN
  RAISE EXCEPTION 'La copia original publicada no se modifica' USING ERRCODE='23514';
 END IF;
 IF NEW."versionActual"<OLD."versionActual" OR NEW."versionActual">OLD."versionActual"+1 OR NEW."revisionControl"<>OLD."revisionControl"+1 THEN
  RAISE EXCEPTION 'Revision de publicacion incoherente' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM "VersionResultado" WHERE "publicacionId"=NEW.id AND numero=NEW."versionActual") THEN
  RAISE EXCEPTION 'Version publicada inexistente' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ResultadoPublicado_original_inmutable" BEFORE UPDATE ON "ResultadoPublicado" FOR EACH ROW EXECUTE FUNCTION "preservar_publicacion_original"();
COMMIT;
