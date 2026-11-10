import { parseEventId } from "@/lib/events/input"
import { receptionInput } from "@/lib/reception/input"
import { receptionAccess, receptionFailure, receptionJson, receptionResponse } from "@/lib/reception/http"
import { rejoinQueue } from "@/lib/reception/rejoin"
export async function POST(request: Request) {
  const access = await receptionAccess(); if (access.response) return access.response
  try {
    const { data, eventoId } = receptionInput(await receptionJson(request))
    const result = await rejoinQueue(access.user.id, eventoId, parseEventId(data.inscripcionId), parseEventId(data.ausenciaId))
    return result ? receptionResponse(result) : receptionResponse({ error: "Inscripción no disponible en este evento." }, 404)
  } catch (error) { return receptionFailure(error) }
}
