import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { EventInput } from "./input"

export class EventConflict extends Error {}

// La fecha es un día calendario: siempre se serializa y muestra sin conversión horaria.
export function summarizeEvent(event: { id: string; nombre: string; fecha: Date; lugar: string; cupos: number; inscritos: number; inscripcionesAbiertas: boolean }) {
  return { id: event.id, nombre: event.nombre, fecha: event.fecha.toISOString().slice(0, 10), lugar: event.lugar, cupos: event.cupos, inscritos: event.inscritos, inscripcionesAbiertas: event.inscripcionesAbiertas }
}

export async function listEventsFor(userId: string) {
  const [events, selected] = await prisma.$transaction([
    prisma.evento.findMany({ orderBy: [{ fecha: "desc" }, { createdAt: "desc" }] }),
    prisma.eventoSeleccionado.findUnique({ where: { usuarioId: userId } }),
  ])
  return { eventos: events.map(summarizeEvent), seleccionadoId: selected?.eventoId ?? null }
}

export async function createAndSelectEvent(userId: string, input: EventInput) {
  const save = () => prisma.$transaction(async tx => {
    const existing = await tx.evento.findUnique({ where: { id: input.id } })
    if (existing && (existing.creadoPorId !== userId || existing.nombre !== input.nombre || existing.lugar !== input.lugar || existing.cupos !== input.cupos || existing.fecha.getTime() !== input.fecha.getTime())) throw new EventConflict()
    const event = existing ?? await tx.evento.create({ data: { ...input, creadoPorId: userId } })
    await tx.eventoSeleccionado.upsert({ where: { usuarioId: userId }, create: { usuarioId: userId, eventoId: event.id }, update: { eventoId: event.id } })
    return summarizeEvent(event)
  })
  try { return await save() } catch (error) {
    // Reintento del mismo envío: la clave primaria impide duplicar el evento.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return save()
    throw error
  }
}

export async function selectEventFor(userId: string, eventId: string) {
  return prisma.$transaction(async tx => {
    const event = await tx.evento.findUnique({ where: { id: eventId } })
    if (!event) return null
    await tx.eventoSeleccionado.upsert({ where: { usuarioId: userId }, create: { usuarioId: userId, eventoId: eventId }, update: { eventoId: eventId } })
    return summarizeEvent(event)
  })
}
