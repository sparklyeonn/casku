"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { QueueNotice, type QueuePreview } from "./QueueNotice"
import { originLabel, type Origin } from "@/lib/queue/policy"
import { eventDate } from "./PublicEvents"
import type { EventSummary } from "@/lib/events/input"
import type { AssignedForm } from "./FormularioEvaluacion"
type Attention = AssignedForm & { origen: Origin; eventoId: string; apoderado: string; llamadaAt: string | null }
const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
async function read(response: Response) {
  if (response.status === 401 || response.status === 403) { window.location.replace("/login"); throw new Error("Vuelve a ingresar con tu cuenta de kinesiología.") }
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "No pudimos completar la operación.")
  return data
}
export function KinesiologyDesk() {
  const [events, setEvents] = useState<EventSummary[]>([]), [selected, setSelected] = useState("")
  const [active, setActive] = useState<Attention | null>(null), [waiting, setWaiting] = useState<number | null>(null)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [updated, setUpdated] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ proximo: QueuePreview | null; previas: number; presenciales: number } | null>(null)
  const operation = useRef(false), requestId = useRef<string | null>(null), polling = useRef(false), revision = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([fetch("/api/kinesiologia/eventos", { cache: "no-store", signal: controller.signal }).then(read), fetch("/api/kinesiologia/atencion", { cache: "no-store", signal: controller.signal }).then(read)])
      .then(([data, attention]) => { if (!controller.signal.aborted) { setEvents(data.eventos); setSelected(data.seleccionadoId || attention.atencion?.eventoId || ""); setActive(attention.atencion) } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos cargar tus eventos.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  const refresh = useCallback((signal?: AbortSignal) => {
    if (polling.current || operation.current) return Promise.resolve()
    polling.current = true
    const version = revision.current
    return fetch(`/api/kinesiologia/atencion${selected ? `?eventoId=${selected}` : ""}`, { cache: "no-store", signal }).then(read)
      .then(data => { if (!signal?.aborted && version === revision.current && !operation.current) { setActive(data.atencion); setWaiting(data.esperando ?? null); setPreview(data.esperando === undefined ? null : data); setUpdated(new Date().toLocaleTimeString("es-CL")); if (data.atencion) { requestId.current = null; setUncertain(false) } } })
      .catch(cause => { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "No pudimos actualizar la atención. La pantalla puede estar desactualizada.") })
      .finally(() => { polling.current = false })
  }, [selected])
  useEffect(() => {
    if (loading) return
    const controller = new AbortController()
    void refresh(controller.signal)
    const interval = setInterval(() => { if (!document.hidden) void refresh(controller.signal) }, 10000)
    const focus = () => { if (!document.hidden) void refresh(controller.signal) }
    window.addEventListener("focus", focus)
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener("focus", focus) }
  }, [refresh, loading])
  async function select(eventoId: string) {
    if (operation.current || uncertain) return
    operation.current = true; revision.current++; setBusy(true); setError(""); setMessage("")
    try { await read(await fetch("/api/kinesiologia/eventos", post({ eventoId }))); setSelected(eventoId); setWaiting(null); setPreview(null) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos seleccionar el evento.") }
    finally { operation.current = false; setBusy(false) }
  }
  async function call() {
    if (!selected || operation.current || active) return
    operation.current = true; revision.current++; setBusy(true); setError(""); setMessage("")
    requestId.current ??= crypto.randomUUID()
    try {
      const data = await read(await fetch("/api/kinesiologia/llamar", post({ eventoId: selected, id: requestId.current })))
      requestId.current = null; setUncertain(false); setActive(data.atencion)
      setMessage(data.resultado === "VACIA" ? "No hay bebés habilitados para llamar. Si hay familias en espera, solicita a recepción que revise sus autorizaciones." : data.resultado === "TERMINADA" ? "Ese llamado ya terminó. Actualiza tu atención antes de continuar." : `Llamado registrado: inscripción N.º ${String(data.atencion.numero).padStart(3, "0")}. Confirma con la familia el nombre del bebé.`)
    } catch (cause) { setUncertain(true); setError(cause instanceof Error ? cause.message : "No pudimos confirmar el llamado. Reintenta sin cambiar el evento.") }
    finally { operation.current = false; setBusy(false); await refresh() }
  }
  async function release(action: "devolver" | "ausente") {
    if (!active || operation.current) return
    operation.current = true; revision.current++; setBusy(true); setError(""); setMessage("")
    try {
      await read(await fetch(`/api/kinesiologia/${action}`, post({ atencionId: active.id, reservaId: active.reservaId })))
      setActive(null); setMessage(action === "ausente" ? "Familia marcada ausente. Tu atención quedó libre; recepción podrá reincorporarla cuando vuelva." : "El bebé volvió a la fila y conserva su orden de llegada.")
      requestId.current = null; setUncertain(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos devolver la atención.") }
    finally { operation.current = false; setBusy(false); await refresh() }
  }
  const event = events.find(item => item.id === selected)
  return <main className="mx-auto max-w-5xl space-y-6 px-5 py-8"><div><p className="text-sm text-teal-700 dark:text-teal-300">Kinesiología</p><h1 className="mt-2 text-3xl font-semibold">Mi atención</h1><p className="mt-3 text-gray-600 dark:text-gray-300">Llama al siguiente bebé, confirma su identidad con la familia y registra sus mediciones.</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-100">{error} Puedes actualizar para comprobar el estado.</p>}{message && <p role="status" className="rounded-lg bg-teal-50 p-4 text-teal-900 dark:bg-teal-950 dark:text-teal-100">{message}</p>}
    {loading ? <p role="status">Cargando tu atención…</p> : <>
      <section className="rounded-xl border p-5"><label className="block font-medium">Evento de trabajo<select value={selected} disabled={busy || uncertain} onChange={e => select(e.target.value)} className="mt-2 w-full rounded-lg border bg-white p-3 text-gray-900 dark:bg-gray-900 dark:text-gray-100"><option value="" disabled>Selecciona el evento</option>{events.map(item => <option key={item.id} value={item.id}>{item.nombre} · {eventDate(item.fecha)}</option>)}</select></label>{events.length === 0 && <p className="mt-3">No hay eventos disponibles. Solicita a administración que cree uno.</p>}{event && <p className="mt-3 text-sm">{event.lugar} · {waiting === null ? "Consultando la fila…" : `${waiting} bebés en espera`}</p>}</section>
      {preview && <QueueNotice next={preview.proximo} previas={preview.previas} presenciales={preview.presenciales} />}
      {active ? <section className="space-y-4 rounded-xl border border-teal-300 bg-teal-50 p-6 dark:border-teal-800 dark:bg-teal-950"><p className="text-sm">Tu atención activa · {active.evento.nombre} · {originLabel(active.origen)}</p><h2 className="text-2xl font-semibold">Inscripción N.º {String(active.numero).padStart(3, "0")} · {active.bebe.nombre}</h2><p>Apoderado: {active.apoderado}</p><p>Fecha de nacimiento: {eventDate(active.bebe.fnac)}</p>{active.eventoId !== selected && <p className="text-sm">Esta atención corresponde a otro evento. Finalízala o devuélvela antes de llamar a otro bebé.</p>}<div className="flex flex-wrap gap-3"><Link href={`/evaluacion?atencion=${active.id}&reserva=${active.reservaId}`} className="rounded-lg bg-teal-700 px-5 py-3 text-white">Abrir formulario de craneometría</Link><button type="button" disabled={busy} onClick={() => release("devolver")} className="rounded-lg border px-4 py-3 disabled:opacity-50">Devolver a la fila</button><button type="button" disabled={busy} onClick={() => release("ausente")} className="rounded-lg border border-amber-600 px-4 py-3 text-amber-900 disabled:opacity-50 dark:text-amber-200">No respondió al llamado</button></div><p className="text-sm">El formulario carga los datos registrados. Guardarlo finaliza la atención. Si la familia no responde, márcala ausente. Devolver o marcar ausencia no guarda las mediciones que hayas escrito.</p></section> : <section className="space-y-4 rounded-xl border p-6"><h2 className="text-xl font-semibold">Llamar al siguiente bebé</h2><p>Se aplica la fila intercalada a las llegadas confirmadas. La reserva se comprueba al llamar para evitar asignaciones duplicadas.</p><button type="button" disabled={busy || !selected || (waiting === 0 && !uncertain)} onClick={call} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy ? "Procesando…" : uncertain ? "Reintentar el mismo llamado" : "Llamar al siguiente"}</button></section>}
      <div className="flex flex-wrap items-center gap-4"><button type="button" disabled={busy} onClick={() => { setError(""); void refresh() }} className="rounded-lg border px-4 py-2 disabled:opacity-50">Actualizar mi atención</button>{updated && <p className="text-xs text-gray-600 dark:text-gray-300">Última consulta: {updated} · Actualización cada 10 segundos.</p>}</div>
    </>}
  </main>
}
