import { getTeamUser } from "@/lib/access"
import { teamResponse, teamJson } from "@/lib/team/http"
import { parseEventId, EventInputError } from "@/lib/events/input"
import { samePasswordOrigin } from "@/lib/team-passwords/store"
import { protectionStatus, synchronizeProtection, ProtectionConflict } from "@/lib/calendly/protection-store"
import { AgendaInputError } from "@/lib/calendly/agenda"
import { Prisma } from "@prisma/client"
export const maxDuration = 60
async function access() {
  const user = await getTeamUser()
  if (!user) return { response: teamResponse({ error: "Inicia sesión con tu cuenta del equipo." }, 401) }
  if (!["ADMIN", "RECEPCION"].includes(user.role)) return { response: teamResponse({ error: "Solo administración y recepción pueden gestionar los cupos." }, 403) }
  return { user }
}
function failure(error: unknown) {
  if (error instanceof EventInputError || error instanceof AgendaInputError) return teamResponse({ error: error.message }, 400)
  if (error instanceof ProtectionConflict) return teamResponse({ error: error.message }, 409)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return teamResponse({ error: "La fecha ya está vinculada a otro evento. Administración debe revisar la jornada antes de proteger sus cupos." }, 409)
  return teamResponse({ error: "No pudimos actualizar la protección. Se conservan las reservas anteriores y se bloquean nuevos cupos sin cita hasta completar una consulta correcta." }, 503)
}
export async function GET(request: Request) {
  const allowed = await access(); if (allowed.response) return allowed.response
  try {
    const result = await protectionStatus(parseEventId(new URL(request.url).searchParams.get("eventoId")))
    return result ? teamResponse(result) : teamResponse({ error: "Evento no disponible." }, 404)
  } catch (error) { return failure(error) }
}
export async function POST(request: Request) {
  const allowed = await access(); if (allowed.response) return allowed.response
  if (!samePasswordOrigin(request)) return teamResponse({ error: "Solicitud no autorizada." }, 403)
  try {
    const raw = await teamJson(request)
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return teamResponse({ error: "Selecciona el evento." }, 400)
    return teamResponse(await synchronizeProtection(allowed.user, parseEventId((raw as Record<string, unknown>).eventoId), request.signal))
  } catch (error) { return failure(error) }
}
