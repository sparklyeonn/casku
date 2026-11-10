import { getFamilyUser } from "@/lib/families/access"
import { clinicalFailure, clinicalJson, clinicalResponse } from "@/lib/kinesiology/http"
import { parseEventId } from "@/lib/events/input"
import { familyPublishedResult } from "@/lib/results/store"
import { deliverResult } from "@/lib/results/mail"
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const family = await getFamilyUser()
  if (!family) return clinicalResponse({ error: "Ingresa con tu cuenta familiar verificada." }, 401)
  try {
    await clinicalJson(request)
    const id = parseEventId((await params).id), result = await familyPublishedResult(family.id, id)
    if (!result) return clinicalResponse({ error: "Resultado no disponible." }, 404)
    await deliverResult(id)
    return clinicalResponse({ resultado: await familyPublishedResult(family.id, id) })
  } catch (error) { return clinicalFailure(error) }
}
