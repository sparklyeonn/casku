import { Prisma } from "@prisma/client"
import { getTeamUser } from "@/lib/access"
import { FamilyInputError } from "@/lib/families/input"
import { EventInputError } from "@/lib/events/input"
import { ReceptionInputError } from "@/lib/reception/input"
import { DataConflict } from "./store"
export const dataResponse = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } })
export async function dataAccess() {
  const user = await getTeamUser()
  if (!user) return { response: dataResponse({ error: "Inicia sesión con tu cuenta del equipo." }, 401) }
  if (user.role !== "ADMIN" && user.role !== "RECEPCION") return { response: dataResponse({ error: "Solo recepción y administración pueden corregir datos personales." }, 403) }
  return { user }
}
export async function dataJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new FamilyInputError("Envía los datos en formato JSON.")
  try { return await request.json() } catch { throw new FamilyInputError("No pudimos leer los datos.") }
}
export function dataFailure(error: unknown) {
  if (error instanceof FamilyInputError || error instanceof EventInputError || error instanceof ReceptionInputError) return dataResponse({ error: error.message }, 400)
  if (error instanceof DataConflict) return dataResponse({ error: error.message }, 409)
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return dataResponse({ error: "La ficha coincide con otro registro o cambió durante el envío. Recarga y solicita revisión; no se duplicaron ni combinaron datos." }, 409)
  console.error("Corrección de datos no disponible", error instanceof Error ? error.name : "Error")
  return dataResponse({ error: "No pudimos completar la corrección. Reintenta sin cambiar los datos." }, 503)
}
