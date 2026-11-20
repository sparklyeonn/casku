import { samePasswordOrigin } from "@/lib/team-passwords/store"
import { receptionAccess, receptionResponse, receptionJson, receptionFailure } from "@/lib/reception/http"
import { parseCalendlyArrival } from "@/lib/reception/calendly-input"
import { registerCalendlyArrival } from "@/lib/reception/calendly"
import { confirmedBooking } from "@/lib/calendly/booking"
import { AgendaInputError } from "@/lib/calendly/agenda"
import { CalendlyUnavailable } from "@/lib/calendly/client"
export const maxDuration = 60
export async function POST(request: Request) {
  const access = await receptionAccess(); if (access.response) return access.response
  if (!samePasswordOrigin(request)) return receptionResponse({ error: "Solicitud no autorizada." }, 403)
  try {
    const input = parseCalendlyArrival(await receptionJson(request))
    const booking = await confirmedBooking(input.reservaId, input.invitadoId, request.signal)
    return receptionResponse(await registerCalendlyArrival(access.user, input, booking))
  } catch (error) {
    if (error instanceof AgendaInputError) return receptionResponse({ error: error.message }, 400)
    if (error instanceof CalendlyUnavailable) return receptionResponse({ error: "No pudimos comprobar la cita vigente en Calendly. No se confirmó ninguna llegada. Actualiza la agenda y reintenta." }, 503)
    return receptionFailure(error)
  }
}
