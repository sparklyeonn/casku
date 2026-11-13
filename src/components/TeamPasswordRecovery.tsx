"use client"
import { useEffect,useRef,useState } from "react"
import Link from "next/link"
export function TeamPasswordRecovery() {
 const [token,setToken]=useState<string|null>(null),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[confirmation,setConfirmation]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(""),[done,setDone]=useState(false)
 const operation=useRef(false),captured=useRef<string|null>(null)
 useEffect(()=>{if(captured.current===null)captured.current=new URLSearchParams(window.location.hash.slice(1)).get("token")||"";const value=captured.current;if(window.location.hash)window.history.replaceState(window.history.state,"",window.location.pathname);let mounted=true;void Promise.resolve().then(()=>{if(mounted)setToken(value)});return()=>{mounted=false}},[])
 async function submit(event:React.FormEvent) {
  event.preventDefault();if(operation.current)return
  if(token&&password!==confirmation){setError("Las contraseñas no coinciden.");return}
  operation.current=true;setBusy(true);setError("");setMessage("")
  try {
   const response=await fetch(`/api/equipo/recuperacion/${token?"confirmar":"solicitar"}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(token?{token,nueva:password,confirmacion:confirmation}:{email})}),body=await response.json()
   if(!response.ok)throw new Error(body.error||"No pudimos completar la solicitud.")
   setMessage(body.message)
   if(token){setPassword("");setConfirmation("");setToken("");setDone(true)}
  }catch(cause){setError(cause instanceof Error?cause.message:"No pudimos confirmar la respuesta. Si acababas de guardar una contraseña, intenta ingresar con ella antes de solicitar otro enlace.")}
  finally{operation.current=false;setBusy(false)}
 }
 return <main className="mx-auto max-w-xl space-y-5 px-5 py-10"><Link href="/login" className="text-teal-700 underline dark:text-teal-300">Volver al acceso</Link><h1 className="text-3xl font-semibold">Recuperar contraseña del equipo</h1>{token===null?<p role="status">Revisando enlace…</p>:done?<p role="status">{message}</p>:<><p>{token?"Elige una contraseña propia. Guardarla cerrará las sesiones anteriores de esta cuenta.":"Ingresa el correo de tu cuenta del equipo. Los enlaces de recuperación vencen en 30 minutos y se pueden utilizar una sola vez."}</p><form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4">{token?<><label className="block">Nueva contraseña<input type="password" required autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event=>setPassword(event.target.value)} className="mt-1 w-full rounded border p-3"/></label><label className="block">Confirmar nueva contraseña<input type="password" required autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={event=>setConfirmation(event.target.value)} className="mt-1 w-full rounded border p-3"/></label></>:<label className="block">Correo del equipo<input type="email" required autoComplete="username" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} className="mt-1 w-full rounded border p-3"/></label>}</fieldset>{error&&<p role="alert" className="text-red-700 dark:text-red-200">{error}</p>}{message&&<p role="status">{message}</p>}<button disabled={busy} className="rounded bg-teal-700 px-4 py-3 text-white disabled:opacity-50">{busy?"Procesando…":token?"Guardar nueva contraseña":"Solicitar enlace"}</button></form>{token&&<button disabled={busy} className="underline" onClick={()=>{setToken("");setPassword("");setConfirmation("");setError("")}}>Solicitar otro enlace</button>}<p className="text-sm">Los envíos reales de recuperación están pendientes de la integración con Brevo. Mientras tanto, puedes pedir a administración una nueva clave temporal.</p></>}</main>
}
