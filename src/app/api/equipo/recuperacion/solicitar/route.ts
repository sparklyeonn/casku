import { teamJson,teamResponse,teamFailure } from "@/lib/team/http"
import { requestPasswordRecovery,samePasswordOrigin } from "@/lib/team-passwords/store"
export async function POST(request:Request) {
 if(!samePasswordOrigin(request))return teamResponse({error:"Solicitud no autorizada."},403)
 try {
  const body=await teamJson(request),network=(request.headers.get("x-forwarded-for")?.split(",")[0]||request.headers.get("x-real-ip")||"local").trim().slice(0,100)
  return teamResponse(await requestPasswordRecovery(body?.email,network),202)
 }catch(error){return teamFailure(error)}
}
