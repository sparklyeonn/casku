import { Prisma } from "@prisma/client"
import { getTeamUser } from "@/lib/access"
import { FamilyInputError } from "@/lib/families/input"
import { EventInputError } from "@/lib/events/input"
import { TeamInputError } from "./input"
import { TeamConflict, TeamForbidden } from "./store"
export const teamResponse = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } })
export async function adminAccess() {
  const user = await getTeamUser()
  if (!user) return { response: teamResponse({ error: "Inicia sesión con tu cuenta del equipo." }, 401) }
  if (user.role !== "ADMIN") return { response: teamResponse({ error: "Solo administración puede gestionar cuentas del equipo." }, 403) }
  return { user }
}
export async function teamJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new TeamInputError("Envía los datos en formato JSON.")
  try { return await request.json() } catch { throw new TeamInputError("No pudimos leer el formulario.") }
}
export function teamFailure(error: unknown) {
  if (error instanceof TeamInputError || error instanceof FamilyInputError || error instanceof EventInputError) return teamResponse({ error: error.message }, 400)
  if (error instanceof TeamForbidden) return teamResponse({ error: "Tu acceso cambió. Vuelve a iniciar sesión." }, 403)
  if (error instanceof TeamConflict) return teamResponse({ error: error.message }, 409)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return teamResponse({ error: "El correo o identificador ya pertenece a otra cuenta, incluso si está desactivada." }, 409)
  console.error("Gestión de cuentas no disponible", error instanceof Error ? error.name : "Error")
  return teamResponse({ error: "No pudimos guardar los cambios. Reintenta sin modificar los datos." }, 503)
}
