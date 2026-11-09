import { prisma } from "@/lib/prisma"
import { chileToday } from "@/lib/families/input"
import { familyFailure, familyResponse } from "@/lib/families/http"
export async function GET() {
  try {
    const events = await prisma.evento.findMany({ where: { inscripcionesAbiertas: true, fecha: { gte: new Date(`${chileToday()}T00:00:00Z`) }, inscritos: { lt: prisma.evento.fields.cupos } }, orderBy: { fecha: "asc" }, select: { id: true, nombre: true, fecha: true, lugar: true, cupos: true, inscritos: true } })
    return familyResponse({ eventos: events.map(event => ({ id: event.id, nombre: event.nombre, fecha: event.fecha.toISOString().slice(0, 10), lugar: event.lugar, disponibles: event.cupos - event.inscritos })) })
  } catch (error) { return familyFailure(error) }
}
