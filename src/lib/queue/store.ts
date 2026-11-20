import { PRIVACY_VERSION } from "@/lib/privacy/policy"
import type { Prisma } from "@prisma/client"
import { chooseWithAppointment, type Origin } from "./policy"

// Invocar bajo bloqueo del evento al reservar; una lectura de recepción solo anticipa.
export async function nextWaiting(tx: Prisma.TransactionClient, eventoId: string, streak: number, now: Date) {
  const head = async (origen: Origin) => {
    const row = await tx.entradaFila.findFirst({ where: { eventoId, estado: "EN_ESPERA", AND: [{ OR: [{ inscripcion: { citaInicio: null } }, { reincorporadaAt: { not: null }, inscripcion: { citaInicio: { lte: now } } }] }], inscripcion: { origen, revisionCalendlyPendiente: false, autorizacion: { is: { datos: true, versionTexto: PRIVACY_VERSION } } } }, orderBy: [{ esperaDesde: "asc" }, { orden: "asc" }], select: { id: true, orden: true, esperaDesde: true } })
    return row ? { ...row, origen } : null
  }
  const previous = await head("PREVIA"), walkin = await head("PRESENCIAL")
  const due = await tx.entradaFila.findFirst({
    where: { eventoId, estado: "EN_ESPERA", reincorporadaAt: null, inscripcion: { citaInicio: { lte: now }, revisionCalendlyPendiente: false, autorizacion: { is: { datos: true, versionTexto: PRIVACY_VERSION } } } },
    orderBy: [{ inscripcion: { citaInicio: "asc" } }, { esperaDesde: "asc" }, { orden: "asc" }],
    select: { id: true, orden: true, esperaDesde: true, inscripcion: { select: { origen: true, citaInicio: true } } },
  })
  // Solo adelantar una llegada ya autorizada cuando no queda ninguna familia habilitada.
  const early = !previous && !walkin && !due ? await tx.entradaFila.findFirst({
    where: { eventoId, estado: "EN_ESPERA", inscripcion: { citaInicio: { gt: now }, revisionCalendlyPendiente: false, autorizacion: { is: { datos: true, versionTexto: PRIVACY_VERSION } } } },
    orderBy: [{ inscripcion: { citaInicio: "asc" } }, { esperaDesde: "asc" }, { orden: "asc" }],
    select: { id: true, orden: true, esperaDesde: true, inscripcion: { select: { origen: true, citaInicio: true } } },
  }) : null
  return chooseWithAppointment(previous, walkin, due ? { id: due.id, orden: due.orden, esperaDesde: due.esperaDesde, origen: due.inscripcion.origen, citaInicio: due.inscripcion.citaInicio! } : null, streak, now, early ? { id: early.id, orden: early.orden, esperaDesde: early.esperaDesde, origen: early.inscripcion.origen, citaInicio: early.inscripcion.citaInicio! } : null)
}
