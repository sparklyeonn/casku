import { receptionInput, parseLookup } from "@/lib/reception/input"
import { receptionAccess, receptionFailure, receptionJson, receptionResponse } from "@/lib/reception/http"
import { findRegistration } from "@/lib/reception/store"
export async function POST(request: Request) {
  const access = await receptionAccess(); if (access.response) return access.response
  try {
    const { eventoId, data } = receptionInput(await receptionJson(request))
    const row = await findRegistration(eventoId, parseLookup(data.consulta))
    return row ? receptionResponse({ inscripcion: row }) : receptionResponse({ error: "No encontramos esa inscripción en el evento seleccionado. Comprueba el número o el evento del comprobante." }, 404)
  } catch (error) { return receptionFailure(error) }
}
