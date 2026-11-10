"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { signOut } from "next-auth/react"
import { TEAM_ACTIVE_SESSIONS, TEAM_SESSION_HOURS, TEAM_SESSION_IDLE_MINUTES } from "@/lib/team-auth/policy"
type Session = { id: string; actual: boolean; inicio: string; actividad: string; vence: string }
function date(value: string) { return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) }
async function read(response: Response) {
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || "No pudimos consultar tus sesiones.")
  return result
}
export function TeamSessions() {
  const [sessions, setSessions] = useState<Session[] | null>(null), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false)
  const working = useRef(false)
  const load = useCallback(async (signal?: AbortSignal) => {
    const value = await read(await fetch("/api/equipo/sesiones", { cache: "no-store", signal }))
    if (!signal?.aborted) setSessions(value.sesiones)
  }, [])
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => { if (!controller.signal.aborted) return load(controller.signal) }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos consultar tus sesiones.") }); return () => controller.abort() }, [load])
  async function close(id: string | null) {
    if (working.current) return
    working.current = true; setBusy(true); setError(""); setMessage("")
    try {
      const value = await read(await fetch("/api/equipo/sesiones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { accion: "CERRAR_UNA", sesionId: id } : { accion: "CERRAR_TODAS" }) }))
      if (value.cerrarActual) { await signOut({ callbackUrl: "/login" }); return }
      setMessage("Sesión cerrada. Ese acceso ya no puede consultar ni guardar información.")
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cerrar la sesión.") }
    finally { working.current = false; setBusy(false) }
  }
  return <main className="mx-auto max-w-4xl space-y-6 px-5 py-8"><h1 className="text-3xl font-semibold">Seguridad y sesiones</h1><p>Los accesos del equipo duran como máximo {TEAM_SESSION_HOURS} horas y vencen tras {TEAM_SESSION_IDLE_MINUTES} minutos sin solicitudes autenticadas. Las pantallas que se actualizan solas mantienen actividad.</p><p>Se permiten hasta {TEAM_ACTIVE_SESSIONS} sesiones activas; un nuevo ingreso cierra la más antigua al superar ese límite. Cerrar una sesión conserva las atenciones y datos guardados. Las mediciones sin guardar no se recuperan automáticamente.</p>
    {error && <p role="alert" className="rounded-lg border border-red-400 p-4">{error}</p>}{message && <p role="status">{message}</p>}
    {sessions === null ? <p>Cargando sesiones…</p> : <ul className="space-y-4">{sessions.map(session => <li key={session.id} className="space-y-3 rounded-xl border p-5"><h2 className="font-semibold">{session.actual ? "Esta sesión" : "Otra sesión"}</h2><p>Ingreso: {date(session.inicio)}</p><p>Última actividad: {date(session.actividad)}</p><p>Vence a más tardar: {date(session.vence)}</p><button type="button" disabled={busy} onClick={() => close(session.id)} className="rounded-lg border px-4 py-2 disabled:opacity-50">{session.actual ? "Cerrar esta sesión" : "Cerrar sesión remota"}</button></li>)}</ul>}
    <button type="button" disabled={busy || sessions === null} onClick={() => close(null)} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">Cerrar todas mis sesiones, incluida esta</button>
  </main>
}
