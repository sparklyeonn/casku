import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
export type CancellationActor = { id: string; role: "ADMIN" | "RECEPCION"; version: number } | { id: string; role: "APODERADO" }
export class CancellationConflict extends Error {}
export const cancellationSelect = { createdAt: true, motivo: true, perfilActor: true, nombreActor: true, estadoFilaAnterior: true } as const
export function cancellationSummary(row: { createdAt: Date; motivo: string; perfilActor: string; nombreActor: string; estadoFilaAnterior: string | null }) { return { ...row, createdAt: row.createdAt.toISOString() } }
const selection = { id: true, numero: true, eventoId: true, apoderadoId: true, paciente: { select: { apoderadoId: true } }, cancelacion: { select: cancellationSelect }, fila: { select: { id: true, estado: true, evaluacion: { select: { id: true } } } }, correo: { select: { estado: true } } } satisfies Prisma.InscripcionSelect
type Row = Prisma.InscripcionGetPayload<{ select: typeof selection }>
function owned(row: Row, actor: CancellationActor) { return actor.role !== "APODERADO" || (row.apoderadoId === actor.id && row.paciente.apoderadoId === actor.id) }
function blocking(row: Row, actor: CancellationActor) {
  if (row.cancelacion) return "La inscripción ya está cancelada. Su cupo fue liberado."
  if (row.fila?.estado === "EN_ATENCION") return "Hay una atención en curso. La profesional debe devolverla a la fila antes de cancelar."
  if (row.fila?.estado === "ATENDIDO" || row.fila?.evaluacion) return "La inscripción ya tiene una atención finalizada o evaluación guardada. Se conserva y no se libera su cupo por cancelación."
  if (actor.role === "APODERADO" && row.fila) return "La llegada ya fue confirmada. Solicita la cancelación en recepción."
  if (row.correo?.estado === "ENVIANDO") return "Hay un envío de confirmación en curso. Espera a que termine y reintenta."
  return null
}
function summary(row: Row, actor: CancellationActor) {
  const bloqueo = blocking(row, actor)
  return { id: row.id, numero: row.numero, eventoId: row.eventoId, puedeCancelar: !bloqueo, bloqueo, cancelacion: row.cancelacion ? cancellationSummary(row.cancelacion) : null }
}
export async function cancellationStatus(actor: CancellationActor, eventoId: string, id: string) {
  const row = await prisma.inscripcion.findFirst({ where: { id, eventoId }, select: selection })
  return row && owned(row, actor) ? summary(row, actor) : null
}
export async function cancelRegistration(actor: CancellationActor, eventoId: string, id: string, motivo: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Evento" WHERE id=${eventoId}::uuid FOR UPDATE`
    const known = await tx.inscripcion.findFirst({ where: { id, eventoId }, select: { pacienteId: true } })
    if (!known) return null
    // Mismo orden que inscripción/vinculación: evento, paciente, inscripción y correo.
    await tx.$queryRaw`SELECT id FROM "Paciente" WHERE id=${known.pacienteId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM "Inscripcion" WHERE id=${id}::uuid FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM "CorreoInscripcion" WHERE "inscripcionId"=${id}::uuid FOR UPDATE`
    const row = await tx.inscripcion.findFirstOrThrow({ where: { id, eventoId }, select: selection })
    if (!owned(row, actor)) return null
    let nombreActor: string
    if (actor.role === "APODERADO") {
      const family = await tx.apoderado.findUnique({ where: { id: actor.id } })
      if (!family?.activo) return null
      nombreActor = family.nombre || "Familia"
    } else {
      const staff = await tx.cuentaEquipo.findUnique({ where: { id: actor.id } })
      if (!staff?.active || staff.role !== actor.role || staff.version !== actor.version) throw new CancellationConflict("Tu acceso cambió. Vuelve a iniciar sesión.")
      nombreActor = staff.name
    }
    if (row.cancelacion) return { ...summary(row, actor), nueva: false }
    const reason = blocking(row, actor)
    if (reason) throw new CancellationConflict(reason)
    const event = await tx.evento.findUniqueOrThrow({ where: { id: eventoId } })
    if (event.inscritos < 1) throw new CancellationConflict("El contador del evento requiere revisión antes de liberar un cupo.")
    await tx.cancelacionInscripcion.create({ data: { inscripcionId: id, actorId: actor.id, perfilActor: actor.role, nombreActor, motivo, estadoFilaAnterior: row.fila?.estado ?? null, estadoCorreoAnterior: row.correo?.estado ?? null } })
    if (row.fila) await tx.entradaFila.update({ where: { id: row.fila.id }, data: { estado: "CANCELADO" } })
    await tx.correoInscripcion.updateMany({ where: { inscripcionId: id }, data: { estado: "CANCELADO", bloqueoToken: null, bloqueoHasta: null } })
    await tx.vinculacionPresencial.updateMany({ where: { inscripcionId: id, consumidaAt: null, revocadaAt: null }, data: { revocadaAt: new Date(), revocadaPorId: actor.role === "APODERADO" ? `familia:${actor.id}` : actor.id } })
    await tx.evento.update({ where: { id: eventoId }, data: { inscritos: { decrement: 1 } } })
    const updated = await tx.inscripcion.findUniqueOrThrow({ where: { id }, select: selection })
    return { ...summary(updated, actor), nueva: true }
  }, { timeout: 15000 })
}
