import { processAvailable } from "@/lib/waitlist/process"
import { getTeamUser } from "@/lib/access"
import { parseEventEdit, parseEventId } from "@/lib/events/input"
import { prisma } from "@/lib/prisma"
import { summarizeEvent, editEvent } from "@/lib/events/store"
import { eventFailure, eventResponse, readEventJson } from "@/lib/events/http"
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getTeamUser()
  if (!user) return eventResponse({ error: "Inicia sesión para continuar." }, 401)
  if (user.role !== "ADMIN") return eventResponse({ error: "Solo administración puede editar eventos." }, 403)
  try {
    const id = parseEventId((await params).id)
    const result = await editEvent(user, parseEventEdit(id, await readEventJson(request)))
    if (result) { try { await processAvailable(id, "EDICION_CAPACIDAD") } catch { /* Configuración guardada; procesamiento recuperable. */ } }
    if (result) result.evento = summarizeEvent(await prisma.evento.findUniqueOrThrow({ where: { id } }))
    return result ? eventResponse(result) : eventResponse({ error: "Evento no disponible." }, 404)
  } catch (error) { return eventFailure(error) }
}
