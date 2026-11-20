import { after } from "next/server"
import { hookConfig, validCalendlySignature, parseCalendlyNotice, WEBHOOK_MAX_BYTES, CalendlyWebhookInput } from "@/lib/calendly/webhook-policy"
import { storeCalendlyNotice, processCalendlyBatch } from "@/lib/calendly/webhook-store"
export const maxDuration=60
const response=(status:number)=>new Response(null,{status,headers:{"Cache-Control":"private, no-store"}})
export async function POST(request:Request) {
 if(!hookConfig())return response(503)
 if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return response(415)
 if(Number(request.headers.get("content-length"))>WEBHOOK_MAX_BYTES)return response(413)
 try {
  const reader=request.body?.getReader();if(!reader)return response(400)
  const chunks:Uint8Array[]=[];let size=0
  while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>WEBHOOK_MAX_BYTES){await reader.cancel();return response(413)}chunks.push(item.value)}
  const raw=Buffer.concat(chunks)
  if(!validCalendlySignature(raw,request.headers.get("calendly-webhook-signature"),hookConfig()!.key))return response(401)
  const notice=parseCalendlyNotice(raw);if(!notice)return response(204)
  await storeCalendlyNotice(notice)
  // Only acknowledge after durable persistence. Next/Vercel keep the awaited after callback alive after the response.
  after(async()=>{try{await processCalendlyBatch(5,true)}catch{console.error("Procesamiento Calendly pendiente de reintento")}})
  return response(202)
 }catch(error){return response(error instanceof CalendlyWebhookInput?400:503)}
}
