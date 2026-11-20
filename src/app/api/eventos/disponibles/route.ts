import { calendlyCapacity } from "@/lib/calendly/capacity"
import { connection } from "next/server"
import { prisma } from "@/lib/prisma"
import { chileToday } from "@/lib/families/input"
import { familyFailure, familyResponse } from "@/lib/families/http"
export async function GET() {
  // Los cupos y la fecha corresponden a la petición, nunca al momento de compilar.
  await connection()
  try {
    const available = await prisma.$transaction(async tx => {
    const events = await tx.evento.findMany({ where: { inscripcionesAbiertas: true, fecha: { gte: new Date(`${chileToday()}T00:00:00Z`) } }, orderBy: { fecha: "asc" }, select: { id: true, nombre: true, fecha: true, lugar: true, cupos: true, inscritos: true, _count: { select: { listaEspera: { where: { estado: "PENDIENTE" } } } } } })
    return Promise.all(events.map(async event => {
      const capacity = await calendlyCapacity(tx, event)
      return { id: event.id, nombre: event.nombre, fecha: event.fecha.toISOString().slice(0, 10), lugar: event.lugar, listaEspera: capacity.disponibles === 0 || event._count.listaEspera > 0, disponibles: event._count.listaEspera > 0 ? 0 : capacity.disponibles }
    }))
    }, { isolationLevel: "RepeatableRead" })
    return familyResponse({ eventos: available })
  } catch (error) { return familyFailure(error) }
}
