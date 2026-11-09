"use client"
import { useRef, useState } from "react"
import { getSession, signIn, useSession } from "next-auth/react"

export function FamilyAccess({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { data: session } = useSession()
  const [correo, setCorreo] = useState(""), [codigo, setCodigo] = useState("")
  const [challenge, setChallenge] = useState<{ desafioId: string; navegador: string } | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("")
  const inFlight = useRef(false)
  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault(); if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(""); setMessage("")
    try {
      const response = await fetch("/api/familias/acceso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ correo }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No pudimos enviar el código.")
      setChallenge({ desafioId: data.desafioId, navegador: data.navegador }); setCodigo("")
      setMessage("Enviamos un código a tu correo. Revisa también la carpeta de spam.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos conectar.") }
    finally { setBusy(false); inFlight.current = false }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault(); if (!challenge || inFlight.current) return
    inFlight.current = true; setBusy(true); setError("")
    try {
      const result = await signIn("familias", { ...challenge, codigo, redirect: false })
      if (!result?.ok || result.error) throw new Error("El código no coincide, venció o ya se utilizó. Puedes solicitar uno nuevo.")
      const current = await getSession()
      if (current?.user.role !== "APODERADO") throw new Error("No pudimos verificar la sesión. Vuelve a intentarlo.")
      setCodigo(""); setChallenge(null); onAuthenticated()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos verificar el código.") }
    finally { setBusy(false); inFlight.current = false }
  }
  if (session?.user.role === "APODERADO") return <div className="mt-5 space-y-4"><p>Ya ingresaste como {session.user.email}.</p><button type="button" onClick={onAuthenticated} className="rounded-lg bg-teal-700 px-5 py-3 text-white">Continuar con mi cuenta familiar</button></div>
  return <div className="mt-5 space-y-5">
    <p className="text-sm text-gray-600 dark:text-gray-300">Verifica tu correo para inscribir a tu bebé y consultar sus comprobantes. No necesitas una contraseña.</p>
    {session?.user.role && <p className="text-sm text-amber-700 dark:text-amber-200">Al ingresar como familia, cambiarás tu sesión del equipo por la familiar.</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}
    {message && <p role="status" className="text-sm text-teal-800 dark:text-teal-200">{message}</p>}
    {!challenge ? <form onSubmit={requestCode} className="space-y-4"><label className="block">Correo del apoderado<input type="email" required autoComplete="email" maxLength={254} value={correo} onChange={e => setCorreo(e.target.value)} className="mt-2 w-full rounded-lg border bg-transparent p-3" /></label><button disabled={busy} className="w-full rounded-lg bg-teal-700 p-3 text-white disabled:opacity-50">{busy ? "Enviando…" : "Recibir código de acceso"}</button></form> : <form onSubmit={verify} className="space-y-4"><p className="break-all text-sm">Correo: {correo}</p><label className="block">Código de 6 dígitos<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-2 w-full rounded-lg border bg-transparent p-3 text-center text-2xl tracking-widest" /></label><p className="text-sm text-gray-600 dark:text-gray-300">El código vence en 10 minutos y solo puede usarse una vez.</p><button disabled={busy} className="w-full rounded-lg bg-teal-700 p-3 text-white disabled:opacity-50">{busy ? "Verificando…" : "Verificar e ingresar"}</button><div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => { setChallenge(null); setCodigo(""); setError(""); setMessage("") }} className="rounded-lg border px-3 py-2">Cambiar correo</button><button type="button" disabled={busy} onClick={() => requestCode()} className="rounded-lg border px-3 py-2">Solicitar otro código</button></div><p className="text-xs text-gray-500 dark:text-gray-400">Espera al menos un minuto entre solicitudes.</p></form>}
  </div>
}
