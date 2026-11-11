import { adminAccess } from "@/lib/team/http"
import { familyFailure, familyResponse } from "@/lib/families/http"
import { privacyAudit } from "@/lib/privacy/store"
export async function GET(request: Request) {
  const access=await adminAccess();if(access.response)return access.response
  try { const page=Number(new URL(request.url).searchParams.get("pagina")||1);if(!Number.isSafeInteger(page)||page<1||page>100000)return familyResponse({error:"Página inválida."},400);return familyResponse(await privacyAudit(page,access.user)) } catch(error) {return familyFailure(error)}
}
