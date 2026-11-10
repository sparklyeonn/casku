import { clinicalAccess, clinicalFailure, clinicalJson, clinicalResponse } from "@/lib/kinesiology/http"
import { evaluationId, resultRevision } from "@/lib/results/input"
import { ownedReview, publishResult } from "@/lib/results/store"
import { deliverResult } from "@/lib/results/mail"
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await clinicalAccess(); if (access.response) return access.response
  try {
    const id = evaluationId((await params).id), data = await clinicalJson(request)
    const published = await publishResult(access.user.id, id, resultRevision(data.revision))
    await deliverResult(published.id)
    return clinicalResponse({ resultado: await ownedReview(access.user.id, id) }, published.nueva ? 201 : 200)
  } catch (error) { return clinicalFailure(error) }
}
