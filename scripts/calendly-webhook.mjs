import { config, parse } from "dotenv"
import { randomBytes } from "node:crypto"
import { readFile, writeFile, chmod } from "node:fs/promises"
config({path:[".env.local",".env"],quiet:true})
const file=".env.calendly-webhook",args=process.argv.slice(2)
async function api(path,body){
 const response=await fetch("https://api.calendly.com"+path,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${process.env.CALENDLY_API_TOKEN||""}`,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:"error",signal:AbortSignal.timeout(15000)})
 if(!response.ok)throw new Error(`Calendly rechazó la operación (${response.status}); revisa permisos y configuración.`)
 return response.json()
}
const resource=(value,kind)=>{
 let url;try{url=new URL(value)}catch{throw new Error("Calendly devolvió una referencia inesperada.")}
 if(url.origin!=="https://api.calendly.com"||url.username||url.password||url.search||url.hash||!new RegExp("^/"+kind+"/[A-Za-z0-9_-]{1,128}$").test(url.pathname))throw new Error("Calendly devolvió una referencia inesperada.")
 return url.href
}
try{
 if(args.length===1&&args[0]==="--prepare"){
  const lines=["# Privado: no subir a Git ni compartir por chat.","CALENDLY_WEBHOOK_ENABLED=1","CALENDLY_WEBHOOK_SIGNING_KEY="+randomBytes(32).toString("base64url"),"CALENDLY_WEBHOOK_SUBSCRIPTION_ID=","CRON_SECRET="+randomBytes(32).toString("base64url"),""]
  await writeFile(file,lines.join(String.fromCharCode(10)),{mode:0o600,flag:"wx"})
  console.log("Claves privadas preparadas en .env.calendly-webhook. No se creó ninguna suscripción ni se enviaron correos.")
 }else if(args.length===3&&args[0]==="--create"&&args[1]==="--url"){
  const target=new URL(args[2])
  if(target.protocol!=="https:"||target.username||target.password||target.search||target.hash||target.pathname!=="/api/calendly/webhook")throw new Error("Usa la URL HTTPS pública exacta del receptor desplegado.")
  const content=await readFile(file,"utf8"),secrets=parse(content)
  if(!/^[A-Za-z0-9_-]{32,256}$/.test(secrets.CALENDLY_WEBHOOK_SIGNING_KEY||""))throw new Error("Prepara la clave de firma antes de crear la suscripción.")
  const probe=await fetch(target,{redirect:"error",signal:AbortSignal.timeout(15000)})
  if(probe.status!==405)throw new Error("El receptor todavía no está desplegado públicamente o está protegido por otro acceso. No se creó la suscripción.")
  const {resource:me}=await api("/users/me"),user=resource(me.uri,"users"),organization=resource(me.current_organization,"organizations")
  const params=new URLSearchParams({organization,user,scope:"user",count:"100"})
  let found=false
  for(let page=0;page<10;page++){
   const listing=await api("/webhook_subscriptions?"+params)
   if(!Array.isArray(listing.collection))throw new Error("No pudimos comprobar suscripciones anteriores.")
   for(const row of listing.collection)if(row.callback_url===target.href&&row.state==="active"){
    const id=resource(row.uri,"webhook_subscriptions").split("/").at(-1)
    console.log("Ya existe una suscripción para este receptor: "+id+". No se duplicó ni se alteró su firma.");found=true
   }
   if(found||!listing.pagination?.next_page_token)break
   if(typeof listing.pagination.next_page_token!=="string"||listing.pagination.next_page_token.length>4096)throw new Error("Paginación inválida.")
   params.set("page_token",listing.pagination.next_page_token)
   if(page===9)throw new Error("No se completó la comprobación de suscripciones; no se creó otra.")
  }
  if(!found){
   const result=await api("/webhook_subscriptions",{url:target.href,events:["invitee.created","invitee.canceled"],organization,user,scope:"user",signing_key:secrets.CALENDLY_WEBHOOK_SIGNING_KEY})
   const id=resource(result.resource?.uri,"webhook_subscriptions").split("/").at(-1)
   await writeFile(file,content.replace(/^CALENDLY_WEBHOOK_SUBSCRIPTION_ID=.*$/m,"CALENDLY_WEBHOOK_SUBSCRIPTION_ID="+id),{mode:0o600});await chmod(file,0o600)
   console.log("Suscripción creada. Su referencia quedó guardada en .env.calendly-webhook; copia sus variables al alojamiento y verifica la conexión desde administración. No se enviaron correos.")
  }
 }else throw new Error("Usa --prepare o --create --url https://tu-host/api/calendly/webhook. Solo --create modifica Calendly.")
}catch(error){console.error(error.code==="EEXIST"?"El archivo privado ya existe; no se rotaron sus claves.":error instanceof TypeError?"No se pudo conectar. Revisa la configuración sin compartir claves.":error.message);process.exitCode=1}
