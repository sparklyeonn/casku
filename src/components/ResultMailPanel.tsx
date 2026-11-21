"use client"
import { useRef, useState } from "react"
import { resultMailState, type ResultMailState } from "@/lib/results/mail-state"
export function ResultMailPanel({ initial, endpoint, disabled = false, retryAllowed = true }: { initial: ResultMailState; endpoint: string; disabled?: boolean; retryAllowed?: boolean }) {
  const [mail, setMail] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [currentVersionAllowsRetry, setCurrentVersionAllowsRetry] = useState(retryAllowed)
  const inFlight = useRef(false)
  const status = resultMailState(mail, retryAllowed && currentVersionAllowsRetry)
  async function request(retry: boolean) {
    if (inFlight.current || disabled || (retry && (!status.canRetry || needsRefresh))) return
    inFlight.current = true; setBusy(true); setError("")
    try {
      const response = await fetch(retry ? endpoint : endpoint.replace(/\/correo$/, ""), retry ? { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" } : { cache: "no-store" })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || (response.status === 401 ? "Tu sesión venció. Vuelve a ingresar." : "No pudimos consultar el correo. Actualiza el estado antes de reintentar."))
      const current = data?.resultado?.publicacion?.correo || data?.resultado?.correo
      if (!current || typeof current.estado !== "string") throw new Error("El resultado no está disponible para esta cuenta. Vuelve al listado para consultar la versión vigente.")
      setCurrentVersionAllowsRetry((data.resultado.publicacion?.version ?? data.resultado.version) === 1)
      setMail(current); setNeedsRefresh(false)
    } catch (cause) {
      if (retry) setNeedsRefresh(true)
      setError(cause instanceof Error ? cause.message : "No pudimos conectar. Actualiza el estado antes de reintentar.")
    } finally { inFlight.current = false; setBusy(false) }
  }
  return <section aria-busy={busy} className="space-y-3 rounded-xl border p-5"><h2 className="font-semibold">Correo de resultados</h2><p role="status">{status.text}</p>{status.waiting && <p>Hay un período de espera entre intentos. Actualiza el estado más adelante para comprobar si ya puedes reintentar.</p>}{needsRefresh && <p role="status">El intento pudo haberse procesado. Consulta su estado antes de volver a solicitarlo.</p>}<div className="flex flex-wrap gap-3"><button type="button" disabled={busy || disabled} onClick={() => request(false)} className="rounded-lg border px-4 py-3 disabled:opacity-50">{busy ? "Consultando…" : "Actualizar estado del correo"}</button>{status.canRetry && <button type="button" disabled={busy || disabled || needsRefresh} onClick={() => request(true)} className="rounded-lg border px-4 py-3 disabled:opacity-50">Reintentar correo autorizado</button>}</div>{(!retryAllowed || !currentVersionAllowsRetry) && <p className="text-sm">Esta versión se gestiona mediante la cola de correo. Actualizar el estado no solicita un envío.</p>}{error && <p role="alert" className="text-red-700 dark:text-red-200">{error}</p>}</section>
}
