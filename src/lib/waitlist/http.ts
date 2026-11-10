import { getTeamUser } from "@/lib/access"
import { familyResponse } from "@/lib/families/http"
export async function waitlistAccess() {
  const user = await getTeamUser()
  if (!user) return { response: familyResponse({ error: "Inicia sesión con tu cuenta del equipo." }, 401) }
  if (user.role !== "ADMIN" && user.role !== "RECEPCION") return { response: familyResponse({ error: "Solo recepción y administración pueden gestionar la lista de espera de cupos." }, 403) }
  return { user }
}
