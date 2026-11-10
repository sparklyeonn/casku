import { parseEventId } from "@/lib/events/input"
import { receptionAccess, receptionFailure, receptionJson, receptionResponse } from "@/lib/reception/http"
import { receptionInput } from "@/lib/reception/input"
import { revokeInvitation } from "@/lib/linking/store"
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await receptionAccess(); if (access.response) return access.response
  try {
    const { data, eventoId } = receptionInput(await receptionJson(request))
    const result = await revokeInvitation(access.user.id, eventoId, parseEventId(data.inscripcionId), parseEventId((await params).id))
    return result ? receptionResponse({ ok: true }) : receptionResponse({ error: "Vinculación no disponible en este evento." }, 404)
  } catch (error) { return receptionFailure(error) }
}
