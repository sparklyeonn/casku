import { getFamilyUser } from "@/lib/families/access"
import { clinicalFailure, clinicalResponse } from "@/lib/kinesiology/http"
import { resultPage } from "@/lib/results/input"
import { familyPublishedResults } from "@/lib/results/store"
export async function GET(request: Request) {
  const family = await getFamilyUser()
  if (!family) return clinicalResponse({ error: "Ingresa con tu cuenta familiar verificada." }, 401)
  try { return clinicalResponse(await familyPublishedResults(family.id, resultPage(new URL(request.url).searchParams.get("pagina")))) } catch (error) { return clinicalFailure(error) }
}
