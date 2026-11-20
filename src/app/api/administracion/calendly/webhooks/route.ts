import { getTeamUser } from "@/lib/access"
import { teamResponse } from "@/lib/team/http"
import { samePasswordOrigin } from "@/lib/team-passwords/store"
import { hookConfig, webhookHealth } from "@/lib/calendly/webhook-policy"
import { verifyWebhookConnection, processCalendlyBatch } from "@/lib/calendly/webhook-store"
import { prisma } from "@/lib/prisma"
export const maxDuration=60
async function access() {
 const user=await getTeamUser()
 if(!user)return {response:teamResponse({error:"Inicia sesión con tu cuenta del equipo."},401)}
 if(user.role!=="ADMIN")return {response:teamResponse({error:"Solo administración puede gestionar la conexión automática."},403)}
 return {user}
}
export async function GET() {
 const allowed=await access();if(allowed.response)return allowed.response
 try {
  const config=hookConfig(),state=await prisma.estadoWebhookCalendly.findUnique({where:{id:"expo"}})
  const pending=await prisma.avisoCalendly.count({where:{estado:{in:["PENDIENTE","PROCESANDO"]}}}),revision=await prisma.avisoCalendly.count({where:{estado:"REVISION"}})
  return teamResponse({configurada:!!config,verificada:!!config&&webhookHealth(state,config.huella,new Date()),verificadaAt:state?.verificadaAt?.toISOString()??null,pendientes:pending,revision})
 }catch{return teamResponse({error:"Conexión automática no disponible."},503)}
}
export async function POST(request:Request) {
 const allowed=await access();if(allowed.response)return allowed.response
 if(!samePasswordOrigin(request))return teamResponse({error:"Solicitud no autorizada."},403)
 try {
  if(!hookConfig())return teamResponse({error:"Configura la firma y la suscripción privadas de Calendly en el alojamiento."},409)
  await verifyWebhookConnection(AbortSignal.timeout(15000))
  const result=await processCalendlyBatch(1)
  return teamResponse({verificada:true,...result})
 }catch{return teamResponse({error:"No pudimos verificar una suscripción activa de esta cuenta con el receptor y los dos eventos requeridos. Revisa la configuración y los permisos de webhooks."},503)}
}
