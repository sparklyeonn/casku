import { parseEventId } from "@/lib/events/input"
import { clinicalAccess, clinicalFailure, clinicalJson, clinicalResponse } from "@/lib/kinesiology/http"
import { returnToQueue } from "@/lib/kinesiology/store"
export async function POST(request: Request) {
  const access = await clinicalAccess(); if (access.response) return access.response
  try {
    const data = await clinicalJson(request)
    await returnToQueue(access.user.id, parseEventId(data.atencionId), parseEventId(data.reservaId))
    return clinicalResponse({ ok: true })
  } catch (error) { return clinicalFailure(error) }
}
