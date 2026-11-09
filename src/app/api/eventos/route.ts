import { getTeamUser } from "@/lib/access"
import { parseEventInput } from "@/lib/events/input"
import { listEventsFor, createAndSelectEvent } from "@/lib/events/store"
import { eventResponse, eventFailure, readEventJson } from "@/lib/events/http"

export async function GET() {
  const user = await getTeamUser()
  if (!user) return eventResponse({ error: "Inicia sesión para continuar." }, 401)
  if (user.role !== "ADMIN") return eventResponse({ error: "Solo administración puede gestionar eventos." }, 403)
  try { return eventResponse(await listEventsFor(user.id)) } catch (error) { return eventFailure(error) }
}

export async function POST(request: Request) {
  const user = await getTeamUser()
  if (!user) return eventResponse({ error: "Inicia sesión para continuar." }, 401)
  if (user.role !== "ADMIN") return eventResponse({ error: "Solo administración puede crear eventos." }, 403)
  try {
    const input = parseEventInput(await readEventJson(request))
    const evento = await createAndSelectEvent(user.id, input)
    return eventResponse({ evento, seleccionadoId: evento.id }, 201)
  } catch (error) { return eventFailure(error) }
}
