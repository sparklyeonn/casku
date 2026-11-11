import { PRIVACY_VERSION } from "@/lib/privacy/policy"
import type { Prisma } from "@prisma/client"
import { chooseNext, type Origin } from "./policy"

// Invocar bajo bloqueo del evento al reservar; una lectura de recepción solo anticipa.
export async function nextWaiting(tx: Prisma.TransactionClient, eventoId: string, streak: number, now: Date) {
  const head = async (origen: Origin) => {
    const row = await tx.entradaFila.findFirst({ where: { eventoId, estado: "EN_ESPERA", inscripcion: { origen, autorizacion: { is: { datos: true, versionTexto: PRIVACY_VERSION } } } }, orderBy: [{ esperaDesde: "asc" }, { orden: "asc" }], select: { id: true, orden: true, esperaDesde: true } })
    return row ? { ...row, origen } : null
  }
  const previous = await head("PREVIA"), walkin = await head("PRESENCIAL")
  return chooseNext(previous, walkin, streak, now)
}
