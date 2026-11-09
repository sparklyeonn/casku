import { listEventsFor, selectEventFor } from "@/lib/events/store"
import { receptionInput } from "@/lib/reception/input"
import { receptionAccess, receptionFailure, receptionJson, receptionResponse } from "@/lib/reception/http"
export async function GET() {
  const access = await receptionAccess(); if (access.response) return access.response
  try { return receptionResponse(await listEventsFor(access.user.id)) } catch (error) { return receptionFailure(error) }
}
export async function POST(request: Request) {
  const access = await receptionAccess(); if (access.response) return access.response
  try {
    const { eventoId } = receptionInput(await receptionJson(request))
    const event = await selectEventFor(access.user.id, eventoId)
    return event ? receptionResponse({ seleccionadoId: event.id }) : receptionResponse({ error: "Evento no disponible." }, 404)
  } catch (error) { return receptionFailure(error) }
}
