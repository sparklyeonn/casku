import { parseEventId } from "@/lib/events/input"
import { receptionInput } from "@/lib/reception/input"
import { receptionAccess, receptionFailure, receptionJson, receptionResponse } from "@/lib/reception/http"
import { confirmArrival } from "@/lib/reception/store"
export async function POST(request: Request) {
  const access = await receptionAccess(); if (access.response) return access.response
  try {
    const { eventoId, data } = receptionInput(await receptionJson(request))
    const result = await confirmArrival(eventoId, parseEventId(data.inscripcionId), access.user.id)
    return result ? receptionResponse(result, result.nueva ? 201 : 200) : receptionResponse({ error: "Inscripción no disponible en este evento." }, 404)
  } catch (error) { return receptionFailure(error) }
}
