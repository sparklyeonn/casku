import { parseEventId } from "@/lib/events/input"
import { clinicalAccess, clinicalFailure, clinicalResponse } from "@/lib/kinesiology/http"
import { currentAttention, clinicOverview } from "@/lib/kinesiology/store"
export async function GET(request: Request) {
  const access = await clinicalAccess(); if (access.response) return access.response
  try {
    const event = new URL(request.url).searchParams.get("eventoId")
    return clinicalResponse(event ? await clinicOverview(access.user.id, parseEventId(event)) : { atencion: await currentAttention(access.user.id) })
  } catch (error) { return clinicalFailure(error) }
}
