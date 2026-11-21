import { clinicalAccess,clinicalFailure,clinicalResponse } from "@/lib/kinesiology/http"
import { RequestLimited } from "@/lib/families/security"
import { evaluationId } from "@/lib/results/input"
import { ContactConflict,ContactInputError,ContactUnavailable } from "@/lib/results/contact-policy"
import { ContactHttpError,contactJson,contactOrigin } from "@/lib/results/contact-http"
import { resultContactService,limitResultContact } from "@/lib/results/contact"
type Context={params:Promise<{id:string}>}
function failure(error:unknown) {
  if(error instanceof ContactHttpError)return clinicalResponse({error:error.message},error.status)
  if(error instanceof ContactInputError)return clinicalResponse({error:error.message},400)
  if(error instanceof ContactConflict)return clinicalResponse({error:error.message},409)
  if(error instanceof ContactUnavailable)return clinicalResponse({error:error.message},404)
  if(error instanceof RequestLimited)return clinicalResponse({error:"Has realizado varios intentos. Consulta el estado más tarde."},429)
  return clinicalFailure(error)
}
export async function GET(request:Request,{params}:Context) {
  const access=await clinicalAccess();if(access.response)return access.response
  try{contactOrigin(request);await limitResultContact(access.user.id,false);return clinicalResponse({contacto:await resultContactService.read(access.user,evaluationId((await params).id))})}catch(error){return failure(error)}
}
export async function POST(request:Request,{params}:Context) {
  const access=await clinicalAccess();if(access.response)return access.response
  try{
    const raw=await contactJson(request);await limitResultContact(access.user.id,true)
    const result=await resultContactService.submit(access.user,evaluationId((await params).id),raw)
    return clinicalResponse(result,result.envio.estado==="ACEPTADO"?(result.nueva?201:200):202)
  }catch(error){return failure(error)}
}
