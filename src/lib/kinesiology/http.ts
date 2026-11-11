import { PrivacyInputError } from "@/lib/privacy/policy"
import { PrivacyConflict } from "@/lib/privacy/store"
import { getTeamUser } from "@/lib/access"
import { EventInputError } from "@/lib/events/input"
import { InvalidEvaluation } from "@/lib/evaluation-input"
import { Prisma } from "@prisma/client"
export class AttentionConflict extends Error {}
export class AttentionUnavailable extends Error {}
export const clinicalResponse = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } })
export async function clinicalAccess() {
  const user = await getTeamUser()
  if (!user) return { response: clinicalResponse({ error: "Inicia sesión para continuar." }, 401) }
  if (user.role !== "KINESIOLOGO") return { response: clinicalResponse({ error: "Esta operación corresponde a kinesiología." }, 403) }
  return { user }
}
export async function clinicalJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new InvalidEvaluation("Envía los datos en formato JSON.")
  let data: unknown
  try { data = await request.json() } catch { throw new InvalidEvaluation("No pudimos leer los datos enviados.") }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new InvalidEvaluation("Revisa los datos enviados.")
  return data as Record<string, unknown>
}
export function clinicalFailure(error: unknown) {
  if (error instanceof PrivacyInputError) return clinicalResponse({ error: error.message }, 400)
  if (error instanceof PrivacyConflict) return clinicalResponse({ error: error.message }, 409)
  if (error instanceof EventInputError || error instanceof InvalidEvaluation) return clinicalResponse({ error: error.message }, 400)
  if (error instanceof AttentionConflict) return clinicalResponse({ error: error.message }, 409)
  if (error instanceof AttentionUnavailable) return clinicalResponse({ error: "La atención no está disponible para tu cuenta." }, 404)
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) return clinicalResponse({ error: "Es necesario actualizar la base antes de utilizar la atención." }, 503)
  console.error("Atención no disponible", error instanceof Error ? error.name : "Error")
  return clinicalResponse({ error: "No pudimos completar la operación. Reintenta sin cambiar los datos." }, 503)
}
