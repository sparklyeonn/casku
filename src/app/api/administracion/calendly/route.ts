import { adminAccess, teamResponse } from "@/lib/team/http"
import { calendlyStatus, CalendlyUnavailable, listCalendlyEventTypes, parseCalendlyCursor } from "@/lib/calendly/client"
export async function GET(request: Request) {
  const access = await adminAccess(); if (access.response) return access.response
  const query = new URL(request.url).searchParams
  const status = calendlyStatus()
  if (query.get("consultar") !== "1" || status !== "LISTO_PARA_CONSULTAR") return teamResponse({ estado: status })
  try { return teamResponse(await listCalendlyEventTypes(parseCalendlyCursor(query.get("cursor")), request.signal)) }
  catch (error) {
    const kind = error instanceof CalendlyUnavailable ? error.kind : "PROVEEDOR"
    const message = kind === "CREDENCIALES" ? "Calendly rechazó el acceso. Revisa la clave privada y sus permisos." : kind === "LIMITE" ? "Calendly alcanzó su límite de consultas. Espera antes de volver a consultar." : "No pudimos consultar Calendly. Revisa la conexión e intenta nuevamente."
    return teamResponse({ error: message }, kind === "LIMITE" ? 429 : 503)
  }
}
