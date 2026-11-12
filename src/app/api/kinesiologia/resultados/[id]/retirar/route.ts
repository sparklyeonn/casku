import { clinicalAccess,clinicalFailure,clinicalJson,clinicalResponse } from "@/lib/kinesiology/http"
import { evaluationId,publishedChangeInput } from "@/lib/results/input"
import { changePublishedResult,ownedReview } from "@/lib/results/store"
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const access=await clinicalAccess();if(access.response)return access.response
 try {
  const id=evaluationId((await params).id),body=await clinicalJson(request)
  const change=await changePublishedResult(access.user,id,"RETIRAR",publishedChangeInput(body))
  return clinicalResponse({resultado:await ownedReview(access.user.id,id),cambio:change})
 }catch(error){return clinicalFailure(error)}
}
