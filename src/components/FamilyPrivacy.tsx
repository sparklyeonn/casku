"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { familyPermissions, familyConsentHistory } from "@/lib/privacy/store"
import { emptyPrivacy, PRIVACY_VERSION, type PrivacyChoice } from "@/lib/privacy/policy"
import { PrivacyFields } from "./PrivacyFields"
type List = Awaited<ReturnType<typeof familyPermissions>>
type Entry = List["autorizaciones"][number]
type History = NonNullable<Awaited<ReturnType<typeof familyConsentHistory>>>
async function read(response: Response) {
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || "No pudimos actualizar las autorizaciones.")
  return value
}
export function FamilyPrivacy() {
  const [data,setData]=useState<List|null>(null),[page,setPage]=useState(1),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false)
  const working=useRef(false)
  const load=useCallback(async(signal?:AbortSignal)=>{const value=await read(await fetch(`/api/familias/privacidad?pagina=${page}`,{cache:"no-store",signal}));if(!signal?.aborted)setData(value)},[page])
  useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>{if(!controller.signal.aborted)return load(controller.signal)}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"No pudimos cargar tus autorizaciones.")});return()=>controller.abort()},[load])
  async function save(row:Entry,choice:PrivacyChoice) {
    if(working.current)return
    working.current=true;setBusy(true);setError("");setMessage("")
    try {
      await read(await fetch("/api/familias/privacidad",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventoId:row.eventoId,pacienteId:row.pacienteId,revision:row.autorizacion?.revision??0,privacidad:choice})}))
      setMessage(`Autorizaciones guardadas para ${row.bebe}.`)
      await load()
    } catch(cause) {
      setError(cause instanceof Error?cause.message:"No pudimos guardar.")
      await load().catch(()=>{})
    } finally {working.current=false;setBusy(false)}
  }
  return <main className="mx-auto max-w-4xl space-y-6 px-5 py-8"><h1 className="text-3xl font-semibold">Mis autorizaciones</h1><p>Se guardan por bebé y evento. Los correos de resultados y seguimiento son opcionales; los de acceso, inscripción y QR son independientes.</p><p>Retirar la autorización de datos detiene nuevas evaluaciones y envíos clínicos de este evento. Conserva el historial y los resultados ya publicados; no cancela la inscripción ni borra la ficha. Un envío que ya esté en curso puede completarse.</p>{error&&<p role="alert" className="rounded-lg border border-red-400 p-4">{error}</p>}{message&&<p role="status">{message}</p>}{!data?<p>Cargando…</p>:data.autorizaciones.length===0?<p>No hay autorizaciones en esta página.</p>:data.autorizaciones.map(row=><Choice key={`${row.eventoId}:${row.pacienteId}:${row.autorizacion?.revision??0}`} row={row} disabled={busy} onSave={choice=>save(row,choice)}/>)}<div className="flex gap-3"><button disabled={busy||page===1} onClick={()=>setPage(value=>value-1)} className="rounded border px-3 py-2 disabled:opacity-50">Anterior</button><span>Página {page}</span><button disabled={busy||!data?.hayMas} onClick={()=>setPage(value=>value+1)} className="rounded border px-3 py-2 disabled:opacity-50">Siguiente</button></div></main>
}
function Choice({row,disabled,onSave}:{row:Entry;disabled:boolean;onSave:(value:PrivacyChoice)=>Promise<void>}) {
  const current=row.autorizacion?.version===PRIVACY_VERSION?row.autorizacion:null
  const [choice,setChoice]=useState<PrivacyChoice>(current?{version:PRIVACY_VERSION,datos:current.datos,correoResultados:current.correoResultados,seguimiento:current.seguimiento}:emptyPrivacy)
  return <section className="space-y-4 rounded-xl border p-5"><h2 className="text-xl font-semibold">{row.bebe} · {row.evento}</h2><p>{current?current.datos?"Datos autorizados":"Autorización de datos retirada":"Autorización pendiente: revisa los textos vigentes."}</p><PrivacyFields disabled={disabled} value={choice} onChange={setChoice}/><div className="flex flex-wrap gap-3"><button disabled={disabled} onClick={()=>onSave(choice)} className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50">Guardar autorizaciones</button>{current?.seguimiento&&<button disabled={disabled} onClick={()=>onSave({version:PRIVACY_VERSION,datos:current.datos,correoResultados:current.correoResultados,seguimiento:false})} className="rounded-lg border px-4 py-2">Retirar seguimiento</button>}</div>{row.autorizacion&&<HistoryView id={row.autorizacion.id}/>}</section>
}
function HistoryView({id}:{id:string}) {
 const [data,setData]=useState<History|null>(null),[page,setPage]=useState(1),[open,setOpen]=useState(false),[error,setError]=useState("")
 useEffect(()=>{if(!open)return;const controller=new AbortController();fetch(`/api/familias/privacidad/${id}/historial?pagina=${page}`,{cache:"no-store",signal:controller.signal}).then(read).then(value=>{if(!controller.signal.aborted){setData(value);setError("")}}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"No pudimos consultar el historial.")});return()=>controller.abort()},[id,page,open])
 return <details onToggle={event=>setOpen(event.currentTarget.open)}><summary>Historial de autorizaciones</summary>{error&&<p role="alert">{error}</p>}{data&&<><ul>{data.cambios.map(change=><li key={change.revision} className="py-2 text-sm">Revisión {change.revision} · {new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeStyle:"short"}).format(new Date(change.createdAt))} · {change.canal==="CUENTA_VERIFICADA"?"Cuenta verificada":"Documento revisado por el equipo"} · Datos: {change.nueva.datos?"sí":"no"}; resultados por correo: {change.nueva.correoResultados?"sí":"no"}; seguimiento: {change.nueva.seguimiento?"sí":"no"} · Texto {change.versionTexto}</li>)}</ul><button disabled={page===1} onClick={()=>setPage(value=>value-1)} className="mr-3 underline disabled:opacity-50">Anterior</button><button disabled={!data.hayMas} onClick={()=>setPage(value=>value+1)} className="underline disabled:opacity-50">Siguiente</button></>}</details>
}
