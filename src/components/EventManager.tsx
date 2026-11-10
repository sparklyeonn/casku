"use client"

import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import type { EventSummary } from "@/lib/events/input"
import { EventOverview } from "./EventOverview"
import { EventEditor } from "./EventEditor"

type EventsState = { eventos: EventSummary[]; seleccionadoId: string | null }
const emptyForm = { nombre: "", fecha: "", lugar: "", cupos: "" }
const inputClass = "mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"

function showDate(date: string) {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))
}
async function responseData(response: Response) {
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "No pudimos completar la operación.")
  return data
}

export function EventManager() {
  const [data, setData] = useState<EventsState>({ eventos: [], seleccionadoId: null })
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<EventSummary | null>(null)
  const [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState(""), [success, setSuccess] = useState("")
  const creationId = useRef<string | null>(null)
  const inFlight = useRef(false)
  const selected = data.eventos.find(event => event.id === data.seleccionadoId)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/eventos", { cache: "no-store", signal: controller.signal })
      .then(responseData).then(value => { setData(value); setLoaded(true) })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos cargar los eventos.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  async function reload() {
    if (inFlight.current) return
    inFlight.current = true; setLoading(true); setError(""); setSuccess("")
    try { setData(await responseData(await fetch("/api/eventos", { cache: "no-store" }))); setLoaded(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cargar los eventos.") }
    finally { setLoading(false); inFlight.current = false }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true; setBusy("create"); setError(""); setSuccess("")
    try {
      creationId.current ??= crypto.randomUUID()
      const value = await responseData(await fetch("/api/eventos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, cupos: Number(form.cupos), id: creationId.current }),
      }))
      setData(previous => ({ eventos: [value.evento, ...previous.eventos.filter(e => e.id !== value.evento.id)].sort((a, b) => b.fecha.localeCompare(a.fecha)), seleccionadoId: value.seleccionadoId }))
      setLoaded(true); setForm(emptyForm); creationId.current = null
      setSuccess(`“${value.evento.nombre}” se creó y quedó seleccionado para tu cuenta.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos crear el evento.") }
    finally { setBusy(null); inFlight.current = false }
  }

  async function select(event: EventSummary) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(event.id); setError(""); setSuccess("")
    try {
      const value = await responseData(await fetch("/api/eventos/seleccion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventoId: event.id }) }))
      setData(previous => ({ ...previous, seleccionadoId: value.seleccionadoId }))
      setSuccess(`Ahora estás trabajando en “${value.evento.nombre}”.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos seleccionar el evento.") }
    finally { setBusy(null); inFlight.current = false }
  }

  async function toggleRegistrations(event: EventSummary) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(event.id); setError(""); setSuccess("")
    try {
      const value = await responseData(await fetch(`/api/eventos/${event.id}/inscripciones`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ abiertas: !event.inscripcionesAbiertas }) }))
      setData(previous => ({ ...previous, eventos: previous.eventos.map(row => row.id === event.id ? value.evento : row) }))
      setSuccess(value.evento.inscripcionesAbiertas ? "Inscripciones abiertas. El evento ya aparece para las familias con cupos disponibles." : "Inscripciones cerradas. Los comprobantes existentes se conservan.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos actualizar las inscripciones.") }
    finally { setBusy(null); inFlight.current = false }
  }

  function change(field: keyof typeof form, value: string) {
    creationId.current = null
    setForm(previous => ({ ...previous, [field]: value }))
  }

  const disabled = loading || busy !== null
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 text-gray-900 dark:text-gray-100">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-teal-700 dark:text-teal-300">Administración Casku</p><h1 className="mt-2 text-3xl font-semibold">Eventos</h1><p className="mt-3 text-gray-600 dark:text-gray-300">Crea un evento y elige con cuál vas a trabajar.</p></div><button type="button" onClick={reload} disabled={disabled} className="rounded-lg border border-gray-300 px-4 py-2.5 disabled:opacity-50 dark:border-gray-600">Actualizar lista</button></div>
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-100">{error}</div>}
    <p role="status" aria-live="polite" className="text-sm text-teal-800 dark:text-teal-200">{success}</p>
    <section aria-labelledby="selected-event-title" className="rounded-2xl border border-teal-200 bg-teal-50 p-6 dark:border-teal-800 dark:bg-teal-950">
      <h2 id="selected-event-title" className="text-sm font-medium text-teal-800 dark:text-teal-200">Tu evento de trabajo</h2>
      {loading ? <p className="mt-3">Cargando eventos…</p> : selected ? <><p className="mt-2 break-words text-2xl font-semibold">{selected.nombre}</p><p className="mt-3 break-words text-gray-700 dark:text-gray-200">{showDate(selected.fecha)} · {selected.lugar}</p><p className="mt-2 font-medium">{selected.cupos.toLocaleString("es-CL")} cupos totales</p></> : <p className="mt-3">{loaded ? "Todavía no seleccionaste un evento. Crea uno o elígelo de la lista." : "No se pudo consultar tu selección. Actualiza la lista para intentar nuevamente."}</p>}
      {selected && <p className="mt-3 text-sm font-medium">Inscripciones {selected.inscripcionesAbiertas ? "abiertas" : "cerradas"}</p>}
      <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">La selección se guarda para tu cuenta y no cambia el evento de otros administradores.</p>
    </section>
    {selected && <EventOverview key={`${selected.id}:${selected.revision}`} eventoId={selected.id} />}
    {editing && <EventEditor key={editing.id} event={editing} disabled={disabled} onStart={() => { if (inFlight.current) return false; inFlight.current = true; setBusy("edit"); return true }} onFinish={() => { inFlight.current = false; setBusy(null) }} onCancel={() => setEditing(null)} onReloaded={event => setData(previous => ({ ...previous, eventos: previous.eventos.map(row => row.id === event.id ? event : row).sort((a, b) => b.fecha.localeCompare(a.fecha)) }))} onSaved={(event, changed) => { setData(previous => ({ ...previous, eventos: previous.eventos.map(row => row.id === event.id ? event : row).sort((a, b) => b.fecha.localeCompare(a.fecha)) })); setEditing(null); setError(""); setSuccess(changed ? `Cambios guardados en “${event.nombre}”. Las inscripciones existentes se conservaron.` : "El evento ya tenía estos datos. No se duplicaron cambios.") }} />}
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <section aria-labelledby="events-list-title" className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <h2 id="events-list-title" className="text-xl font-semibold">Eventos creados {loaded && <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({data.eventos.length})</span>}</h2>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Los inscritos de esta lista corresponden a su última actualización. El resumen del evento seleccionado se actualiza automáticamente.</p>
        {loading ? <p className="py-8 text-gray-600 dark:text-gray-300">Consultando eventos…</p> : !loaded ? <p className="py-8 text-gray-600 dark:text-gray-300">La lista no está disponible. Puedes volver a cargarla.</p> : data.eventos.length === 0 ? <div className="py-10"><h3 className="font-medium">Aquí comenzará tu próximo evento</h3><p className="mt-2 text-gray-600 dark:text-gray-300">Completa el formulario para crear el primero.</p></div> : <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-700">{data.eventos.map(event => <li key={event.id} className="space-y-3 py-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 break-words text-lg font-medium">{event.nombre}</h3>{data.seleccionadoId === event.id && <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-medium text-teal-800 dark:bg-teal-900 dark:text-teal-100">Seleccionado</span>}</div>
          <p className="break-words text-sm text-gray-600 dark:text-gray-300">{showDate(event.fecha)} · {event.lugar}</p><p className="text-sm">{event.inscritos} inscritos / {event.cupos.toLocaleString("es-CL")} cupos · Inscripciones {event.inscripcionesAbiertas ? "abiertas" : "cerradas"}</p>
          {data.seleccionadoId !== event.id && <button type="button" disabled={disabled} onClick={() => select(event)} className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-medium text-teal-800 disabled:opacity-50 dark:border-teal-400 dark:text-teal-200">{busy === event.id ? "Seleccionando…" : "Trabajar en este evento"}</button>}
          <button type="button" disabled={disabled || editing !== null} onClick={() => { if (inFlight.current) return; setEditing(event); setError(""); setSuccess("") }} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Editar evento</button>
          <button type="button" disabled={disabled} onClick={() => toggleRegistrations(event)} className="ml-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{busy === event.id ? "Actualizando…" : event.inscripcionesAbiertas ? "Cerrar inscripciones" : "Abrir inscripciones"}</button>
        </li>)}</ul>}
      </section>
      <section aria-labelledby="new-event-title" className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <h2 id="new-event-title" className="text-xl font-semibold">Crear evento</h2><p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Al crearlo, quedará seleccionado como tu evento de trabajo.</p>
        <form onSubmit={create} className="mt-5 space-y-5"><fieldset disabled={disabled || !loaded} className="space-y-5 disabled:opacity-60">
          <label className="block text-sm font-medium">Nombre del evento<input name="nombre" className={inputClass} value={form.nombre} onChange={e => change("nombre", e.target.value)} maxLength={120} required placeholder="Ej.: Expo Bebé · Santiago" autoComplete="off" /></label>
          <label className="block text-sm font-medium">Fecha<input name="fecha" type="date" className={inputClass} value={form.fecha} onChange={e => change("fecha", e.target.value)} min="1900-01-01" max="9999-12-31" required /></label>
          <label className="block text-sm font-medium">Lugar<input name="lugar" className={inputClass} value={form.lugar} onChange={e => change("lugar", e.target.value)} maxLength={200} required placeholder="Recinto y ciudad" autoComplete="off" /></label>
          <label className="block text-sm font-medium">Cupos totales<input name="cupos" type="number" className={inputClass} value={form.cupos} onChange={e => change("cupos", e.target.value)} min={1} max={100000} step={1} required placeholder="Ej.: 100" /></label>
          <button type="submit" className="w-full rounded-lg bg-teal-700 px-4 py-3 font-medium text-white hover:bg-teal-800">{busy === "create" ? "Creando evento…" : "Crear y seleccionar evento"}</button>
        </fieldset></form>
      </section>
    </div>
    <p className="text-sm text-gray-600 dark:text-gray-300">Abre las inscripciones para que el evento aparezca en el formulario público. Seleccionarlo como evento de trabajo no lo abre automáticamente ni inicia la atención.</p>
  </main>
}
