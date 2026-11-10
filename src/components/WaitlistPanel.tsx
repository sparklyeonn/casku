"use client"
import { useEffect, useRef, useState } from "react"
import type { FamilyWaitlist, StaffWaitlist } from "@/lib/waitlist/store"
const labels = { PENDIENTE: "Esperando cupo", ASIGNADA: "Cupo asignado", RETIRADA: "Solicitud retirada", NO_ELEGIBLE: "Requiere revisión" }
type Props = { eventoId?: string; disabled?: boolean; refreshKey?: string; onStart?: () => boolean; onFinish?: () => void; onChanged?: () => Promise<void> }
export function WaitlistPanel({ eventoId, disabled = false, refreshKey, onStart, onFinish, onChanged }: Props) {
  const [data, setData] = useState<FamilyWaitlist | StaffWaitlist | null>(null), [page, setPage] = useState(1)
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false)
  const working = useRef(false), callbacks = useRef({ onChanged }), previous = useRef<string | null>(null)
  useEffect(() => { callbacks.current = { onChanged } }, [onChanged])
  const endpoint = eventoId ? `/api/lista-espera/${eventoId}` : "/api/familias/lista-espera"
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      if (working.current || disabled || controller.signal.aborted) return
      working.current = true
      try {
        const response = await fetch(`${endpoint}?pagina=${page}`, { cache: "no-store", signal: controller.signal }), result = await response.json()
        if (!response.ok) throw new Error(result.error || "No pudimos consultar la lista.")
        if (controller.signal.aborted) return
        const signature = JSON.stringify(result.solicitudes.map((row: FamilyWaitlist["solicitudes"][number]) => [row.id, row.estado]))
        const changed = previous.current !== null && previous.current !== signature
        previous.current = signature; setData(result); setError("")
        if (changed && !eventoId) await callbacks.current.onChanged?.()
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos consultar la lista.") }
      finally { working.current = false }
    }
    void Promise.resolve().then(load)
    const refresh = () => { if (!document.hidden) void load() }
    const interval = setInterval(refresh, 15000)
    document.addEventListener("visibilitychange", refresh)
    return () => { controller.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", refresh) }
  }, [endpoint, page, refreshKey, disabled, busy, eventoId])
  async function act(id?: string) {
    if (working.current || disabled || (onStart && !onStart())) return
    working.current = true; setBusy(true); setError(""); setMessage("")
    try {
      const response = await fetch(id ? `/api/familias/lista-espera/${id}/retirar` : endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), value = await response.json()
      if (!response.ok) throw new Error(value.error || "No pudimos actualizar la lista.")
      setMessage(id ? "Solicitud retirada. Conservamos su historial." : `${value.asignadas} cupos confirmados por orden de lista.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos actualizar la lista.") }
    finally { working.current = false; setBusy(false); onFinish?.() }
  }
  return <section className="space-y-4 rounded-2xl border p-6"><h2 className="text-2xl font-semibold">Lista de espera de cupos</h2><p className="text-sm text-gray-600 dark:text-gray-300">Las cancelaciones y ampliaciones de capacidad confirman reservas por orden de solicitud. Esta lista no es la fila de atención del evento.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {eventoId && <><p>{data && "pendientes" in data ? data.pendientes : "…"} solicitudes esperando cupo</p><button type="button" disabled={busy || disabled} onClick={() => act()} className="rounded-lg border px-4 py-2 disabled:opacity-50">{busy ? "Procesando…" : "Procesar cupos disponibles"}</button><p className="text-sm">La asignación respeta el orden guardado; no permite seleccionar ni adelantar familias.</p></>}
    {!data ? <p>Cargando lista…</p> : !data.solicitudes.length ? <p>No hay solicitudes en esta página.</p> : <ul className="divide-y">{data.solicitudes.map(row => <li key={row.id} className="space-y-2 py-4"><h3 className="font-semibold">{row.nombreBebe} · {row.evento}</h3><p>{labels[row.estado]} · Orden de solicitud {row.orden}{row.posicion !== null ? ` · Posición actual ${row.posicion}` : ""}</p>{"correo" in row && <p className="break-words">{String(row.apoderado)} · {String(row.correo)}</p>}{row.estado === "ASIGNADA" ? <p>N.º {row.numero}. {eventoId ? "Reserva confirmada; recepción verificará su llegada." : "Consulta el comprobante y QR en Mis inscripciones. Si cancelaste esa reserva, se conserva allí su historial."}</p> : row.motivo && <p>{row.motivo}</p>}{!eventoId && row.estado === "PENDIENTE" && <button type="button" disabled={busy || disabled} onClick={() => act(row.id)} className="rounded-lg border px-4 py-2 disabled:opacity-50">Retirarme de esta lista</button>}</li>)}</ul>}
    <div className="flex gap-3"><button type="button" disabled={page === 1 || busy || disabled} onClick={() => setPage(value => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Anterior</button><span className="py-2">Página {page}</span><button type="button" disabled={!data?.hayMas || busy || disabled} onClick={() => setPage(value => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Siguiente</button></div>
  </section>
}
