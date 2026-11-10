import { Prisma } from "@prisma/client"
import { getFamilyUser } from "@/lib/families/access"
import { FamilyInputError, parseRegistration } from "@/lib/families/input"
import { familyFailure, familyJson, familyResponse } from "@/lib/families/http"
import { familyWaitlist, joinWaitlist, ownWaitlistEntry } from "@/lib/waitlist/store"
import { processAvailable } from "@/lib/waitlist/process"
export async function GET(request: Request) {
  const family = await getFamilyUser(); if (!family) return familyResponse({ error: "Ingresa con tu cuenta familiar verificada." }, 401)
  try {
    const page = Number(new URL(request.url).searchParams.get("pagina") || 1)
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new FamilyInputError("Página inválida.")
    return familyResponse(await familyWaitlist(family.id, page))
  } catch (error) { return familyFailure(error) }
}
export async function POST(request: Request) {
  const family = await getFamilyUser(); if (!family) return familyResponse({ error: "Ingresa con tu cuenta familiar verificada." }, 401)
  try {
    const body = await familyJson(request)
    if (body?.aceptaAsignacion !== true) throw new FamilyInputError("Debes aceptar la confirmación automática del cupo al llegar tu turno.")
    const input = parseRegistration(body), solicitud = await joinWaitlist(family.id, input)
    // Recupera asignaciones pendientes si hay capacidad tras una ampliación o retirada.
    try { await processAvailable(input.eventoId, "SOLICITUD_LISTA") } catch { /* La solicitud ya está guardada y conserva su orden. */ }
    return familyResponse({ solicitud: await ownWaitlistEntry(family.id, solicitud.id) ?? solicitud })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return familyResponse({ error: "La solicitud cambió durante el envío. Actualiza tu lista antes de reintentar." }, 409)
    return familyFailure(error)
  }
}
