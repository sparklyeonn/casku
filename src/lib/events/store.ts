import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { EventInput, parseEventEdit } from "./input"
import { chileToday } from "@/lib/families/input"

export class EventConflict extends Error {}
export class EventEditConflict extends Error {}

// La fecha es un día calendario: siempre se serializa y muestra sin conversión horaria.
export function summarizeEvent(event: { id: string; nombre: string; fecha: Date; lugar: string; cupos: number; inscritos: number; inscripcionesAbiertas: boolean; revision: number; ultimoNumero: number; ultimoOrdenEspera?: number }) {
  return { fechaProtegida: event.ultimoNumero > 0 || event.inscritos > 0 || (event.ultimoOrdenEspera ?? 0) > 0, id: event.id, nombre: event.nombre, fecha: event.fecha.toISOString().slice(0, 10), lugar: event.lugar, cupos: event.cupos, inscritos: event.inscritos, inscripcionesAbiertas: event.inscripcionesAbiertas, revision: event.revision }
}

export async function editEvent(actor: { id: string; version: number }, input: ReturnType<typeof parseEventEdit>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Evento" WHERE "id"=${input.id}::uuid FOR UPDATE`
    const event = await tx.evento.findUnique({ where: { id: input.id } })
    if (!event) return null
    const admin = await tx.cuentaEquipo.findUnique({ where: { id: actor.id } })
    if (!admin?.active || admin.role !== "ADMIN" || admin.version !== actor.version) throw new EventEditConflict("Tu acceso cambió. Vuelve a iniciar sesión.")
    const same = event.nombre === input.nombre && event.lugar === input.lugar && event.fecha.getTime() === input.fecha.getTime() && event.cupos === input.cupos
    // Una respuesta perdida se recupera sin volver a editar ni duplicar la auditoría.
    if (same) return { evento: summarizeEvent(event), actualizado: false }
    if (event.revision !== input.revision) throw new EventEditConflict("El evento cambió en otra pantalla. Recarga sus datos antes de guardar.")
    const occupied = Math.max(event.inscritos, await tx.inscripcion.count({ where: { eventoId: event.id, cancelacion: { is: null } } }))
    if (input.cupos < occupied) throw new EventEditConflict(`No puedes reducir los cupos por debajo de las ${occupied} inscripciones reservadas.`)
    if (event.fecha.getTime() !== input.fecha.getTime()) {
      if (await tx.inscripcion.count({ where: { eventoId: event.id } }) > 0 || await tx.listaEspera.count({ where: { eventoId: event.id } }) > 0) throw new EventEditConflict("No puedes cambiar la fecha de un evento que ya tiene inscripciones o solicitudes de lista de espera.")
      if (event.inscripcionesAbiertas) throw new EventEditConflict("Cierra las inscripciones antes de cambiar la fecha.")
      if (input.fecha.toISOString().slice(0, 10) < chileToday()) throw new EventEditConflict("La nueva fecha no puede ser anterior a hoy en Chile.")
    }
    const updated = await tx.evento.update({ where: { id: event.id }, data: { nombre: input.nombre, lugar: input.lugar, fecha: input.fecha, cupos: input.cupos, revision: { increment: 1 } } })
    await tx.cambioEvento.create({ data: { eventoId: event.id, actorId: actor.id, revision: updated.revision, anterior: summarizeEvent(event), nueva: summarizeEvent(updated) } })
    return { evento: summarizeEvent(updated), actualizado: true }
  }, { timeout: 15000 })
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
