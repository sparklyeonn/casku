import { requireDataConsent } from "@/lib/privacy/store"
import { cancellationSelect, cancellationSummary } from "@/lib/cancellations/store"
import { ReceptionConflict } from "./http"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { parseLookup } from "./input"
import { nextWaiting } from "@/lib/queue/store"
import { queuePolicy } from "@/lib/queue/policy"
import { chileToday } from "@/lib/families/input"

// Lista explícita: recepción no recibe RUT, contactos, tokens QR ni información clínica.
export const receptionFilaSelect = { orden: true, llegadaAt: true, esperaDesde: true, ausenciaId: true, ausenteAt: true, reincorporadaAt: true, estado: true } as const
export const receptionSelect = {
  cancelacion: { select: cancellationSelect },
  id: true, numero: true, eventoId: true, origen: true, contactoNombre: true,
  paciente: { select: { nombre: true } }, apoderado: { select: { nombre: true } },
  fila: { select: receptionFilaSelect },
} satisfies Prisma.InscripcionSelect
export type ReceptionRow = Prisma.InscripcionGetPayload<{ select: typeof receptionSelect }>
export function receptionSummary(row: ReceptionRow) {
  return { cancelacion: row.cancelacion ? cancellationSummary(row.cancelacion) : null, id: row.id, numero: row.numero, eventoId: row.eventoId, origen: row.origen, bebe: row.paciente.nombre, apoderado: row.apoderado?.nombre || row.contactoNombre || "Apoderado", llegada: row.fila ? { ...row.fila, llegadaAt: row.fila.llegadaAt.toISOString(), esperaDesde: row.fila.esperaDesde.toISOString(), ausenteAt: row.fila.ausenteAt?.toISOString() ?? null, reincorporadaAt: row.fila.reincorporadaAt?.toISOString() ?? null } : null }
}
export async function ensureArrival(tx: Prisma.TransactionClient, row: ReceptionRow, staffId: string) {
  if (row.cancelacion) throw new ReceptionConflict("La inscripción está cancelada. No puede volver a la fila ni reservar un cupo con este comprobante.")
  const permission = await tx.inscripcion.findUniqueOrThrow({ where: { id: row.id }, select: { autorizacionId: true, pacienteId: true, apoderadoId: true } })
  await requireDataConsent(tx, permission.autorizacionId, permission.pacienteId, permission.apoderadoId)
  if (row.fila) return { inscripcion: receptionSummary(row), nueva: false }
  const event = await tx.evento.update({ where: { id: row.eventoId }, data: { ultimoOrdenFila: { increment: 1 } }, select: { ultimoOrdenFila: true } })
  const fila = await tx.entradaFila.create({ data: { eventoId: row.eventoId, inscripcionId: row.id, orden: event.ultimoOrdenFila, confirmadoPorId: staffId }, select: receptionFilaSelect })
  return { inscripcion: receptionSummary({ ...row, fila }), nueva: true }
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
    return ensureArrival(tx, row, staffId)
  }, { timeout: 15000 })
}
export async function waitingQueue(eventoId: string, after: number, absentAfter = 0) {
  return prisma.$transaction(async tx => {
    // Una sola instantánea para que el total y la página correspondan a la misma fila.
    const event = await tx.evento.findUnique({ where: { id: eventoId }, select: { id: true, fecha: true, cupos: true, inscritos: true, previosConsecutivos: true } })
    if (!event) return null
    const total = await tx.entradaFila.count({ where: { eventoId, estado: "EN_ESPERA" } })
    const presenciales = await tx.entradaFila.count({ where: { eventoId, estado: "EN_ESPERA", inscripcion: { origen: "PRESENCIAL" } } })
    const now = new Date(), choice = await nextWaiting(tx, eventoId, event.previosConsecutivos, now)
    const next = choice ? await tx.entradaFila.findUnique({ where: { id: choice.entrada.id }, select: { inscripcion: { select: receptionSelect } } }) : null
    const entries = await tx.entradaFila.findMany({ where: { eventoId, estado: "EN_ESPERA", orden: { gt: after } }, orderBy: { orden: "asc" }, take: 51, select: { orden: true, inscripcion: { select: receptionSelect } } })
    const absentTotal = await tx.entradaFila.count({ where: { eventoId, estado: "AUSENTE" } })
    const absents = absentTotal ? await tx.entradaFila.findMany({ where: { eventoId, estado: "AUSENTE", orden: { gt: absentAfter } }, orderBy: { orden: "asc" }, take: 51, select: { orden: true, inscripcion: { select: receptionSelect } } }) : []
    return { total, ausentes: { total: absentTotal, inscripciones: absents.slice(0, 50).map(entry => receptionSummary(entry.inscripcion)), siguiente: absents.length > 50 ? absents[49].orden : null }, disponibles: event.cupos - event.inscritos, presencialHabilitada: event.fecha.toISOString().slice(0, 10) === chileToday(now), previas: total - presenciales, presenciales, politica: queuePolicy, proximo: next && choice ? { ...receptionSummary(next.inscripcion), motivo: choice.motivo } : null, inscripciones: entries.slice(0, 50).map(entry => receptionSummary(entry.inscripcion)), siguiente: entries.length > 50 ? entries[49].orden : null, actualizadaAt: now.toISOString() }
  }, { isolationLevel: "RepeatableRead" })
}
