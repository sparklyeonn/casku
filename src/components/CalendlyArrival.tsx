"use client"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { emptyPrivacy } from "@/lib/privacy/policy"
import { EvaluationConsent } from "./PrivacyFields"
type Booking = { id: string; reservaId: string; inicio: string; fin: string; correo?: string; nombreReserva: string }
type Event = { id: string; nombre: string; fecha: string; lugar: string }
const inputClass = "mt-2 block w-full rounded-lg border p-3"
export function CalendlyArrival({ cita, onClose }: { cita: Booking; onClose: () => void }) {
  const [events, setEvents] = useState<Event[]>([]), [eventoId, setEvent] = useState("")
  const [nombreBebe, setBaby] = useState(""), [fechaNacimiento, setBirth] = useState(""), [rutBebe, setRut] = useState("")
  const [nombreApoderado, setGuardian] = useState(""), [telefono, setPhone] = useState(""), [correo, setEmail] = useState(cita.correo || "")
  const [numero, setNumber] = useState(""), [autorizado, setConsent] = useState(false), [confirmado, setConfirmed] = useState(false)
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [result, setResult] = useState<{ numero: number; nueva: boolean; citaInicio: string } | null>(null)
  const requestId = useRef<string | null>(null), working = useRef(false)
  const fecha = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(new Date(cita.inicio))
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/recepcion/eventos", { cache: "no-store", signal: controller.signal }).then(async response => {
      const value = await response.json()
      if (!response.ok) throw new Error(value.error || "No pudimos cargar los eventos.")
      if (!controller.signal.aborted) { setEvents(value.eventos.filter((event: Event) => event.fecha === fecha)); setEvent("") }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos cargar los eventos.") })
    return () => controller.abort()
  }, [fecha])
  function changed() { requestId.current = null; setError("") }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (working.current) return
    working.current = true; setBusy(true); setError("")
    requestId.current ??= crypto.randomUUID()
    try {
      const response = await fetch("/api/recepcion/calendly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: requestId.current, eventoId, reservaId: cita.reservaId, invitadoId: cita.id, nombreBebe, fechaNacimiento, rutBebe, nombreApoderado, telefono, correo, numero: numero ? Number(numero) : "", autorizado, confirmado, privacidad: { ...emptyPrivacy, datos: autorizado } }) })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error || "No pudimos confirmar la llegada.")
      setResult(value.inscripcion)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos confirmar la llegada. Reintenta con los mismos datos.") }
    finally { working.current = false; setBusy(false) }
  }
  return <section className="mt-5 space-y-4 rounded-2xl border p-5" aria-label="Confirmar familia de Calendly">
    <h3 className="text-xl font-semibold">Confirmar bebé y llegada</h3>
    <p>Reserva a nombre de {cita.nombreReserva}. Confirma los datos con la familia: el nombre reservado no identifica por sí solo al bebé.</p>
    {error && <p role="alert">{error}</p>}
    {result ? <div role="status" className="space-y-3"><p>Inscripción N.º {String(result.numero).padStart(3, "0")} · Llegada registrada. Se conserva su hora de Calendly. No se envió ni programó ningún correo.</p><p>Si llegó antes, puede ser llamada cuando no haya otras familias habilitadas esperando y una profesional esté disponible. Se conserva la hora original. Una ausencia anterior se reincorpora desde Recepción; no se vuelve a inscribir.</p><Link href="/recepcion" className="underline">Ver fila de recepción</Link></div> : <form onSubmit={submit} onChange={changed} className="space-y-4">
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label>Evento del {fecha}<select required className={inputClass} value={eventoId} onChange={e => setEvent(e.target.value)}><option value="">Selecciona el evento</option>{events.map(event => <option key={event.id} value={event.id}>{event.nombre} · {event.lugar}</option>)}</select></label>
        <label>Número de inscripción existente (si ya tiene)<input type="number" min="1" max="100000" className={inputClass} value={numero} onChange={e => setNumber(e.target.value)} /></label>
        <label>Nombre del bebé<input required maxLength={120} autoComplete="off" className={inputClass} value={nombreBebe} onChange={e => setBaby(e.target.value)} /></label>
        <label>Fecha de nacimiento del bebé<input required type="date" className={inputClass} value={fechaNacimiento} onChange={e => setBirth(e.target.value)} /></label>
        <label>RUT del bebé (opcional)<input maxLength={20} className={inputClass} value={rutBebe} onChange={e => setRut(e.target.value)} /></label>
        <label>Nombre del apoderado<input required maxLength={120} autoComplete="off" className={inputClass} value={nombreApoderado} onChange={e => setGuardian(e.target.value)} /></label>
        <label>Teléfono (opcional)<input type="tel" maxLength={25} className={inputClass} value={telefono} onChange={e => setPhone(e.target.value)} /></label>
        <label>Correo de contacto confirmado (opcional)<input type="email" maxLength={254} className={inputClass} value={correo} onChange={e => setEmail(e.target.value)} /></label>
      </fieldset>
      <p className="text-sm">Si no aparece un evento para esa fecha, administración debe crearlo. La llegada solo se confirma el día de la cita. No se vincula una cuenta familiar por coincidencia de correo.</p>
      <label className="flex items-start gap-3"><input disabled={busy} type="checkbox" checked={confirmado} onChange={e => setConfirmed(e.target.checked)} /><span>Recepción comprobó con la familia el bebé, el apoderado y que esta es su reserva.</span></label>
      <EvaluationConsent checked={autorizado} onChange={setConsent} disabled={busy} />
      <p className="text-sm">En una inscripción existente se conservan sus datos y permisos. Si están pendientes o retirados, utiliza la gestión de autorizaciones antes de vincular.</p>
      <button className="rounded-full bg-teal-700 px-5 py-3 text-white disabled:opacity-50" disabled={busy || !eventoId || !confirmado || !autorizado}>{busy ? "Comprobando cita y guardando…" : "Vincular cita y confirmar llegada"}</button>
    </form>}
    <button type="button" disabled={busy} onClick={onClose} className="rounded-full border px-5 py-2">Cerrar confirmación</button>
  </section>
}
