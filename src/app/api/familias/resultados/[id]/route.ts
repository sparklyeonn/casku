import { getFamilyUser } from "@/lib/families/access"
import { clinicalFailure, clinicalResponse } from "@/lib/kinesiology/http"
import { parseEventId } from "@/lib/events/input"
import { familyPublishedResult } from "@/lib/results/store"
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const family = await getFamilyUser()
  if (!family) return clinicalResponse({ error: "Ingresa con tu cuenta familiar verificada." }, 401)
  try {
    const result = await familyPublishedResult(family.id, parseEventId((await params).id))
    return result ? clinicalResponse({ resultado: result }) : clinicalResponse({ error: "Resultado no disponible." }, 404)
  } catch (error) { return clinicalFailure(error) }
}
