import { getFamilyUser } from "@/lib/families/access"
import { familyPermissions, updateFamilyPermissions } from "@/lib/privacy/store"
import { familyFailure, familyJson, familyResponse } from "@/lib/families/http"
import { parseEventId } from "@/lib/events/input"
export async function GET() {
  const family = await getFamilyUser(); if (!family) return familyResponse({ error: "Ingresa con tu cuenta familiar verificada." },401)
  try { return familyResponse(await familyPermissions(family.id)) } catch(error) { return familyFailure(error) }
}
export async function POST(request: Request) {
  const family = await getFamilyUser(); if (!family) return familyResponse({ error: "Ingresa con tu cuenta familiar verificada." },401)
  try {
    const body = await familyJson(request); parseEventId(body?.eventoId)
    const result = await updateFamilyPermissions(family.id,body)
    return result ? familyResponse(result) : familyResponse({ error: "Autorización no disponible." },404)
  } catch(error) { return familyFailure(error) }
}
