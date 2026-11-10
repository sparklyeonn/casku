import { parseEventId } from "@/lib/events/input"
import { clinicalAccess, clinicalFailure, clinicalJson, clinicalResponse } from "@/lib/kinesiology/http"
import { callNext } from "@/lib/kinesiology/store"
export async function POST(request: Request) {
  const access = await clinicalAccess(); if (access.response) return access.response
  try {
    const data = await clinicalJson(request)
    return clinicalResponse(await callNext(access.user.id, parseEventId(data.eventoId), parseEventId(data.id), access.user.version))
  } catch (error) { return clinicalFailure(error) }
}
