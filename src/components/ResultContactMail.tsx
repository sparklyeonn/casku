"use client"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import type { ResultContactReview } from "@/lib/results/contact-store"
import { ResultCard } from "./ResultCard"
type ContactReview=Omit<ResultContactReview,"envios"> & {envios:Array<ResultContactReview["envios"][number] & {contexto?:string}>}
type Props={id:string;revision:number;disabled?:boolean;onStart:()=>boolean;onFinish:()=>void}
const labels:Record<string,string>={ACEPTADO:"El proveedor aceptó esta copia para su envío. Esto no confirma su entrega en el buzón.",PENDIENTE:"La solicitud está guardada. Consulta su estado antes de intentar otra operación.",ENVIANDO:"La solicitud está en curso. Consulta su estado.",REVISION:"No se pudo confirmar la aceptación. El equipo debe revisar este envío; no se repetirá automáticamente.",RECHAZADO:"El envío fue rechazado. Solicita al equipo revisar su estado.",CANCELADO:"Este envío se detuvo. Revisa el contacto, la revisión y sus autorizaciones.",REINTENTABLE:"El proveedor confirmó que no aceptó el envío. Solo se habilita otro intento cuando termina su período de espera."}
export function ResultContactMail({id,revision,disabled=false,onStart,onFinish}:Props) {
  const formId=useId(),endpoint=`/api/kinesiologia/resultados/${id}/contacto`
  const [review,setReview]=useState<ContactReview|null>(null),[loading,setLoading]=useState(true),[sending,setSending]=useState(false)
  const [email,setEmail]=useState(""),[guardianConfirmed,setGuardianConfirmed]=useState(false),[authorized,setAuthorized]=useState(false),[reason,setReason]=useState("")
  const [error,setError]=useState(""),[message,setMessage]=useState(""),[uncertain,setUncertain]=useState(false)
  const inFlight=useRef(false),requestId=useRef<string|null>(null)
  const resetConfirmations=()=>{setEmail("");setGuardianConfirmed(false);setAuthorized(false)}
  const load=useCallback(async(signal?:AbortSignal)=>{
    try{
      const response=await fetch(endpoint,{cache:"no-store",signal}),data=await response.json().catch(()=>null)
      if(!response.ok||!data?.contacto)throw new Error(data?.error||"No pudimos consultar el contacto. Actualiza el estado antes de continuar.")
      if(signal?.aborted)return
      const value=data.contacto as ContactReview
      setReview(value);setError("");setUncertain(false);resetConfirmations()
      requestId.current=null
      setReason(value.envios.find(row=>row.revision===value.revision&&row.contexto===value.contexto)?.motivo??"")
    }catch(cause){if(!signal?.aborted){setUncertain(true);setError(cause instanceof Error?cause.message:"No pudimos conectar. Consulta el estado antes de continuar.")}}
    finally{if(!signal?.aborted)setLoading(false)}
  },[endpoint])
  useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>{if(!controller.signal.aborted)void load(controller.signal)});return()=>controller.abort()},[load])
  const existing=review?.envios.find(row=>row.revision===revision&&row.contexto===review.contexto)
  const requiresReason=!!review&&(review.requiereMotivo||review.envios.some(row=>row.contexto!==review.contexto))
  const current=!!review&&review.revision===revision
  const canRequest=!!review?.habilitado&&current&&!disabled&&!loading&&!sending&&!uncertain&&(!existing||existing.puedeReintentar)
  const ready=canRequest&&guardianConfirmed&&authorized&&email.trim().toLowerCase()===review?.destinatario&&(!requiresReason||reason.trim().length>=5)
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!ready||!review||inFlight.current||!onStart())return
    inFlight.current=true;setSending(true);setError("");setMessage("")
    const body={id:existing?.id??(requestId.current??=crypto.randomUUID()),revision,contexto:review.contexto,correoRepetido:email,confirmarApoderado:guardianConfirmed,autorizarCorreo:authorized,versionConsentimiento:review.versionConsentimiento,...(reason.trim()?{motivo:reason.trim()}:{})}
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
      const data=await response.json().catch(()=>null)
      if(!response.ok||!data?.envio)throw new Error(data?.error||"No pudimos confirmar la respuesta. Consulta el estado guardado antes de continuar.")
      resetConfirmations()
      setReview(previous=>previous?{...previous,envios:[{...data.envio,contexto:review.contexto},...previous.envios.filter(row=>row.id!==data.envio.id)]}:previous)
      setMessage(labels[data.envio.estado]||"Solicitud guardada. Consulta su estado.")
      if(data.envio.estado!=="ACEPTADO")setUncertain(true)
    }catch(cause){setUncertain(true);setError(cause instanceof Error?cause.message:"No pudimos confirmar el envío. Consulta su estado antes de continuar.")}
    finally{inFlight.current=false;setSending(false);onFinish()}
  }
  return <section aria-busy={loading||sending} aria-labelledby={`${formId}-title`} className="space-y-4 rounded-xl border p-5">
    <h2 id={`${formId}-title`} className="text-xl font-semibold">Enviar copia a contacto sin cuenta</h2>
    <p>La copia por correo es independiente de la publicación familiar. No crea ni vincula una cuenta.</p>
    {error&&<p role="alert" className="text-red-700 dark:text-red-200">{error}</p>}{message&&<p role="status">{message}</p>}
    {loading?<p role="status">Consultando contacto y autorizaciones…</p>:review&&<>
      <p>Apoderado registrado: <strong>{review.nombreApoderado||"Sin nombre registrado"}</strong></p>
      <p>Correo guardado: <strong className="break-all">{review.destinatario||"Sin correo registrado"}</strong> · Revisión {review.revision}</p>
      {!current&&<p role="alert">La revisión cambió. Recarga el resultado guardado antes de enviar.</p>}
      {review.motivoBloqueo&&<p role="status">{review.motivoBloqueo}</p>}
      {disabled&&!sending&&<p>Guarda los cambios del borrador y consulta su estado antes de enviar esta copia.</p>}
      {existing&&<p role="status">{labels[existing.estado]||"Consulta el estado de esta solicitud."}</p>}
      {canRequest&&<form onSubmit={submit} className="space-y-4">
        <details><summary>Revisar la copia exacta que se enviará</summary><ResultCard data={review.datos}/></details>
        <label className="block" htmlFor={`${formId}-email`}>Repetir el correo con el apoderado presente<input id={`${formId}-email`} type="email" autoComplete="off" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} className="mt-1 w-full rounded border p-3"/></label>
        <label className="flex gap-3"><input type="checkbox" checked={guardianConfirmed} onChange={event=>setGuardianConfirmed(event.target.checked)}/><span>{review.textos.confirmarApoderado}</span></label>
        <label className="flex gap-3"><input type="checkbox" checked={authorized} onChange={event=>setAuthorized(event.target.checked)}/><span>Revisé esta copia. {review.textos.autorizarCorreo}</span></label>
        {requiresReason&&<label className="block">Motivo de la nueva copia<textarea required minLength={5} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} className="mt-1 w-full rounded border p-3"/></label>}
        <button type="submit" disabled={!ready} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">Enviar copia autorizada a contacto</button>
      </form>}
      {sending&&<p role="status">Guardando la autorización y solicitando el envío…</p>}
      {uncertain&&<p>Consulta el estado guardado. No se repetirá esta solicitud automáticamente.</p>}
      {review.envios.length>0&&<details><summary>Copias de contacto guardadas</summary><ul className="space-y-3 py-3">{review.envios.map(row=><li key={row.id} className="rounded border p-3"><p>Revisión {row.revision} · {row.destinatario}</p><p>{labels[row.estado]||row.estado}</p>{row.motivo&&<p>Motivo: {row.motivo}</p>}<details><summary>Ver copia conservada</summary><ResultCard data={row.datos as unknown as ContactReview["datos"]}/></details></li>)}</ul></details>}
    </>}
    <button type="button" disabled={sending||loading||disabled} onClick={()=>{setLoading(true);void load()}} className="rounded border px-4 py-3 disabled:opacity-50">Actualizar estado del contacto</button>
  </section>
}
