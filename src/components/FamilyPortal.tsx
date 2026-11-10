"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import Image from "next/image"
import { CancelRegistration } from "./CancelRegistration"
import { FamilyLinking } from "./FamilyLinking"
import { originLabel, type Origin } from "@/lib/queue/policy"
import { useSearchParams } from "next/navigation"
import { eventDate, type PublicEvent } from "./PublicEvents"

type Receipt = { cancelacion: { motivo: string; createdAt: string } | null; origen: Origin; id: string; numero: number; evento: { id: string; nombre: string; fecha: string; lugar: string }; bebe: { id: string; nombre: string }; correo: { estado: string; reintentarDesde: string | null } }
type FamilyData = { perfil: { nombre: string; telefono: string; rut: string; correo: string; revisionDatos: number }; bebes: Array<{ id: string; nombre: string; fechaNacimiento: string }>; inscripciones: Receipt[] }
const blank = { bebeId: "", nombreBebe: "", fechaNacimiento: "", rutBebe: "", nombreApoderado: "", rutApoderado: "", telefono: "" }
const field = "mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900 outline-none focus:border-teal-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
async function jsonResponse(response: Response) { const data = await response.json(); if (!response.ok) throw new Error(data.error || "No pudimos completar la operación."); return data }
async function loadFamily(signal?: AbortSignal): Promise<{ family: FamilyData; events: PublicEvent[] }> {
  const [family, available] = await Promise.all([fetch("/api/familias/inscripciones", { cache: "no-store", signal }).then(jsonResponse), fetch("/api/eventos/disponibles", { cache: "no-store", signal }).then(jsonResponse)])
  return { family, events: available.eventos }
}
export function FamilyPortal() {
  const requestedEvent = useSearchParams().get("evento") || ""
  const [data, setData] = useState<FamilyData | null>(null), [events, setEvents] = useState<PublicEvent[]>([])
  const [eventoId, setEventoId] = useState(""), [form, setForm] = useState(blank)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState(""), [message, setMessage] = useState("")
  const profileRevision = useRef<number | null>(null), creationId = useRef<string | null>(null), inFlight = useRef(false)
  const apply = useCallback((value: { family: FamilyData; events: PublicEvent[] }) => {
    const changedProfile = profileRevision.current !== null && profileRevision.current !== value.family.perfil.revisionDatos
    profileRevision.current = value.family.perfil.revisionDatos
    if (changedProfile) creationId.current = null
    setData(value.family); setEvents(value.events)
    setEventoId(previous => value.events.some(e => e.id === previous) ? previous : value.events.some(e => e.id === requestedEvent) ? requestedEvent : "")
    setForm(previous => previous.nombreApoderado && !changedProfile ? previous : { ...(changedProfile ? blank : previous), nombreApoderado: value.family.perfil.nombre, rutApoderado: value.family.perfil.rut, telefono: value.family.perfil.telefono })
  }, [requestedEvent])
  useEffect(() => {
    const controller = new AbortController()
    loadFamily(controller.signal).then(apply).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos cargar tus inscripciones.") }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [apply])
  async function refresh() {
    if (inFlight.current) return
    inFlight.current = true; setLoading(true); setError("")
    try { apply(await loadFamily()) } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cargar tus datos.") }
    finally { setLoading(false); inFlight.current = false }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return
    inFlight.current = true; setBusy("register"); setError(""); setMessage("")
    try {
      creationId.current ??= crypto.randomUUID()
      const { inscripcion } = await jsonResponse(await fetch("/api/familias/inscripciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, revisionApoderado: data?.perfil.revisionDatos, eventoId, id: creationId.current }) })) as { inscripcion: Receipt }
      // Primero conservamos el comprobante, aunque falle la actualización de la lista.
      setData(previous => previous ? { ...previous, inscripciones: [inscripcion, ...previous.inscripciones.filter(row => row.id !== inscripcion.id)] } : previous)
      creationId.current = null
      setForm(previous => ({ ...blank, nombreApoderado: previous.nombreApoderado, rutApoderado: previous.rutApoderado, telefono: previous.telefono }))
      setMessage(inscripcion.correo.estado === "ENVIADO" ? `Inscripción confirmada: N.º ${String(inscripcion.numero).padStart(3, "0")}. Enviamos el comprobante a tu correo.` : `Inscripción confirmada: N.º ${String(inscripcion.numero).padStart(3, "0")}. El correo está pendiente; tu número y QR ya están disponibles aquí.`)
      try { apply(await loadFamily()) } catch { /* El comprobante recién confirmado sigue visible. */ }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos completar la inscripción.") }
    finally { setBusy(null); inFlight.current = false }
  }
  async function retry(receipt: Receipt) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(receipt.id); setError(""); setMessage("")
    try {
      const result = await jsonResponse(await fetch(`/api/familias/inscripciones/${receipt.id}/correo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))
      setData(previous => previous ? { ...previous, inscripciones: previous.inscripciones.map(row => row.id === receipt.id ? { ...row, correo: result } : row) } : previous)
      setMessage(result.estado === "ENVIADO" ? "Confirmación enviada. Revisa tu correo y la carpeta de spam." : "Tu inscripción sigue confirmada. El envío continúa pendiente; espera al menos un minuto para reintentar.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos reintentar el envío.") }
    finally { setBusy(null); inFlight.current = false }
  }
  function change(key: keyof typeof blank, value: string) { creationId.current = null; setForm(previous => ({ ...previous, [key]: value })) }
  const disabled = loading || busy !== null
  const selected = events.find(event => event.id === eventoId)
  return <main className="mx-auto max-w-5xl space-y-7 px-5 py-9">
    <div className="flex flex-wrap justify-between gap-4"><div><p className="text-sm text-teal-700 dark:text-teal-300">Espacio familiar</p><h1 className="mt-2 text-3xl font-semibold">Mis inscripciones</h1><p className="mt-3 text-gray-600 dark:text-gray-300">Tus bebés, sus números y sus comprobantes para los eventos de Casku.</p></div><button type="button" disabled={disabled} onClick={refresh} className="self-start rounded-lg border px-4 py-2 disabled:opacity-50">Actualizar</button></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-teal-50 p-4 text-teal-900 dark:bg-teal-950 dark:text-teal-100">{message}</p>}
    <FamilyLinking disabled={disabled} onStart={() => { if (inFlight.current) return false; inFlight.current = true; setBusy("link"); return true }} onFinish={() => { inFlight.current = false; setBusy(null) }} onLinked={async () => { apply(await loadFamily()) }} />
    {loading ? <p role="status">Cargando tus datos…</p> : data && <>
      {data.inscripciones.length === 0 ? <p className="rounded-xl border p-5">Todavía no tienes inscripciones. Elige un evento y registra a tu bebé.</p> : <ul className="grid items-start gap-5 md:grid-cols-2">{data.inscripciones.map(receipt => <li key={receipt.id} className="space-y-4 rounded-2xl border border-teal-200 bg-teal-50 p-6 dark:border-teal-800 dark:bg-teal-950"><p className="text-sm text-teal-800 dark:text-teal-200">{receipt.cancelacion ? "Inscripción cancelada" : "Inscripción confirmada"} · {receipt.evento.nombre} · {originLabel(receipt.origen)}</p><h2 className="break-words text-2xl font-semibold">{receipt.bebe.nombre}</h2><p className="text-sm">{eventDate(receipt.evento.fecha)} · {receipt.evento.lugar}</p><div className="flex flex-wrap items-center justify-center gap-5 rounded-xl bg-white p-4 text-gray-900"><div className="text-center"><p className="text-sm">Número</p><p className="text-5xl font-semibold">{String(receipt.numero).padStart(3, "0")}</p></div>{!receipt.cancelacion && <Image unoptimized src={`/api/familias/inscripciones/${receipt.id}/qr`} alt={`QR de la inscripción ${receipt.numero}`} width={180} height={180} />}</div><p className="text-sm">{receipt.cancelacion ? "El número se conserva como historial. Esta reserva ya no permite ingresar a la fila." : "Presenta este QR o indica tu número al llegar a recepción. No es un turno ni reserva una hora."}</p><p className="text-sm">{receipt.cancelacion ? "Cupo liberado; la confirmación de esta reserva no se reenvía." : receipt.correo.estado === "ENVIADO" ? "Confirmación enviada por correo." : receipt.correo.estado === "ENVIANDO" ? "Envío de confirmación en curso." : "Tu inscripción está guardada. El correo de confirmación está pendiente."}</p>{!receipt.cancelacion && receipt.correo.estado !== "ENVIADO" && <button type="button" disabled={disabled} onClick={() => retry(receipt)} className="rounded-lg border border-teal-700 px-4 py-2 text-sm disabled:opacity-50 dark:border-teal-300">{busy === receipt.id ? "Reintentando…" : "Reintentar correo"}</button>}<CancelRegistration key={`cancel:${receipt.id}`} eventoId={receipt.evento.id} inscripcionId={receipt.id} disabled={disabled} onStart={() => { if (inFlight.current) return false; inFlight.current = true; setBusy(`cancel:${receipt.id}`); return true }} onFinish={() => { inFlight.current = false; setBusy(null) }} onCancelled={async () => { apply(await loadFamily()) }} /></li>)}</ul>}
      <section className="rounded-2xl border p-6"><h2 className="text-2xl font-semibold">Inscribir a un bebé</h2>{events.length === 0 ? <p className="mt-4 text-gray-600 dark:text-gray-300">No hay eventos con inscripciones abiertas y cupos disponibles. Tus comprobantes anteriores siguen disponibles arriba.</p> : <form onSubmit={submit} className="mt-6 space-y-6"><fieldset disabled={disabled} className="space-y-6 disabled:opacity-60">
        <label className="block font-medium">Evento<select className={field} value={eventoId} onChange={e => { creationId.current = null; setEventoId(e.target.value) }} required><option value="">Elige un evento</option>{events.map(event => <option key={event.id} value={event.id}>{event.nombre} · {eventDate(event.fecha)} · {event.disponibles} cupos</option>)}</select></label>
        {selected && <p className="text-sm text-gray-600 dark:text-gray-300">Lugar: {selected.lugar}</p>}
        {data.bebes.length > 0 && <label className="block font-medium">Bebé<select value={form.bebeId} onChange={e => change("bebeId", e.target.value)} className={field}><option value="">Registrar otro bebé</option>{data.bebes.map(baby => <option key={baby.id} value={baby.id}>{baby.nombre} · {baby.fechaNacimiento}</option>)}</select></label>}
        {!form.bebeId && <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Nombre completo del bebé<input className={field} value={form.nombreBebe} onChange={e => change("nombreBebe", e.target.value)} maxLength={120} autoComplete="off" required /></label><label className="block text-sm font-medium">Fecha de nacimiento<input type="date" className={field} value={form.fechaNacimiento} onChange={e => change("fechaNacimiento", e.target.value)} min="1900-01-01" autoComplete="off" required /></label><label className="block text-sm font-medium sm:col-span-2">RUT del bebé · Opcional si aún no tiene<input className={field} value={form.rutBebe} onChange={e => change("rutBebe", e.target.value)} maxLength={20} placeholder="Sin puntos, con guion" autoComplete="off" /></label></div>}
        <div className="grid gap-5 border-t pt-6 sm:grid-cols-2"><label className="block text-sm font-medium">Nombre del apoderado<input className={field} value={form.nombreApoderado} onChange={e => change("nombreApoderado", e.target.value)} maxLength={120} autoComplete="name" required /></label><label className="block text-sm font-medium">Correo verificado<input className={field} value={data.perfil.correo} readOnly type="email" /></label><label className="block text-sm font-medium">Teléfono · Opcional<input className={field} value={form.telefono} onChange={e => change("telefono", e.target.value)} type="tel" maxLength={25} autoComplete="tel" /></label><label className="block text-sm font-medium">RUT del apoderado · Opcional<input className={field} value={form.rutApoderado} onChange={e => change("rutApoderado", e.target.value)} maxLength={20} placeholder="Sin puntos, con guion" autoComplete="off" /></label></div>
        <p className="text-sm text-gray-600 dark:text-gray-300">El número se asigna por bebé y evento. La fila comienza cuando recepción confirme tu llegada. Los registros del mismo día se consideran inscripciones del día, también si se realizan por la web.</p><button className="rounded-lg bg-teal-700 px-6 py-3 text-white disabled:opacity-50" disabled={!eventoId}>{busy === "register" ? "Confirmando inscripción…" : "Confirmar inscripción"}</button>
      </fieldset></form>}</section>
    </>}
  </main>
}
