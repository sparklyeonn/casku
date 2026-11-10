import { getTeamUser } from "@/lib/access"
import { parseEventId } from "@/lib/events/input"
import { eventOverview } from "@/lib/events/overview"
import { eventFailure, eventResponse } from "@/lib/events/http"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getTeamUser()
  if (!user) return eventResponse({ error: "Inicia sesión para continuar." }, 401)
  if (user.role !== "ADMIN") return eventResponse({ error: "Solo administración puede consultar el resumen del evento." }, 403)
  try {
    const result = await eventOverview(parseEventId((await params).id))
    return result ? eventResponse(result) : eventResponse({ error: "El evento no está disponible." }, 404)
  } catch (error) { return eventFailure(error) }
}
