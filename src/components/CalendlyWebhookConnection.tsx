"use client"
import { useEffect, useRef, useState } from "react"
type Status={configurada:boolean;verificada:boolean;verificadaAt:string|null;pendientes:number;revision:number}
export function CalendlyWebhookConnection(){
 const [data,setData]=useState<Status|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false)
 const working=useRef(false)
 async function load(verify=false,signal?:AbortSignal){
  if(working.current)return;working.current=true;setBusy(true);setError("")
  try{
   if(verify){const response=await fetch("/api/administracion/calendly/webhooks",{method:"POST"});const next=await response.json();if(!response.ok)throw new Error(next.error||"No pudimos verificar los avisos.")}
   const response=await fetch("/api/administracion/calendly/webhooks",{cache:"no-store",signal}),value=await response.json()
   if(!response.ok)throw new Error(value.error||"No pudimos consultar los avisos.")
   if(!signal?.aborted)setData(value)
  }catch(cause){if(!signal?.aborted)setError(cause instanceof Error?cause.message:"Avisos no disponibles.")}
  finally{working.current=false;if(!signal?.aborted)setBusy(false)}
 }
 useEffect(()=>{const controller=new AbortController();queueMicrotask(()=>{if(!controller.signal.aborted)void load(false,controller.signal)});return()=>controller.abort()},[])
 return <section aria-label="Avisos automáticos de Calendly" className="space-y-4 rounded-2xl border p-5"><h2 className="text-xl font-semibold">Avisos automáticos de Calendly</h2>
 <p aria-live="polite">{!data?"Consultando configuración…":data.verificada?"Conexión automática verificada. Puede funcionar con el panel cerrado.":data.configurada?"Falta verificar la suscripción o completar su recuperación.":"Configuración pendiente en el alojamiento."}</p>
 {data&&<p>{data.pendientes||0} avisos pendientes · {data.revision||0} avisos que requieren revisión de jornada.</p>}
 {error&&<p role="alert">{error}</p>}
 <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} className="rounded-full border px-5 py-3" onClick={()=>void load()}>Actualizar estado de avisos</button><button type="button" disabled={busy||!data?.configurada} className="rounded-full border px-5 py-3" onClick={()=>void load(true)}>{busy?"Comprobando…":"Verificar conexión y reintentar"}</button></div>
 <p className="text-sm">Después de verificar la conexión, actualiza una vez la protección de cada jornada para incorporar sus citas previas. Los avisos posteriores se procesan sin abrir esta página. Los cambios de citas ya vinculadas conservan su inscripción y requieren revisión antes de volver a llamar.</p>
 <p className="text-sm">No se crean cuentas, no se aceptan autorizaciones por las familias y no se envían correos desde esta integración.</p></section>
}
