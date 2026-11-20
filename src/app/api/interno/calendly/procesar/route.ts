import { cronAllowed } from "@/lib/calendly/cron-auth"
import { hookConfig } from "@/lib/calendly/webhook-policy"
import { processCalendlyBatch } from "@/lib/calendly/webhook-store"
export const maxDuration=60
export async function GET(request:Request) {
 if(!cronAllowed(request))return Response.json({error:"No autorizado."},{status:401})
 if(!hookConfig())return Response.json({estado:"DESACTIVADO"})
 try{return Response.json(await processCalendlyBatch(),{headers:{"Cache-Control":"private, no-store"}})}catch{return Response.json({error:"Procesamiento pendiente."},{status:503})}
}
