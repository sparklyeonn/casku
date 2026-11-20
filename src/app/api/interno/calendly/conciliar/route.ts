import { cronAllowed } from "@/lib/calendly/cron-auth"
import { hookConfig } from "@/lib/calendly/webhook-policy"
import { verifyWebhookConnection } from "@/lib/calendly/webhook-store"
import { synchronizeProtection, calendlyServiceActor } from "@/lib/calendly/protection-store"
import { chileToday } from "@/lib/families/input"
import { prisma } from "@/lib/prisma"
export const maxDuration=60
export async function GET(request:Request) {
 if(!cronAllowed(request))return Response.json({error:"No autorizado."},{status:401})
 if(!hookConfig())return Response.json({estado:"DESACTIVADO"})
 try {
  await verifyWebhookConnection(AbortSignal.timeout(15000))
  const jornada=await prisma.jornadaCalendly.findFirst({where:{fecha:{gte:new Date(chileToday()+"T00:00:00Z")}},orderBy:{fecha:"asc"}})
  if(jornada)await synchronizeProtection(calendlyServiceActor,jornada.eventoId)
  return Response.json({estado:"CONCILIADO"},{headers:{"Cache-Control":"private, no-store"}})
 }catch{return Response.json({error:"Conciliación pendiente de reintento."},{status:503})}
}
