import { getFamilyUser } from "@/lib/families/access"
import { familyJson, familyResponse } from "@/lib/families/http"
import { linkCode } from "@/lib/linking/input"
import { familyLink } from "@/lib/linking/store"
import { codeFromBody, linkFailure, linkOutcome } from "@/lib/linking/http"
export async function POST(request: Request) {
  const family = await getFamilyUser()
  if (!family) return familyResponse({ error: "Ingresa con tu cuenta familiar verificada." }, 401)
  try { const body = await familyJson(request); return linkOutcome(await familyLink(family.id, linkCode(codeFromBody(body)), true, body.privacidad)) } catch (error) { return linkFailure(error) }
}
