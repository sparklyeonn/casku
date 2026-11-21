import { ContactInputError } from "./contact-policy.ts"
export class ContactHttpError extends Error { status:number; constructor(status:number,message:string){super(message);this.status=status} }
export function contactOrigin(request:Request,mutation=false) {
  const origin=request.headers.get("origin"),expected=new URL(request.url).origin
  if(request.headers.get("sec-fetch-site")==="cross-site" || (mutation&&!origin) || (origin&&origin!==expected))throw new ContactHttpError(403,"Abre este formulario desde Casku para continuar.")
}
export async function contactJson(request:Request):Promise<Record<string,unknown>> {
  contactOrigin(request,true)
  if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw new ContactHttpError(415,"Envía el formulario en formato JSON.")
  const declared=request.headers.get("content-length")
  if(declared&&(!/^\d+$/.test(declared)||Number(declared)>4096))throw new ContactHttpError(413,"El formulario supera el tamaño permitido.")
  if(!request.body)throw new ContactInputError("Completa el formulario de envío.")
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new ContactHttpError(413,"El formulario supera el tamaño permitido.")}chunks.push(value)}
    const data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)))
    if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("invalid")
    return data
  }catch(error){if(error instanceof ContactHttpError)throw error;throw new ContactInputError("No pudimos leer el formulario de envío.")}
  finally{reader.releaseLock()}
}
