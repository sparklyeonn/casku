import { parseEventId } from "@/lib/events/input"
import { InvalidEvaluation } from "@/lib/evaluation-input"
import { clinicalAccess, clinicalFailure, clinicalResponse } from "@/lib/kinesiology/http"
import { ownResults } from "@/lib/results/store"
import { resultPage } from "@/lib/results/input"
export async function GET(request: Request) {
  const access = await clinicalAccess(); if (access.response) return access.response
  try {
    const query = new URL(request.url).searchParams, state = query.get("estado") || "TODOS"
    if (state !== "TODOS" && state !== "BORRADOR" && state !== "PUBLICADO" && state !== "RETIRADO") throw new InvalidEvaluation("Selecciona un estado válido.")
    return clinicalResponse(await ownResults(access.user.id, resultPage(query.get("pagina")), state, query.has("eventoId") ? parseEventId(query.get("eventoId")) : undefined))
  } catch (error) { return clinicalFailure(error) }
}
