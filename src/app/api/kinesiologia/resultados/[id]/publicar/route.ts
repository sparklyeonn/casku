import { clinicalAccess, clinicalFailure, clinicalJson, clinicalResponse } from "@/lib/kinesiology/http"
import { evaluationId, resultRevision } from "@/lib/results/input"
import { ownedReview, publishResult } from "@/lib/results/store"
import { deliverResult } from "@/lib/results/mail"
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await clinicalAccess(); if (access.response) return access.response
  try {
    const id = evaluationId((await params).id), data = await clinicalJson(request)
    const published = await publishResult(access.user.id, id, resultRevision(data.revision))
    let aviso: string | undefined
    // Publication has committed already. A mail failure must not report it as an unsaved draft.
    try { await deliverResult(published.id) }
    catch { aviso = "Resultado publicado. No pudimos confirmar el procesamiento del correo; consulta su estado antes de reintentar." }
    return clinicalResponse({ resultado: await ownedReview(access.user.id, id), ...(aviso ? { aviso } : {}) }, published.nueva ? 201 : 200)
  } catch (error) { return clinicalFailure(error) }
}
