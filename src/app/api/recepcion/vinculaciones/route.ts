import QRCode from "qrcode"
import { parseEventId } from "@/lib/events/input"
import { receptionAccess, receptionFailure, receptionJson, receptionResponse } from "@/lib/reception/http"
import { invitationInput } from "@/lib/linking/input"
import { createInvitation, linkStatus } from "@/lib/linking/store"
export async function GET(request: Request) {
  const access = await receptionAccess(); if (access.response) return access.response
  try {
    const query = new URL(request.url).searchParams
    const result = await linkStatus(access.user.id, parseEventId(query.get("eventoId")), parseEventId(query.get("inscripcionId")))
    return result ? receptionResponse(result) : receptionResponse({ error: "Inscripción no disponible en este evento." }, 404)
  } catch (error) { return receptionFailure(error) }
}
export async function POST(request: Request) {
  const access = await receptionAccess(); if (access.response) return access.response
  try {
    const result = await createInvitation(access.user.id, invitationInput(await receptionJson(request)))
    if (!result) return receptionResponse({ error: "Inscripción no disponible en este evento." }, 404)
    const qr = result.codigo ? await QRCode.toDataURL(`CASKU:VINCULACION:${result.codigo}`, { width: 240, margin: 4, errorCorrectionLevel: "M" }) : null
    return receptionResponse({ ...result, qr })
  } catch (error) { return receptionFailure(error) }
}
