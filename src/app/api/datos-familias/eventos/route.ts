import { prisma } from "@/lib/prisma"
import { dataAccess, dataFailure, dataResponse } from "@/lib/data-corrections/http"
export async function GET() {
  const access = await dataAccess(); if (access.response) return access.response
  try {
    const events = await prisma.evento.findMany({ orderBy: [{ fecha: "desc" }, { id: "asc" }], select: { id: true, nombre: true, fecha: true, lugar: true } })
    return dataResponse({ eventos: events.map(event => ({ ...event, fecha: event.fecha.toISOString().slice(0, 10) })) })
  } catch (error) { return dataFailure(error) }
}
