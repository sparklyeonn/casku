import { clinicalAccess, clinicalFailure, clinicalJson, clinicalResponse } from "@/lib/kinesiology/http"
import { evaluationId } from "@/lib/results/input"
import { ownedReview } from "@/lib/results/store"
import { deliverResult } from "@/lib/results/mail"
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await clinicalAccess(); if (access.response) return access.response
  try {
    await clinicalJson(request)
    const id = evaluationId((await params).id), result = await ownedReview(access.user.id, id)
    if (!result?.publicacion) return clinicalResponse({ error: "Resultado publicado no disponible." }, 404)
    await deliverResult(result.publicacion.id)
    return clinicalResponse({ resultado: await ownedReview(access.user.id, id) })
  } catch (error) { return clinicalFailure(error) }
}
