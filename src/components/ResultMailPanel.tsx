"use client"
import { useRef, useState } from "react"
export function ResultMailPanel({ initial, endpoint }: { initial: { estado: string }; endpoint: string }) {
  const [state, setState] = useState(initial.estado), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const inFlight = useRef(false)
  async function retry() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError("")
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No pudimos reintentar el correo.")
      const mail = data.resultado?.publicacion?.correo || data.resultado?.correo
      if (!mail) throw new Error("El resultado no está disponible para esta cuenta.")
      setState(mail.estado)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos conectar.") }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <section className="space-y-3 rounded-xl border p-5"><h2 className="font-semibold">Correo de resultados</h2><p role="status">{state === "ENVIADO" ? "El proveedor aceptó el correo para su envío. Revisa también la carpeta de spam." : state === "ENVIANDO" ? "El envío está en curso. El resultado ya está publicado." : "El envío está pendiente. El resultado sigue disponible en la cuenta familiar."}</p>{state !== "ENVIADO" && <><button type="button" disabled={busy} onClick={retry} className="rounded-lg border px-4 py-2 disabled:opacity-50">{busy ? "Reintentando…" : "Reintentar correo"}</button><p className="text-xs text-gray-600 dark:text-gray-300">Espera al menos un minuto entre intentos de envío fallidos.</p></>}{error && <p role="alert" className="text-red-700 dark:text-red-200">{error}</p>}</section>
}
