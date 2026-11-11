import { dataAccess } from "@/lib/data-corrections/http"
import { familyFailure, familyJson, familyResponse } from "@/lib/families/http"
import { parseEventId } from "@/lib/events/input"
import { paperDeclaration } from "@/lib/privacy/policy"
import { staffPermission } from "@/lib/privacy/store"
export async function GET(request: Request) {
  const access=await dataAccess(); if(access.response) return access.response
  try { const q=new URL(request.url).searchParams; const result=await staffPermission(access.user,parseEventId(q.get("eventoId")),parseEventId(q.get("inscripcionId"))); return result ? familyResponse(result) : familyResponse({error:"Inscripción no disponible."},404) } catch(error) {return familyFailure(error)}
}
export async function POST(request: Request) {
  const access=await dataAccess(); if(access.response) return access.response
  try { const body=await familyJson(request);const result=await staffPermission(access.user,parseEventId(body?.eventoId),parseEventId(body?.inscripcionId),paperDeclaration(body?.declaracion),body?.revision);return result ? familyResponse(result) : familyResponse({error:"Inscripción no disponible."},404) } catch(error) {return familyFailure(error)}
}
