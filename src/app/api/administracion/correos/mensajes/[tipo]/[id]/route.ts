import { adminAccess,teamJson } from "@/lib/team/http"
import { prisma } from "@/lib/prisma"
import { mailAction,mailId,mailType,pageNumber } from "@/lib/mail-admin/input"
import { adminMailDetail,actOnAdminMail } from "@/lib/mail-admin/store"
import { mailAdminResponse,mailAdminFailure } from "@/lib/mail-admin/http"
import { samePasswordOrigin } from "@/lib/team-passwords/store"
import { mailConfig } from "@/lib/mail/brevo"
import { deliverConfirmation } from "@/lib/families/confirmation"
type Context={params:Promise<{tipo:string;id:string}>}
export async function GET(request:Request,context:Context){
 const access=await adminAccess();if(access.response)return access.response
 try{const p=await context.params,query=new URL(request.url).searchParams;return mailAdminResponse(await adminMailDetail(prisma,mailType(p.tipo),mailId(p.id),pageNumber(query.get("paginaHistorial")),pageNumber(query.get("paginaEventos"))))}catch(error){return mailAdminFailure(error)}
}
export async function POST(request:Request,context:Context){
 const access=await adminAccess();if(access.response)return access.response
 if(!samePasswordOrigin(request))return mailAdminResponse({error:"Solicitud no autorizada."},403)
 try{const p=await context.params,input=mailAction(await teamJson(request));let canRetry=false;try{mailConfig("CONFIRMACION");canRetry=true}catch{}
 return mailAdminResponse(await actOnAdminMail(prisma,access.user!,mailType(p.tipo),mailId(p.id),input,{canRetry,retry:(inscripcionId,revisionContenido)=>deliverConfirmation(inscripcionId,{revisionContenido})}))}catch(error){return mailAdminFailure(error)}
}
