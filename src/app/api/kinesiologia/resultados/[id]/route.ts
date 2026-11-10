import { clinicalAccess, clinicalFailure, clinicalJson, clinicalResponse } from "@/lib/kinesiology/http"
import { parseMeasurements } from "@/lib/evaluation-input"
import { evaluationId, resultRevision } from "@/lib/results/input"
import { ownedReview, reviseResult } from "@/lib/results/store"
type Context = { params: Promise<{ id: string }> }
export async function GET(_request: Request, { params }: Context) {
  const access = await clinicalAccess(); if (access.response) return access.response
  try {
    const result = await ownedReview(access.user.id, evaluationId((await params).id))
    return result ? clinicalResponse({ resultado: result }) : clinicalResponse({ error: "Resultado no disponible." }, 404)
  } catch (error) { return clinicalFailure(error) }
}
export async function PATCH(request: Request, { params }: Context) {
  const access = await clinicalAccess(); if (access.response) return access.response
  try {
    const data = await clinicalJson(request)
    return clinicalResponse({ resultado: await reviseResult(access.user.id, evaluationId((await params).id), resultRevision(data.revision), parseMeasurements(data)) })
  } catch (error) { return clinicalFailure(error) }
}
