import { getTeamUser } from "@/lib/access"
import { receptionResponse } from "./http"

export function canRegisterOnsite(role: unknown) {
  return role === "ADMIN" || role === "RECEPCION"
}

// Permiso exclusivo del registro presencial; no habilita las demás operaciones de recepción.
export async function onsiteAccess() {
  const user = await getTeamUser()
  if (!user) return { response: receptionResponse({ error: "Inicia sesión con tu cuenta del equipo." }, 401) }
  if (!canRegisterOnsite(user.role)) return { response: receptionResponse({ error: "Solo administración y recepción pueden inscribir presencialmente." }, 403) }
  return { user }
}
