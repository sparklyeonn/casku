"use client"
import { useRef, useState } from "react"
import type { FormEvent } from "react"
import type { EventSummary } from "@/lib/events/input"
const fields = (event: EventSummary) => ({ nombre: event.nombre, fecha: event.fecha, lugar: event.lugar, cupos: String(event.cupos) })
const inputClass = "mt-2 w-full rounded-lg border bg-white p-3 text-gray-900 dark:bg-gray-900 dark:text-gray-100"
async function read(response: Response) { const data = await response.json(); if (!response.ok) throw new Error(data.error || "No pudimos guardar el evento."); return data }
export function EventEditor({ event, disabled, onStart, onFinish, onSaved, onReloaded, onCancel }: { event: EventSummary; disabled: boolean; onStart: () => boolean; onFinish: () => void; onSaved: (event: EventSummary, changed: boolean) => void; onReloaded: (event: EventSummary) => void; onCancel: () => void }) {
  const [base, setBase] = useState(event), [form, setForm] = useState(() => fields(event))
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("")
  const operation = useRef(false)
  async function save(e: FormEvent) {
    e.preventDefault(); if (disabled || operation.current || !onStart()) return
    operation.current = true; setBusy(true); setError(""); setMessage("")
    try {
      const result = await read(await fetch(`/api/eventos/${base.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, cupos: Number(form.cupos), revision: base.revision }) }))
      onSaved(result.evento, result.actualizado)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar. Reintenta el mismo envío.") }
    finally { operation.current = false; setBusy(false); onFinish() }
  }
  async function reload() {
    if (disabled || operation.current || !onStart()) return
    operation.current = true; setBusy(true); setError(""); setMessage("")
    try {
      const result = await read(await fetch("/api/eventos", { cache: "no-store" }))
      const latest = (result.eventos as EventSummary[]).find(row => row.id === base.id)
      if (!latest) throw new Error("El evento ya no está disponible.")
      setBase(latest); setForm(fields(latest)); onReloaded(latest); setMessage("Datos actualizados. Los cambios sin guardar se descartaron.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos recargar el evento.") }
    finally { operation.current = false; setBusy(false); onFinish() }
  }
  function change(key: keyof typeof form, value: string) { setForm(previous => ({ ...previous, [key]: value })) }
  const dateLocked = base.fechaProtegida || base.inscritos > 0 || base.inscripcionesAbiertas
  return <section aria-labelledby="edit-event-title" className="space-y-5 rounded-2xl border border-teal-300 bg-white p-6 dark:border-teal-700 dark:bg-gray-900"><h2 id="edit-event-title" className="text-2xl font-semibold">Editar evento: {base.nombre}</h2>{error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
    <form onSubmit={save} className="space-y-5"><fieldset disabled={busy || disabled} className="grid gap-5 sm:grid-cols-2"><label className="block text-sm">Nombre<input required maxLength={120} value={form.nombre} onChange={e => change("nombre", e.target.value)} className={inputClass} /></label><label className="block text-sm">Fecha<input required type="date" min="1900-01-01" max="9999-12-31" value={form.fecha} onChange={e => change("fecha", e.target.value)} disabled={dateLocked} className={inputClass} /><span className="mt-2 block text-xs">{base.fechaProtegida || base.inscritos > 0 ? "La fecha está protegida porque hay inscripciones actuales o históricas." : base.inscripcionesAbiertas ? "Cierra las inscripciones y recarga los datos para cambiar la fecha." : "Puedes cambiarla mientras no existan inscripciones, por hoy o una fecha futura en Chile."}</span></label><label className="block text-sm">Lugar<input required maxLength={200} value={form.lugar} onChange={e => change("lugar", e.target.value)} className={inputClass} /></label><label className="block text-sm">Cupos totales<input required type="number" min={Math.max(1, base.inscritos)} max={100000} step={1} value={form.cupos} onChange={e => change("cupos", e.target.value)} className={inputClass} /><span className="mt-2 block text-xs">Al consultar había {base.inscritos} inscripciones. Se comprobarán los cupos nuevamente al guardar.</span></label></fieldset>
      <p className="text-sm text-gray-600 dark:text-gray-300">Las inscripciones conservan su número, QR, categoría, fila y evaluaciones. Las correcciones de nombre y lugar se verán en el portal; los correos de confirmación ya preparados y los resultados publicados conservan su versión original. Comunica los cambios a las familias por el canal acordado con Casku: guardar no envía avisos.</p>
      <div className="flex flex-wrap gap-3"><button disabled={busy || disabled} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy ? "Procesando…" : "Guardar cambios del evento"}</button><button type="button" disabled={busy || disabled} onClick={reload} className="rounded-lg border px-4 py-2 disabled:opacity-50">Descartar cambios y recargar datos</button><button type="button" disabled={busy || disabled} onClick={onCancel} className="rounded-lg border px-4 py-2 disabled:opacity-50">Cancelar edición</button></div>
    </form></section>
}
