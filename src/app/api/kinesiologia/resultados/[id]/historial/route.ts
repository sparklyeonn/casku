import { clinicalAccess,clinicalFailure,clinicalResponse } from "@/lib/kinesiology/http"
import { evaluationId,resultPage } from "@/lib/results/input"
import { publicationHistory } from "@/lib/results/store"
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const access=await clinicalAccess();if(access.response)return access.response
 try {const result=await publicationHistory(access.user.id,evaluationId((await params).id),resultPage(new URL(request.url).searchParams.get("pagina")));return result?clinicalResponse(result):clinicalResponse({error:"Historial no disponible."},404)}catch(error){return clinicalFailure(error)}
}
