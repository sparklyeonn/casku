"use client"
import { PaperPrivacy, emptyDeclaration } from "./PrivacyFields"
import { PRIVACY_VERSION } from "@/lib/privacy/policy"
import { useRef, useState } from "react"
import type { FormEvent } from "react"
import Image from "next/image"
import { ReceptionLinking } from "./ReceptionLinking"
import type { EventSummary } from "@/lib/events/input"

const initial = { nombreBebe: "", fechaNacimiento: "", rutBebe: "", nombreApoderado: "", correo: "", telefono: "" }
const field = "mt-2 w-full rounded-lg border bg-white p-3 text-gray-900 dark:bg-gray-900 dark:text-gray-100"
type Receipt = { id: string; numero: number; bebe: string; apoderado: string }
export function OnsiteRegistration({ event, enabled, disponibles, disabled, onStart, onFinish, onRegistered }: { event: EventSummary; enabled: boolean; disponibles: number | null; disabled: boolean; onStart: () => boolean; onFinish: () => void; onRegistered: () => Promise<void> }) {
  const [declaration, setDeclaration] = useState(emptyDeclaration)
  const [form, setForm] = useState(initial), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState(""), [message, setMessage] = useState("")
  const [receipt, setReceipt] = useState<Receipt | null>(null), [mail, setMail] = useState("")
  const requestId = useRef<string | null>(null), inFlight = useRef(false)
  async function read(response: Response) {
    if (response.status === 401 || response.status === 403) { window.location.replace("/login"); throw new Error("Vuelve a ingresar como recepción.") }
    const data = await response.json()
    if (!response.ok) throw Object.assign(new Error(data.error || "No pudimos completar el registro."), { status: response.status })
    return data
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current || !onStart()) return
    inFlight.current = true; setBusy(true); setError(""); setMessage("")
    requestId.current ??= crypto.randomUUID()
    try {
      const data = await read(await fetch("/api/recepcion/presencial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, declaracion: declaration, privacidad: { version: PRIVACY_VERSION, datos: declaration.documentada, correoResultados: false, seguimiento: false }, eventoId: event.id, id: requestId.current }) }))
      setReceipt(data.inscripcion); setMail(data.correo); setUncertain(false); requestId.current = null; setForm(initial); setDeclaration(emptyDeclaration)
      setMessage(data.inscripcion.llegada?.estado === "AUSENTE" ? "La inscripción ya existe y figura ausente. Búscala por este número para confirmar su reincorporación a la fila." : data.nuevaInscripcion ? "Inscripción registrada y llegada confirmada. El bebé ya está en la fila." : "La inscripción ya existía. Conservamos su número y registramos su llegada si aún estaba pendiente.")
      await onRegistered()
    } catch (cause) {
      const status = cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 0
      setUncertain(status === 0 || status >= 500)
      setError(cause instanceof Error ? cause.message : "No pudimos confirmar el registro. Reintenta el mismo envío.")
    } finally { inFlight.current = false; setBusy(false); onFinish() }
  }
  async function retryMail() {
    if (!receipt || inFlight.current || !onStart()) return
    inFlight.current = true; setBusy(true); setError("")
    try {
      const result = await read(await fetch("/api/recepcion/correo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventoId: event.id, inscripcionId: receipt.id }) }))
      setMail(result.correo)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos reintentar el correo.") }
    finally { inFlight.current = false; setBusy(false); onFinish() }
  }
  function change(key: keyof typeof initial, value: string) { if (uncertain) return; requestId.current = null; setForm(previous => ({ ...previous, [key]: value })) }
  return <section className="space-y-5 rounded-xl border p-5"><h2 className="text-xl font-semibold">Inscripción presencial</h2><p className="text-sm">Para familias sin inscripción. Si ya tienen un número o comprobante, búscalo arriba antes de crear un registro.</p><p className="text-sm">Se usan los mismos cupos del evento. {disponibles === null ? "Consultando disponibilidad…" : `${disponibles} cupos disponibles.`}</p>
    {!enabled && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">La inscripción presencial se habilita el día del evento, según la fecha de Chile.</p>}
    {message && <p role="status" className="rounded-lg bg-teal-50 p-3 text-teal-900 dark:bg-teal-950 dark:text-teal-100">{message}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}
    {receipt && <article className="space-y-3 rounded-xl border border-teal-300 p-4"><h3 className="text-lg font-semibold">N.º {String(receipt.numero).padStart(3, "0")} · {receipt.bebe}</h3><p>{event.nombre} · {receipt.apoderado}</p><Image unoptimized src={`/api/recepcion/inscripciones/${receipt.id}/qr?eventoId=${event.id}`} width={180} height={180} alt={`QR de inscripción ${receipt.numero}`} /><a className="inline-block underline" href={`/api/recepcion/inscripciones/${receipt.id}/qr?eventoId=${event.id}`} download={`casku-${receipt.numero}.png`}>Descargar QR del comprobante</a><p className="text-sm">{mail === "ENVIADO" ? "Confirmación aceptada para envío por correo." : mail === "SIN_CORREO" ? "Registro sin correo. La inscripción y su lugar en la fila están guardados; entrega el número a la familia." : "El correo está pendiente. La inscripción, el número y el QR están guardados."}</p>{mail !== "SIN_CORREO" && mail !== "ENVIADO" && <button type="button" disabled={busy || disabled} onClick={retryMail} className="rounded-lg border px-3 py-2 disabled:opacity-50">Reintentar correo</button>}<ReceptionLinking key={receipt.id} eventoId={event.id} inscripcionId={receipt.id} disabled={busy || disabled} onStart={onStart} onFinish={onFinish} /></article>}
    <form onSubmit={submit} className="space-y-4"><fieldset disabled={busy || disabled || uncertain || !enabled || disponibles === 0} className="space-y-4 disabled:opacity-60"><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">Nombre completo del bebé<input className={field} value={form.nombreBebe} onChange={e => change("nombreBebe", e.target.value)} required maxLength={120} autoComplete="off" /></label><label className="block text-sm">Fecha de nacimiento<input className={field} type="date" value={form.fechaNacimiento} onChange={e => change("fechaNacimiento", e.target.value)} required min="1900-01-01" /></label><label className="block text-sm">RUT del bebé · Opcional<input className={field} value={form.rutBebe} onChange={e => change("rutBebe", e.target.value)} maxLength={20} placeholder="Sin puntos, con guion" /></label><label className="block text-sm">Nombre del apoderado<input className={field} value={form.nombreApoderado} onChange={e => change("nombreApoderado", e.target.value)} required maxLength={120} /></label><label className="block text-sm">Correo de contacto · Opcional<input className={field} type="email" value={form.correo} onChange={e => change("correo", e.target.value)} maxLength={254} /></label><label className="block text-sm">Teléfono · Opcional<input className={field} type="tel" value={form.telefono} onChange={e => change("telefono", e.target.value)} maxLength={25} /></label></div><PaperPrivacy value={declaration} onChange={value => { requestId.current = null; setDeclaration(value) }} disabled={busy || disabled || uncertain} /></fieldset><p className="text-sm text-gray-600 dark:text-gray-300">Confirma los datos con la familia. El correo permite enviar el comprobante; al terminar podrás generar un código para vincular la inscripción con su cuenta familiar.</p>{uncertain && <p className="text-sm">La respuesta del registro quedó pendiente de confirmar. Reintenta el mismo envío para recuperar su número sin reservar otro cupo.</p>}<button disabled={busy || disabled || (!uncertain && (!declaration.documentada || !enabled || disponibles === 0 || disponibles === null))} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy ? "Procesando…" : uncertain ? "Reintentar el mismo registro" : "Registrar y confirmar llegada"}</button></form>
  </section>
}
