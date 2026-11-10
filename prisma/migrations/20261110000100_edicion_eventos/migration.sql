BEGIN;
-- AlterTable
ALTER TABLE "Evento" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "CorreoInscripcion" ADD COLUMN     "datosEvento" JSONB;

-- CreateTable
CREATE TABLE "CambioEvento" (
    "id" UUID NOT NULL,
    "eventoId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "anterior" JSONB NOT NULL,
    "nueva" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CambioEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CambioEvento_eventoId_revision_key" ON "CambioEvento"("eventoId", "revision");

-- AddForeignKey
ALTER TABLE "CambioEvento" ADD CONSTRAINT "CambioEvento_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Evento" ADD CONSTRAINT "Evento_revision_check" CHECK (revision > 0);
ALTER TABLE "CambioEvento" ADD CONSTRAINT "CambioEvento_revision_check" CHECK (revision > 1);
UPDATE "CorreoInscripcion" c SET "datosEvento"=jsonb_build_object('nombre',e.nombre,'fecha',to_char(e.fecha,'YYYY-MM-DD'),'lugar',e.lugar) FROM "Inscripcion" i JOIN "Evento" e ON e.id=i."eventoId" WHERE c."inscripcionId"=i.id;
COMMIT;
