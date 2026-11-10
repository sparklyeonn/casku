import { parseEventId } from "@/lib/events/input"
import { clinicalAccess, clinicalFailure, clinicalJson, clinicalResponse } from "@/lib/kinesiology/http"
import { markAbsent } from "@/lib/kinesiology/absence"
export async function POST(request: Request) {
  const access = await clinicalAccess(); if (access.response) return access.response
  try {
    const data = await clinicalJson(request)
    return clinicalResponse(await markAbsent(access.user.id, parseEventId(data.atencionId), parseEventId(data.reservaId)))
  } catch (error) { return clinicalFailure(error) }
}
