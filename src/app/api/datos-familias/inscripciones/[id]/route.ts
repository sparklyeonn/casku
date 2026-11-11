import { parseEventId } from "@/lib/events/input"
import { receptionInput } from "@/lib/reception/input"
import { correctionInput } from "@/lib/data-corrections/input"
import { dataAccess, dataFailure, dataJson, dataResponse } from "@/lib/data-corrections/http"
import { correctRecord, recordDetail } from "@/lib/data-corrections/store"
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await dataAccess(); if (access.response) return access.response
  try {
    const query = new URL(request.url).searchParams, page = Number(query.get("pagina") || 1)
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return dataResponse({ error: "Página inválida." }, 400)
    const result = await recordDetail(parseEventId(query.get("eventoId")), { id: parseEventId((await params).id) }, page, access.user)
    return result ? dataResponse(result) : dataResponse({ error: "Inscripción no encontrada en este evento." }, 404)
  } catch (error) { return dataFailure(error) }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await dataAccess(); if (access.response) return access.response
  try {
    const { data, eventoId } = receptionInput(await dataJson(request)), id = parseEventId((await params).id)
    const result = await correctRecord(access.user, eventoId, id, correctionInput(data))
    return result ? dataResponse({ ...result, ...await recordDetail(eventoId, { id }, 1, access.user) }) : dataResponse({ error: "Inscripción no encontrada en este evento." }, 404)
  } catch (error) { return dataFailure(error) }
}
