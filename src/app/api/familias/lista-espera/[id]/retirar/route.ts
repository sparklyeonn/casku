import { getFamilyUser } from "@/lib/families/access"
import { familyFailure, familyJson, familyResponse } from "@/lib/families/http"
import { parseEventId } from "@/lib/events/input"
import { withdrawWaitlist } from "@/lib/waitlist/store"
import { processAvailable } from "@/lib/waitlist/process"
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const family = await getFamilyUser(); if (!family) return familyResponse({ error: "Ingresa con tu cuenta familiar." }, 401)
  try {
    await familyJson(request)
    const row = await withdrawWaitlist(family.id, parseEventId((await params).id))
    if (!row) return familyResponse({ error: "Solicitud no disponible." }, 404)
    try { await processAvailable(row.eventoId, "RETIRADA_LISTA") } catch { /* La retirada ya se confirmó. */ }
    return familyResponse({ solicitud: row })
  } catch (error) { return familyFailure(error) }
}
