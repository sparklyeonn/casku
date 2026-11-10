import { parseEventId } from "@/lib/events/input"
import { waitlistAccess } from "@/lib/waitlist/http"
import { familyFailure, familyJson, familyResponse } from "@/lib/families/http"
import { FamilyInputError } from "@/lib/families/input"
import { staffWaitlist } from "@/lib/waitlist/store"
import { processAvailable } from "@/lib/waitlist/process"
export async function GET(request: Request, { params }: { params: Promise<{ eventoId: string }> }) {
  const access = await waitlistAccess(); if (access.response) return access.response
  try {
    const page = Number(new URL(request.url).searchParams.get("pagina") || 1)
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new FamilyInputError("Página inválida.")
    const result = await staffWaitlist(parseEventId((await params).eventoId), page)
    return result ? familyResponse(result) : familyResponse({ error: "Evento no disponible." }, 404)
  } catch (error) { return familyFailure(error) }
}
export async function POST(request: Request, { params }: { params: Promise<{ eventoId: string }> }) {
  const access = await waitlistAccess(); if (access.response) return access.response
  try {
    await familyJson(request)
    const id = parseEventId((await params).eventoId)
    if (!await staffWaitlist(id, 1)) return familyResponse({ error: "Evento no disponible." }, 404)
    return familyResponse({ asignadas: await processAvailable(id, `${access.user.role}:${access.user.id}`) })
  } catch (error) { return familyFailure(error) }
}
