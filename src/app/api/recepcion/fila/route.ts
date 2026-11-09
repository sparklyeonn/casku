import { parseEventId } from "@/lib/events/input"
import { parseCursor } from "@/lib/reception/input"
import { receptionAccess, receptionFailure, receptionResponse } from "@/lib/reception/http"
import { waitingQueue } from "@/lib/reception/store"
export async function GET(request: Request) {
  const access = await receptionAccess(); if (access.response) return access.response
  try {
    const query = new URL(request.url).searchParams
    const result = await waitingQueue(parseEventId(query.get("eventoId")), parseCursor(query.get("despues")))
    return result ? receptionResponse(result) : receptionResponse({ error: "Evento no disponible." }, 404)
  } catch (error) { return receptionFailure(error) }
}
