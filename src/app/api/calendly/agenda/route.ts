import { getTeamUser } from "@/lib/access"
import { teamResponse } from "@/lib/team/http"
import { calendlyStatus, CalendlyUnavailable } from "@/lib/calendly/client"
import { agendaForRole, AgendaInputError, listCalendlyAgenda, parseAgendaDate, parseAgendaStatus } from "@/lib/calendly/agenda"

export const maxDuration = 60

export async function GET(request: Request) {
  const user = await getTeamUser()
  if (!user) return teamResponse({ error: "Inicia sesión con tu cuenta del equipo." }, 401)
  const query = new URL(request.url).searchParams
  const state = calendlyStatus()
  if (query.get("consultar") !== "1" || state !== "LISTO_PARA_CONSULTAR") return teamResponse({ estado: state })
  try {
    const result = await listCalendlyAgenda({ fecha: parseAgendaDate(query.get("fecha")), estado: parseAgendaStatus(query.get("estado")), cursor: query.get("cursor"), signal: request.signal })
    // El equipo clínico necesita la cita y su nombre de reserva, no los datos de contacto.
    return teamResponse(agendaForRole(result, user.role))
  } catch (error) {
    if (error instanceof AgendaInputError) return teamResponse({ error: error.message }, 400)
    const kind = error instanceof CalendlyUnavailable ? error.kind : "PROVEEDOR"
    const message = kind === "CONFIGURACION" ? "No se encontró un único tipo de cita para el enlace de Expo Bebé confirmado. Administración debe revisar la conexión."
      : kind === "CREDENCIALES" ? "Calendly rechazó el acceso. La clave necesita users:read, event_types:read y scheduled_events:read."
      : kind === "LIMITE" ? "Calendly alcanzó su límite de consultas. Espera antes de actualizar."
      : "No pudimos actualizar la agenda. Intenta nuevamente; no se modificaron las reservas."
    return teamResponse({ error: message }, kind === "LIMITE" ? 429 : 503)
  }
}
