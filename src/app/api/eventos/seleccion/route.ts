import { getTeamUser } from "@/lib/access"
import { parseEventId } from "@/lib/events/input"
import { selectEventFor } from "@/lib/events/store"
import { eventResponse, eventFailure, readEventJson } from "@/lib/events/http"

export async function POST(request: Request) {
  const user = await getTeamUser()
  if (!user) return eventResponse({ error: "Inicia sesión para continuar." }, 401)
  if (user.role !== "ADMIN") return eventResponse({ error: "Solo administración puede seleccionar un evento de trabajo." }, 403)
  try {
    const data = await readEventJson(request)
    const id = parseEventId(data?.eventoId)
    const evento = await selectEventFor(user.id, id)
    if (!evento) return eventResponse({ error: "El evento ya no está disponible. Actualiza la lista." }, 404)
    return eventResponse({ evento, seleccionadoId: evento.id })
  } catch (error) { return eventFailure(error) }
}
