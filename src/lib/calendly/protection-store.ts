import { flagChangedRegistration } from "./webhook-store"
import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { trace } from "@/lib/privacy/store"
import { calendlyCapacity } from "./capacity"
import { completeCalendlyDay, type ProtectionSnapshot } from "./protection-source"
export class ProtectionConflict extends Error {}
class SnapshotAdvanced extends ProtectionConflict {}
export const calendlyServiceActor={id:"calendly:webhook",role:"SISTEMA_CALENDLY",version:0}
type Actor = { id: string; role: string; version: number }
async function actorValid(tx: Prisma.TransactionClient, actor: Actor) {
  if(actor.id==="calendly:webhook"&&actor.role==="SISTEMA_CALENDLY"&&actor.version===0)return
  const staff = await tx.cuentaEquipo.findUnique({ where: { id: actor.id } })
  if (!staff?.active || staff.version !== actor.version || staff.role !== actor.role || !["ADMIN", "RECEPCION"].includes(actor.role)) throw new ProtectionConflict("Tu acceso cambió. Vuelve a ingresar.")
}
export async function protectionStatus(eventoId: string) {
  return prisma.$transaction(async tx => {
    const event = await tx.evento.findUnique({ where: { id: eventoId } })
    if (!event) return null
    const capacity = await calendlyCapacity(tx, event)
    return { eventoId, fecha: event.fecha.toISOString().slice(0, 10), cupos: event.cupos, inscritos: event.inscritos, ...capacity }
  }, { isolationLevel: "RepeatableRead" })
}
export async function beginProtection(actor: Actor, eventoId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Evento" WHERE id=${eventoId}::uuid FOR UPDATE`
    await actorValid(tx, actor)
    const event = await tx.evento.findUnique({ where: { id: eventoId } })
    if (!event) throw new ProtectionConflict("El evento no está disponible.")
    const previous = await tx.jornadaCalendly.findUnique({ where: { eventoId } })
    if (previous?.bloqueoToken && previous.bloqueoHasta! > new Date()) throw new ProtectionConflict("Ya se están actualizando los cupos de este evento. Espera y consulta su estado.")
    const token = randomUUID(), bloqueoHasta = new Date(Date.now() + 90000)
    await tx.jornadaCalendly.upsert({ where: { eventoId }, create: { eventoId, fecha: event.fecha, bloqueoToken: token, bloqueoHasta }, update: { bloqueoToken: token, bloqueoHasta } })
    if (!previous) await trace(tx, actor, "ACTIVAR_PROTECCION_CALENDLY", "EVENTO", eventoId)
    return { token, fecha: event.fecha.toISOString().slice(0, 10), revision:(await tx.estadoWebhookCalendly.findUnique({where:{id:"expo"}}))?.revision??0 }
  })
}
export async function applyProtection(actor: Actor, eventoId: string, token: string, snapshot: ProtectionSnapshot, revision=0) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Evento" WHERE id=${eventoId}::uuid FOR UPDATE`
    await actorValid(tx, actor)
    const jornada = await tx.jornadaCalendly.findUnique({ where: { eventoId } })
    if (!jornada || jornada.bloqueoToken !== token || jornada.bloqueoHasta! <= new Date() || jornada.fecha.toISOString().slice(0, 10) !== snapshot.fecha) throw new ProtectionConflict("La actualización venció o corresponde a otra jornada. Actualiza de nuevo antes de admitir familias sin reserva.")
    await tx.$queryRaw`SELECT id FROM "EstadoWebhookCalendly" WHERE id='expo' FOR UPDATE`
    if(((await tx.estadoWebhookCalendly.findUnique({where:{id:"expo"}}))?.revision??0)!==revision)throw new SnapshotAdvanced("Llegaron avisos nuevos durante la consulta. Se conserva la protección; actualiza de nuevo.")
    const verifiedAt = new Date()
    // Absent entries remain protected: disappearance from pagination is not proof of cancellation.
    for (const row of snapshot.reservas) {
      const old = await tx.reservaCupoCalendly.findUnique({ where: { invitadoId: row.invitadoId } })
      if (old && (old.eventoId !== eventoId || old.reservaId !== row.reservaId)) throw new ProtectionConflict("Una reserva pertenece a otra jornada. Se conservan los cupos anteriores para revisión.")
      const linked = await tx.inscripcion.findUnique({ where: { calendlyInvitadoId: row.invitadoId }, select: { id: true, eventoId: true, calendlyReservaId: true } })
      if (linked && (linked.eventoId !== eventoId || linked.calendlyReservaId !== row.reservaId)) throw new ProtectionConflict("La inscripción vinculada pertenece a otra jornada. No se duplicó ni se trasladó.")
      if(old&&old.verificadaAt>snapshot.startedAt)continue
      const data = { ...row, eventoId, verificadaAt: verifiedAt, inscripcionId: linked?.id ?? old?.inscripcionId ?? null }
      await tx.reservaCupoCalendly.upsert({ where: { invitadoId: row.invitadoId }, create: data, update: data })
      await flagChangedRegistration(tx,row)
    }
    // Freshness starts BEFORE the HTTP scan, so a long scan never extends stale availability.
    await tx.jornadaCalendly.update({ where: { eventoId }, data: { sincronizadaAt: snapshot.startedAt, bloqueoToken: null, bloqueoHasta: null, errorSincronizacion: false } })
    await trace(tx, actor, "SINCRONIZAR_CUPOS_CALENDLY", "EVENTO", eventoId)
  }, { timeout: 15000 })
}
export async function synchronizeProtection(actor: Actor, eventoId: string, signal?: AbortSignal) {
  const job = await beginProtection(actor, eventoId)
  try {
    await applyProtection(actor, eventoId, job.token, await completeCalendlyDay(job.fecha, signal), job.revision)
    return await protectionStatus(eventoId)
  } catch (error) {
    // Compare-and-set: a late worker cannot clear the lease or result of its successor.
    await prisma.jornadaCalendly.updateMany({ where: { eventoId, bloqueoToken: job.token }, data: { bloqueoToken: null, bloqueoHasta: null, ...(error instanceof SnapshotAdvanced?{}:{errorSincronizacion:true}) } })
    throw error
  }
}
