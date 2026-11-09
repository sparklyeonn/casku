import { Prisma } from "@prisma/client"
import { FamilyInputError } from "./input"
import { EventInputError } from "@/lib/events/input"
import { RequestLimited } from "./security"
import { MailUnavailable } from "./mail"

export class RegistrationConflict extends Error {}
export function familyResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } })
}
export async function familyJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new FamilyInputError("Envía un formulario válido.")
  try { return await request.json() } catch { throw new FamilyInputError("No pudimos leer el formulario.") }
}
export function familyFailure(error: unknown) {
  if (error instanceof FamilyInputError || error instanceof EventInputError) return familyResponse({ error: error.message }, 400)
  if (error instanceof RegistrationConflict) return familyResponse({ error: error.message }, 409)
  if (error instanceof RequestLimited) return familyResponse({ error: "Has realizado varios intentos. Intenta más tarde." }, 429)
  if (error instanceof MailUnavailable) return familyResponse({ error: "El envío de códigos no está disponible. Intenta más tarde o contacta a Casku." }, 503)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return familyResponse({ error: "Estos datos necesitan revisión. Comprueba si el bebé ya está inscrito o contacta a Casku." }, 409)
  console.error("Operación familiar no disponible", error instanceof Error ? error.name : "Error")
  return familyResponse({ error: "No pudimos completar la operación. Intenta nuevamente." }, 503)
}
