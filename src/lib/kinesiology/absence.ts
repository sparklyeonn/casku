import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { AttentionConflict, AttentionUnavailable } from "./http"

export async function markAbsent(staffId: string, id: string, reservaId: string) {
  return prisma.$transaction(async tx => {
    const known = await tx.entradaFila.findUnique({ where: { id }, select: { eventoId: true } })
    if (!known) throw new AttentionUnavailable()
    await tx.$queryRaw`SELECT "id" FROM "Evento" WHERE "id" = ${known.eventoId}::uuid FOR UPDATE`
    const row = await tx.entradaFila.findUnique({ where: { id }, select: { estado: true, profesionalId: true, reservaId: true, ausenciaId: true, evaluacion: { select: { id: true } } } })
    if (!row || row.profesionalId !== staffId || row.reservaId !== reservaId) throw new AttentionUnavailable()
    if (row.estado === "AUSENTE" && row.ausenciaId) return { ausenciaId: row.ausenciaId, nueva: false }
    if (row.estado !== "EN_ATENCION" || row.evaluacion) throw new AttentionConflict("La atención ya no está activa. Actualiza su estado antes de continuar.")
    const ausenciaId = randomUUID()
    await tx.entradaFila.update({ where: { id }, data: { estado: "AUSENTE", ausenciaId, ausenteAt: new Date(), reincorporadaAt: null } })
    await tx.movimientoFila.create({ data: { entradaId: id, ausenciaId, tipo: "AUSENCIA", usuarioId: staffId } })
    return { ausenciaId, nueva: true }
  }, { timeout: 15000 })
}
