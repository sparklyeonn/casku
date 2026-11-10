import { processAvailable } from "@/lib/waitlist/process"
import { getTeamUser } from "@/lib/access"
import { prisma } from "@/lib/prisma"
import { parseEventId } from "@/lib/events/input"
import { summarizeEvent } from "@/lib/events/store"
import { chileToday, FamilyInputError } from "@/lib/families/input"
import { familyJson, familyFailure, familyResponse } from "@/lib/families/http"
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getTeamUser()
  if (!user) return familyResponse({ error: "Inicia sesión." }, 401)
  if (user.role !== "ADMIN") return familyResponse({ error: "Solo administración puede abrir inscripciones." }, 403)
  try {
    const id = parseEventId((await params).id), data = await familyJson(request)
    if (typeof data?.abiertas !== "boolean") throw new FamilyInputError("Indica si las inscripciones estarán abiertas o cerradas.")
    const updated = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Evento" WHERE "id" = ${id}::uuid FOR UPDATE`
      const event = await tx.evento.findUnique({ where: { id } })
      if (!event) return null
      if (data.abiertas && event.fecha.toISOString().slice(0, 10) < chileToday()) throw new FamilyInputError("No puedes abrir inscripciones de un evento que ya pasó.")
      if (event.inscripcionesAbiertas === data.abiertas) return event
      return tx.evento.update({ where: { id }, data: { inscripcionesAbiertas: data.abiertas, revision: { increment: 1 } } })
    })
    if (updated && data.abiertas) { try { await processAvailable(id, "APERTURA_INSCRIPCIONES") } catch { /* La apertura ya está guardada. */ } }
    return updated ? familyResponse({ evento: summarizeEvent(await prisma.evento.findUniqueOrThrow({ where: { id } })) }) : familyResponse({ error: "Evento no disponible." }, 404)
  } catch (error) { return familyFailure(error) }
}
