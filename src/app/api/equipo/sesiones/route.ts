import { getTeamUser } from "@/lib/access"
import { ownTeamSessions, revokeOwnSessions } from "@/lib/team-auth/sessions"
import { parseEventId } from "@/lib/events/input"
import { familyFailure, familyJson, familyResponse } from "@/lib/families/http"
export async function GET() {
  try {
    const user = await getTeamUser()
    return user ? familyResponse(await ownTeamSessions(user.id, user.sessionId)) : familyResponse({ error: "Inicia sesión con tu cuenta del equipo." }, 401)
  } catch (error) { return familyFailure(error) }
}
export async function POST(request: Request) {
  try {
    const user = await getTeamUser()
    if (!user) return familyResponse({ error: "Inicia sesión con tu cuenta del equipo." }, 401)
    const body = await familyJson(request)
    if (!body || (body.accion !== "CERRAR_TODAS" && body.accion !== "CERRAR_UNA" && body.accion !== "CERRAR_ACTUAL")) return familyResponse({ error: "Elige qué sesión quieres cerrar." }, 400)
    const target = body.accion === "CERRAR_TODAS" ? null : body.accion === "CERRAR_ACTUAL" ? user.sessionId : parseEventId(body.sesionId)
    const result = await revokeOwnSessions(user, target)
    if (!result) return familyResponse({ error: "Tu sesión ya no está vigente. Vuelve a ingresar." }, 401)
    return result.cerradas || target === null ? familyResponse(result) : familyResponse({ error: "Sesión no disponible." }, 404)
  } catch (error) { return familyFailure(error) }
}
