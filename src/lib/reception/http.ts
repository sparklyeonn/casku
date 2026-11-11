import { PrivacyInputError } from "@/lib/privacy/policy"
import { PrivacyConflict } from "@/lib/privacy/store"
import { Prisma } from "@prisma/client"
import { getTeamUser } from "@/lib/access"
import { EventInputError } from "@/lib/events/input"
import { ReceptionInputError } from "./input"
import { FamilyInputError } from "@/lib/families/input"
export class ReceptionConflict extends Error {}

export const receptionResponse = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } })
export async function receptionAccess() {
  const user = await getTeamUser()
  if (!user) return { response: receptionResponse({ error: "Inicia sesión con tu cuenta de recepción." }, 401) }
  if (user.role !== "RECEPCION") return { response: receptionResponse({ error: "Esta operación corresponde a recepción." }, 403) }
  return { user }
}
export async function receptionJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new ReceptionInputError("Envía los datos en formato JSON.")
  try { return await request.json() } catch { throw new ReceptionInputError("No pudimos leer los datos enviados.") }
}
export function receptionFailure(error: unknown) {
  if (error instanceof PrivacyInputError) return receptionResponse({ error: error.message }, 400)
  if (error instanceof PrivacyConflict) return receptionResponse({ error: error.message }, 409)
  if (error instanceof ReceptionInputError || error instanceof EventInputError || error instanceof FamilyInputError) return receptionResponse({ error: error.message }, 400)
  if (error instanceof ReceptionConflict) return receptionResponse({ error: error.message }, 409)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return receptionResponse({ error: "Estos datos ya están registrados o necesitan revisión. Busca la inscripción antes de continuar." }, 409)
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) return receptionResponse({ error: "Es necesario actualizar la base antes de utilizar recepción." }, 503)
  console.error("Recepción no disponible", error instanceof Error ? error.name : "Error")
  return receptionResponse({ error: "No pudimos completar la operación. Reintenta sin cambiar los datos." }, 503)
}
