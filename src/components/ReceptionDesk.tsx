"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { eventDate } from "./PublicEvents"
import { ReceptionQrScanner } from "./ReceptionQrScanner"
import { parseLookup } from "@/lib/reception/input"
import type { EventSummary } from "@/lib/events/input"

type Registration = { id: string; numero: number; eventoId: string; bebe: string; apoderado: string; llegada: { orden: number; llegadaAt: string; estado: "EN_ESPERA" | "EN_ATENCION" | "ATENDIDO" | "AUSENTE" } | null }
type Queue = { total: number; inscripciones: Registration[]; siguiente: number | null; actualizadaAt: string }
const inputClass = "mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
const number = (value: number) => String(value).padStart(3, "0")
const time = (value: string) => new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }).format(new Date(value))
const status = { EN_ESPERA: "En espera", EN_ATENCION: "En atención", ATENDIDO: "Atención finalizada", AUSENTE: "Ausente" }
async function responseJson(response: Response) {
  if (response.status === 401 || response.status === 403) {
    window.location.replace("/login")
    throw new Error("Tu sesión no está disponible. Vuelve a ingresar como recepción.")
  }
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "No pudimos completar la operación.")
  return data
}
const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

export function ReceptionDesk() {
  const [events, setEvents] = useState<EventSummary[]>([]), [selected, setSelected] = useState("")
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const selecting = useRef(false)
  const load = useCallback((signal?: AbortSignal) => fetch("/api/recepcion/eventos", { cache: "no-store", signal })
    .then(responseJson).then(data => {
      if (!signal?.aborted) { setEvents(data.eventos); setSelected(data.seleccionadoId || "") }
    }).catch(cause => { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "No pudimos cargar los eventos.") })
    .finally(() => { if (!signal?.aborted) setLoading(false) }), [])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  async function select(eventoId: string) {
    if (selecting.current) return
    selecting.current = true; setBusy(true); setError("")
    try { await responseJson(await fetch("/api/recepcion/eventos", post({ eventoId }))); setSelected(eventoId) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos seleccionar el evento.") }
    finally { selecting.current = false; setBusy(false) }
  }
  const event = events.find(item => item.id === selected)
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-8"><div><p className="text-sm text-teal-700 dark:text-teal-300">Recepción</p><h1 className="mt-2 text-3xl font-semibold">Llegadas y fila de atención</h1><p className="mt-3 text-gray-600 dark:text-gray-300">Busca el comprobante, verifica con la familia a quién corresponde y confirma su llegada.</p></div>
    {error && <div role="alert" className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-100">{error}{events.length === 0 && <button type="button" onClick={() => { setLoading(true); setError(""); void load() }} className="ml-3 underline">Reintentar</button>}</div>}
    {loading ? <p role="status">Cargando eventos…</p> : events.length === 0 ? <p className="rounded-xl border p-5">Todavía no hay eventos. Administración debe crear uno para comenzar.</p> : <>
      <section className="rounded-xl border p-5"><label className="block font-medium">Evento de trabajo<select className={inputClass} value={selected} disabled={busy} onChange={e => select(e.target.value)}><option value="" disabled>Selecciona el evento</option>{events.map(item => <option key={item.id} value={item.id}>{item.nombre} · {eventDate(item.fecha)}</option>)}</select></label>{event && <p className="mt-3 text-sm">{event.lugar} · {event.inscritos} inscripciones · {event.inscripcionesAbiertas ? "Inscripciones abiertas" : "Inscripciones cerradas; puedes recibir a las familias ya inscritas"}</p>}</section>
      {event ? <div className={busy ? "pointer-events-none opacity-50" : ""} inert={busy}><EventReception key={event.id} event={event} /></div> : <p>Selecciona un evento para buscar sus inscripciones y consultar su fila.</p>}
    </>}
  </main>
}

function EventReception({ event }: { event: EventSummary }) {
  const [query, setQuery] = useState(""), [found, setFound] = useState<Registration | null>(null)
  const [scanning, setScanning] = useState(false), [busy, setBusy] = useState<"search" | "arrival" | null>(null)
  const [error, setError] = useState(""), [message, setMessage] = useState("")
  const [queue, setQueue] = useState<Queue | null>(null), [queueError, setQueueError] = useState("")
  const [queueLoading, setQueueLoading] = useState(true), [cursor, setCursor] = useState(0), [history, setHistory] = useState<number[]>([])
  const [now, setNow] = useState<number | null>(null)
  const operation = useRef(false), queueBusy = useRef(false), mounted = useRef(false), queryInput = useRef<HTMLInputElement>(null), queueRequest = useRef(0)
  const loadQueue = useCallback((signal?: AbortSignal) => {
    if (queueBusy.current) return Promise.resolve()
    queueBusy.current = true
    const requestId = ++queueRequest.current
    return fetch(`/api/recepcion/fila?eventoId=${event.id}&despues=${cursor}`, { cache: "no-store", signal })
      .then(responseJson).then(data => {
        if (mounted.current && !signal?.aborted) { setQueue(data); setQueueError(""); setNow(Date.now()) }
      }).catch(cause => { if (mounted.current && !signal?.aborted) setQueueError(cause instanceof Error ? cause.message : "No pudimos actualizar la fila.") })
      .finally(() => { if (requestId === queueRequest.current) { queueBusy.current = false; if (mounted.current) setQueueLoading(false) } })
  }, [event.id, cursor])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    queueBusy.current = false; queueRequest.current++
    void loadQueue(controller.signal)
    const interval = setInterval(() => { setNow(Date.now()); if (!document.hidden) void loadQueue(controller.signal) }, 10000)
    return () => { controller.abort(); clearInterval(interval) }
  }, [loadQueue])
  async function search(value: string) {
    if (operation.current) return
    operation.current = true; setBusy("search"); setFound(null); setError(""); setMessage(""); setScanning(false)
    try {
      parseLookup(value)
      const data = await responseJson(await fetch("/api/recepcion/buscar", post({ eventoId: event.id, consulta: value })))
      if (mounted.current) setFound(data.inscripcion)
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "No pudimos buscar la inscripción.") }
    finally { operation.current = false; if (mounted.current) setBusy(null) }
  }
  async function confirm() {
    if (!found || operation.current) return
    operation.current = true; setBusy("arrival"); setError(""); setMessage("")
    try {
      const data = await responseJson(await fetch("/api/recepcion/llegadas", post({ eventoId: event.id, inscripcionId: found.id })))
      if (mounted.current) {
        setFound(data.inscripcion)
        setMessage(data.nueva ? `Llegada confirmada. La inscripción N.º ${number(data.inscripcion.numero)} ya está en la fila.` : "Esta llegada ya estaba confirmada. Conservamos su orden original.")
        await loadQueue()
      }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "No pudimos confirmar la llegada. Puedes reintentar.") }
    finally { operation.current = false; if (mounted.current) setBusy(null) }
  }
  function submit(e: FormEvent) { e.preventDefault(); void search(query) }
  return <div className="grid items-start gap-6 lg:grid-cols-2">
    <section className="space-y-5 rounded-xl border p-5"><h2 className="text-xl font-semibold">Recibir a una familia</h2><form onSubmit={submit} className="space-y-3"><label className="block">Número de inscripción o contenido del QR<input ref={queryInput} value={query} onChange={e => { setQuery(e.target.value); setFound(null); setMessage(""); setError("") }} disabled={busy !== null} maxLength={100} autoComplete="off" placeholder="Ej.: 010" className={inputClass} required /></label><div className="flex flex-wrap gap-3"><button disabled={busy !== null} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy === "search" ? "Buscando…" : "Buscar inscripción"}</button><button type="button" disabled={busy !== null || scanning} onClick={() => { setFound(null); setError(""); setMessage(""); setScanning(true) }} className="rounded-lg border px-4 py-3 disabled:opacity-50">Leer QR con cámara</button></div></form>
      <p className="text-sm text-gray-600 dark:text-gray-300">También puedes usar un lector QR conectado al equipo: coloca el cursor en el campo y escanea.</p>
      {scanning && <ReceptionQrScanner onClose={() => setScanning(false)} onCode={code => { setQuery(code); void search(code) }} />}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}{message && <p role="status" className="rounded-lg bg-teal-50 p-4 text-teal-900 dark:bg-teal-950 dark:text-teal-100">{message}</p>}
      {found && <article className="space-y-4 rounded-xl bg-gray-50 p-5 dark:bg-gray-900"><p className="text-sm">Inscripción N.º <strong className="text-3xl">{number(found.numero)}</strong></p><h3 className="break-words text-xl font-semibold">{found.bebe}</h3><p className="break-words">Apoderado: {found.apoderado}</p><p className="text-sm">Evento: {event.nombre}</p>{found.llegada ? <p className="font-medium text-teal-700 dark:text-teal-300">{status[found.llegada.estado]} · Llegada registrada a las {time(found.llegada.llegadaAt)} · Orden de llegada {found.llegada.orden}</p> : <><p>Confirma con la familia el nombre del bebé antes de agregarlo a la fila.</p><button type="button" disabled={busy !== null} onClick={confirm} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy === "arrival" ? "Confirmando…" : "Confirmar llegada y agregar a la fila"}</button></>}<button type="button" disabled={busy !== null} onClick={() => { setFound(null); setQuery(""); setMessage(""); queryInput.current?.focus() }} className="block rounded-lg border px-4 py-2 disabled:opacity-50">Buscar otra inscripción</button></article>}
    </section>
    <section className="space-y-4 rounded-xl border p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Bebés en espera{queue ? ` · ${queue.total}` : ""}</h2><p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Ordenadas por llegada confirmada.</p></div><button type="button" disabled={queueLoading} onClick={() => { setQueueLoading(true); void loadQueue() }} className="rounded-lg border px-3 py-2 disabled:opacity-50">{queueLoading ? "Actualizando…" : "Actualizar"}</button></div>
      {queueError && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100">{queueError} La lista puede estar desactualizada.</p>}
      {!queue && !queueError && <p role="status">Consultando la fila…</p>}
      {queue && <>{queue.inscripciones.length === 0 ? <p>{cursor === 0 ? "Todavía no hay familias en espera." : "No hay más familias en esta página. Vuelve al inicio de la fila."}</p> : <ol className="divide-y">{queue.inscripciones.map(row => <li key={row.id} className="flex gap-4 py-4"><div className="min-w-16"><p className="text-xs text-gray-600 dark:text-gray-300">Inscripción</p><p className="text-2xl font-semibold">{number(row.numero)}</p></div><div className="min-w-0"><h3 className="break-words font-semibold">{row.bebe}</h3><p className="break-words text-sm">{row.apoderado}</p><p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Llegada {time(row.llegada!.llegadaAt)} · Orden {row.llegada!.orden}{now !== null && ` · ${Math.max(0, Math.floor((now - Date.parse(row.llegada!.llegadaAt)) / 60000))} min de espera`}</p></div></li>)}</ol>}<div className="flex flex-wrap gap-3">{cursor > 0 && <button disabled={queueLoading} type="button" onClick={() => { setQueue(null); setQueueLoading(true); setCursor(history.at(-1) || 0); setHistory(previous => previous.slice(0, -1)) }} className="rounded-lg border px-3 py-2">Anterior</button>}{queue.siguiente !== null && <button disabled={queueLoading} type="button" onClick={() => { setQueue(null); setQueueLoading(true); setHistory(previous => [...previous, cursor]); setCursor(queue.siguiente!) }} className="rounded-lg border px-3 py-2">Siguientes familias</button>}</div><p className="text-xs text-gray-600 dark:text-gray-300">Última actualización: {time(queue.actualizadaAt)}. Se consulta cada 10 segundos.</p></>}
      <p className="border-t pt-4 text-sm text-gray-600 dark:text-gray-300">El número identifica la inscripción. El llamado de pacientes y las prioridades de atención se incorporarán en la siguiente etapa.</p>
    </section>
  </div>
}
