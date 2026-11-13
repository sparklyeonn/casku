"use client"
import { useRef,useState } from "react"
import { signOut } from "next-auth/react"
import Link from "next/link"
export function TeamPasswordForm({email,temporary}:{email:string;temporary:boolean}) {
 const [current,setCurrent]=useState(""),[password,setPassword]=useState(""),[confirmation,setConfirmation]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false)
 const working=useRef(false)
 async function submit(event:React.FormEvent) {
  event.preventDefault();if(working.current)return
  if(password!==confirmation){setError("Las contraseñas no coinciden.");return}
  working.current=true;setBusy(true);setError("")
  try {
   const response=await fetch("/api/equipo/clave",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({actual:current,nueva:password,confirmacion:confirmation})}),body=await response.json()
   if(!response.ok)throw new Error(body.error||"No pudimos actualizar la contraseña.")
   setCurrent("");setPassword("");setConfirmation("");setDone(true)
   await signOut({redirect:false}).catch(()=>{})
  }catch(cause){setError(cause instanceof Error?cause.message:"No pudimos confirmar el cambio. Si la respuesta se perdió, intenta ingresar con la nueva contraseña antes de volver a cambiarla.")}
  finally{working.current=false;setBusy(false)}
 }
 return <main className="mx-auto max-w-xl space-y-5 px-5 py-10"><h1 className="text-3xl font-semibold">{temporary?"Debes cambiar tu contraseña temporal":"Cambiar mi contraseña"}</h1>{done?<div role="status" className="space-y-4"><p>Contraseña actualizada. Se cerraron las sesiones anteriores de tu cuenta.</p>{busy?<p>Cerrando la sesión anterior…</p>:<Link href="/login" className="inline-block rounded bg-teal-700 px-4 py-3 text-white">Ingresar con mi nueva contraseña</Link>}</div>:<><p>{temporary?"Antes de acceder a las funciones del equipo, elige una contraseña propia y diferente de la que recibiste.":"El cambio cerrará todas tus sesiones, incluida esta. Tu trabajo guardado se conserva."}</p><form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4"><label className="block">Cuenta<input readOnly autoComplete="username" value={email} className="mt-1 w-full rounded border p-3"/></label><label className="block">Contraseña actual<input required type="password" autoComplete="current-password" maxLength={128} value={current} onChange={event=>setCurrent(event.target.value)} className="mt-1 w-full rounded border p-3"/></label><label className="block">Nueva contraseña<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event=>setPassword(event.target.value)} className="mt-1 w-full rounded border p-3"/></label><label className="block">Confirmar nueva contraseña<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={event=>setConfirmation(event.target.value)} className="mt-1 w-full rounded border p-3"/></label></fieldset><p className="text-sm">Entre 12 y 128 caracteres. No reutilices la contraseña actual.</p>{error&&<p role="alert" className="text-red-700 dark:text-red-200">{error}</p>}<button disabled={busy} className="rounded bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy?"Actualizando…":"Guardar nueva contraseña"}</button></form><Link href="/recuperar-clave" className="inline-block underline">No recuerdo mi contraseña</Link></>}</main>
}
