import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { parseLookup } from "./input"

// Lista explícita: recepción no recibe RUT, contactos, tokens QR ni información clínica.
export const receptionSelect = {
  id: true, numero: true, eventoId: true,
  paciente: { select: { nombre: true } }, apoderado: { select: { nombre: true } },
  fila: { select: { orden: true, llegadaAt: true, estado: true } },
} satisfies Prisma.InscripcionSelect
type ReceptionRow = Prisma.InscripcionGetPayload<{ select: typeof receptionSelect }>
export function receptionSummary(row: ReceptionRow) {
  return { id: row.id, numero: row.numero, eventoId: row.eventoId, bebe: row.paciente.nombre, apoderado: row.apoderado.nombre || "Apoderado", llegada: row.fila ? { ...row.fila, llegadaAt: row.fila.llegadaAt.toISOString() } : null }
}
export async function findRegistration(eventoId: string, query: ReturnType<typeof parseLookup>) {
  const row = await prisma.inscripcion.findFirst({ where: { eventoId, ...query }, select: receptionSelect })
  return row ? receptionSummary(row) : null
}
export async function confirmArrival(eventoId: string, inscripcionId: string, staffId: string) {
  // El mismo bloqueo serializa inscripciones y llegadas; el contador se revierte si falla la entrada.
  return prisma.$transaction(async tx => {
    const event = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Evento" WHERE "id" = ${eventoId}::uuid FOR UPDATE`
    if (!event.length) return null
    const row = await tx.inscripcion.findFirst({ where: { id: inscripcionId, eventoId }, select: receptionSelect })
    if (!row) return null
    if (row.fila) return { inscripcion: receptionSummary(row), nueva: false }
    const updated = await tx.evento.update({ where: { id: eventoId }, data: { ultimoOrdenFila: { increment: 1 } }, select: { ultimoOrdenFila: true } })
    const fila = await tx.entradaFila.create({ data: { eventoId, inscripcionId, orden: updated.ultimoOrdenFila, confirmadoPorId: staffId }, select: { orden: true, llegadaAt: true, estado: true } })
    return { inscripcion: receptionSummary({ ...row, fila }), nueva: true }
  }, { timeout: 15000 })
}
export async function waitingQueue(eventoId: string, after: number) {
  return prisma.$transaction(async tx => {
    // Una sola instantánea para que el total y la página correspondan a la misma fila.
    const event = await tx.evento.findUnique({ where: { id: eventoId }, select: { id: true } })
    if (!event) return null
    const total = await tx.entradaFila.count({ where: { eventoId, estado: "EN_ESPERA" } })
    const entries = await tx.entradaFila.findMany({ where: { eventoId, estado: "EN_ESPERA", orden: { gt: after } }, orderBy: { orden: "asc" }, take: 51, select: { orden: true, inscripcion: { select: receptionSelect } } })
    return { total, inscripciones: entries.slice(0, 50).map(entry => receptionSummary(entry.inscripcion)), siguiente: entries.length > 50 ? entries[49].orden : null, actualizadaAt: new Date().toISOString() }
  }, { isolationLevel: "RepeatableRead" })
}
