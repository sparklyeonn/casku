import { adminAccess } from "@/lib/team/http"
import { prisma } from "@/lib/prisma"
import { mailFilters } from "@/lib/mail-admin/input"
import { listAdminMail } from "@/lib/mail-admin/store"
import { mailAdminResponse,mailAdminFailure } from "@/lib/mail-admin/http"
import { mailConfig } from "@/lib/mail/brevo"
export async function GET(request:Request){
 const access=await adminAccess();if(access.response)return access.response
 try{let reintentosHabilitados=false;try{mailConfig("CONFIRMACION");reintentosHabilitados=true}catch{}
 return mailAdminResponse({...await listAdminMail(prisma,mailFilters(new URL(request.url).searchParams)),reintentosHabilitados})}catch(error){return mailAdminFailure(error)}
}
