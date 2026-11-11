import { parseLookup, receptionInput } from "@/lib/reception/input"
import { dataAccess, dataFailure, dataJson, dataResponse } from "@/lib/data-corrections/http"
import { recordDetail } from "@/lib/data-corrections/store"
export async function POST(request: Request) {
  const access = await dataAccess(); if (access.response) return access.response
  try {
    const { data, eventoId } = receptionInput(await dataJson(request))
    const result = await recordDetail(eventoId, parseLookup(data.consulta), 1, access.user)
    return result ? dataResponse(result) : dataResponse({ error: "Inscripción no encontrada en este evento." }, 404)
  } catch (error) { return dataFailure(error) }
}
