import { listEventsFor, selectEventFor } from "@/lib/events/store"
import { parseEventId } from "@/lib/events/input"
import { clinicalAccess, clinicalFailure, clinicalJson, clinicalResponse } from "@/lib/kinesiology/http"
export async function GET() {
  const access = await clinicalAccess(); if (access.response) return access.response
  try { return clinicalResponse(await listEventsFor(access.user.id)) } catch (error) { return clinicalFailure(error) }
}
export async function POST(request: Request) {
  const access = await clinicalAccess(); if (access.response) return access.response
  try {
    const data = await clinicalJson(request), event = await selectEventFor(access.user.id, parseEventId(data.eventoId))
    return event ? clinicalResponse({ seleccionadoId: event.id }) : clinicalResponse({ error: "Evento no disponible." }, 404)
  } catch (error) { return clinicalFailure(error) }
}
