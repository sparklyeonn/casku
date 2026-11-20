"use client"
import { useCallback, useEffect, useRef, useState } from "react"
type Status = { automatico?: boolean; avisosPendientes?: number; configurada: boolean; protegidos: number; ocupados: number; exceso: number; disponibles: number; bloqueada: boolean; sincronizadaAt: string | null; error: boolean; inscritos: number; cupos: number }
type Event = { id: string; nombre: string; fecha: string; lugar: string }
export function CalendlyProtection({ fecha, reception, evento }: { fecha: string; reception: boolean; evento?: Event }) {
  const [events, setEvents] = useState<Event[]>(evento ? [evento] : []), [eventId, setEventId] = useState(evento?.id || "")
  const [value, setValue] = useState<Status | null>(null), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const working = useRef(false), selected = useRef(eventId)
  const read = useCallback(async (sync: boolean, signal?: AbortSignal) => {
    if (!eventId || working.current) return
    working.current = true; setBusy(true); setError("")
    try {
      const response = await fetch(sync ? "/api/calendly/cupos" : `/api/calendly/cupos?eventoId=${eventId}`, sync ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventoId: eventId }), signal } : { cache: "no-store", signal })
      const next = await response.json()
      if (!response.ok) throw new Error(next.error || "No pudimos consultar la protección de cupos.")
      if (!signal?.aborted && selected.current === eventId) setValue(next)
    } catch (cause) { if (!signal?.aborted && selected.current === eventId) { setError(cause instanceof Error ? cause.message : "No pudimos consultar la protección."); if (sync) setValue(previous => previous ? { ...previous, bloqueada: true, error: true } : previous) } }
    finally { working.current = false; if (!signal?.aborted) setBusy(false) }
  }, [eventId])
  useEffect(() => {
    const controller = new AbortController()
    if (evento) return () => controller.abort()
    fetch(reception ? "/api/recepcion/eventos" : "/api/eventos", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No pudimos consultar los eventos.")
      if (!controller.signal.aborted) setEvents(data.eventos.filter((row: Event) => row.fecha === fecha))
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Eventos no disponibles.") })
    return () => controller.abort()
  }, [fecha, reception, evento])
  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void read(false, controller.signal) })
    return () => controller.abort()
  }, [read])
  useEffect(() => {
    if (!value?.configurada) return
    const interval = setInterval(() => { if (!document.hidden) void read(!value.automatico) }, 120000)
    return () => clearInterval(interval)
  }, [value?.configurada, value?.automatico, read])
  return <section aria-label="Protección anticipada de cupos" className="space-y-4 rounded-2xl border p-5">
    <h2 className="text-xl font-semibold">Vincular reservas de Calendly{evento ? ` · ${evento.nombre}` : ""}</h2>
    <p>Protege las citas del {fecha} antes de recibir familias sin reserva. Se consultan todas las páginas de ese día; no se crean fichas de bebés ni se envían correos.</p>
    <label className="block">Jornada de Casku<select aria-label="Jornada de Casku" className="mt-2 w-full rounded-lg border p-3" disabled={busy || !!evento} value={eventId} onChange={event => { selected.current = event.target.value; setEventId(event.target.value); setValue(null); setConfirmed(false); setError("") }}><option value="">Selecciona el evento del mismo día</option>{events.map(event => <option key={event.id} value={event.id}>{event.nombre} · {event.lugar}</option>)}</select></label>
    {value && <div role="status"><p>Cupos de Calendly pendientes de llegada: {value.protegidos} · Inscripciones: {value.inscritos} · Cupos libres: {value.disponibles}.</p>{value.sincronizadaAt && <p>Última protección: {new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }).format(new Date(value.sincronizadaAt))}.</p>}{value.bloqueada && <p>Actualiza Calendly antes de admitir nuevas familias sin reserva. Los cupos protegidos se conservan.</p>}{value.exceso > 0 && <p>Las reservas e inscripciones superan la capacidad en {value.exceso} cupos. Administración debe revisar los cupos antes de admitir más familias.</p>}</div>}
    {eventId && !value?.configurada && <label className="flex items-start gap-3"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Confirmo que el evento seleccionado corresponde a las citas de Expo Bebé de este día. Cada fecha solo puede vincularse a una jornada.</span></label>}
    {error && <p role="alert">{error}</p>}
    <button type="button" className="rounded-full border px-5 py-3 disabled:opacity-50" disabled={busy || !eventId || (!value?.configurada && !confirmed)} onClick={() => void read(true)}>{busy ? "Comprobando todos los cupos…" : value?.configurada ? "Actualizar protección de cupos" : "Vincular reservas y proteger cupos"}</button>
    <p className="text-sm">{value?.automatico ? "Actualización automática por avisos de Calendly: puedes cerrar este panel. Los avisos pendientes bloquean temporalmente nuevos cupos sin reserva hasta completar su verificación." : "Sin conexión automática verificada: se actualiza cada dos minutos mientras este panel esté abierto y visible. Tras cinco minutos sin una consulta completa correcta, se detienen las nuevas inscripciones sin reserva."} Las llegadas con un cupo ya protegido se comprueban directamente en Calendly.</p>
    <p className="text-sm">No se liberan cupos solo porque una reserva no aparezca en una página. Las cancelaciones confirmadas actualizan los cupos reservados; las inscripciones y atenciones existentes conservan su historial.</p>
  </section>
}
