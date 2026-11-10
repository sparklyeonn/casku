import { prisma } from "@/lib/prisma"
import { ReceptionConflict } from "./http"
import { receptionSelect, receptionSummary } from "./store"

export async function rejoinQueue(staffId: string, eventoId: string, inscripcionId: string, ausenciaId: string) {
  return prisma.$transaction(async tx => {
    const events = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Evento" WHERE "id" = ${eventoId}::uuid FOR UPDATE`
    if (!events.length) return null
    const row = await tx.inscripcion.findFirst({ where: { id: inscripcionId, eventoId }, select: receptionSelect })
    if (!row) return null
    if (!row.fila || row.fila.ausenciaId !== ausenciaId) throw new ReceptionConflict("La ausencia cambió o ya no está disponible. Busca nuevamente la inscripción.")
    if (row.fila.estado !== "AUSENTE") {
      if (row.fila.reincorporadaAt) return { inscripcion: receptionSummary(row), reincorporada: false }
      throw new ReceptionConflict("Esta inscripción no tiene una ausencia pendiente.")
    }
    const event = await tx.evento.update({ where: { id: eventoId }, data: { ultimoOrdenFila: { increment: 1 } }, select: { ultimoOrdenFila: true } })
    const now = new Date()
    const entry = await tx.entradaFila.update({ where: { inscripcionId }, data: { estado: "EN_ESPERA", orden: event.ultimoOrdenFila, esperaDesde: now, reincorporadaAt: now, profesionalId: null, reservaId: null, llamadaAt: null }, select: { id: true } })
    await tx.movimientoFila.create({ data: { entradaId: entry.id, ausenciaId, tipo: "REINCORPORACION", usuarioId: staffId } })
    const updated = await tx.inscripcion.findUniqueOrThrow({ where: { id: inscripcionId }, select: receptionSelect })
    return { inscripcion: receptionSummary(updated), reincorporada: true }
  }, { timeout: 15000 })
}
