import { samePasswordOrigin } from "@/lib/team-passwords/store"
import { parseEventId } from "@/lib/events/input"
import { onsiteAccess } from "@/lib/reception/onsite-access"
import { prisma } from "@/lib/prisma"
import { parseOnsiteInput } from "@/lib/reception/onsite-input"
import { registerOnsite, onsiteAvailability } from "@/lib/reception/onsite"
import { receptionFailure, receptionJson, receptionResponse } from "@/lib/reception/http"
import { deliverConfirmation } from "@/lib/families/confirmation"
export async function POST(request: Request) {
  const access = await onsiteAccess(); if (access.response) return access.response
  if (!samePasswordOrigin(request)) return receptionResponse({ error: "Solicitud no autorizada." }, 403)
  try {
    const result = await registerOnsite(access.user, parseOnsiteInput(await receptionJson(request)))
    await deliverConfirmation(result.inscripcion.id)
    const mail = await prisma.correoInscripcion.findUnique({ where: { inscripcionId: result.inscripcion.id }, select: { estado: true } })
    return receptionResponse({ ...result, correo: mail?.estado ?? "SIN_CORREO" }, result.nuevaInscripcion ? 201 : 200)
  } catch (error) { return receptionFailure(error) }
}

export async function GET(request: Request) {
  const access = await onsiteAccess(); if (access.response) return access.response
  try {
    const result = await onsiteAvailability(parseEventId(new URL(request.url).searchParams.get("eventoId")))
    return result ? receptionResponse(result) : receptionResponse({ error: "El evento no está disponible." }, 404)
  } catch (error) { return receptionFailure(error) }
}
