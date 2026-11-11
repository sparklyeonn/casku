import { getFamilyUser } from "@/lib/families/access"
import { familyConsentHistory } from "@/lib/privacy/store"
import { familyFailure,familyResponse } from "@/lib/families/http"
import { parseEventId } from "@/lib/events/input"
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const family=await getFamilyUser();if(!family)return familyResponse({error:"Ingresa con tu cuenta familiar verificada."},401)
 try {const page=Number(new URL(request.url).searchParams.get("pagina")||1);if(!Number.isSafeInteger(page)||page<1||page>100000)return familyResponse({error:"Página inválida."},400);const result=await familyConsentHistory(family.id,parseEventId((await params).id),page);return result?familyResponse(result):familyResponse({error:"Autorización no disponible."},404)}catch(error){return familyFailure(error)}
}
