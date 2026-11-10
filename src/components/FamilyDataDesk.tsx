"use client"
import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import type { DataDetail } from "@/lib/data-corrections/store"
import { CancelRegistration } from "./CancelRegistration"
import { ReceptionQrScanner } from "./ReceptionQrScanner"
type Event = { id: string; nombre: string; fecha: string; lugar: string }
const field = "mt-2 w-full rounded-lg border bg-white p-3 text-gray-900 dark:bg-gray-900 dark:text-gray-100"
const endpoint = "/api/datos-familias"
async function read(response: Response) { const result = await response.json(); if (!response.ok) throw new Error(result.error || "No pudimos consultar los datos."); return result }
export function FamilyDataDesk({ canRetry }: { canRetry: boolean }) {
  const params = useSearchParams(), requested = params.get("evento"), requestedNumber = params.get("numero")
  const [events, setEvents] = useState<Event[]>([]), [eventoId, setEventoId] = useState(""), [query, setQuery] = useState(requestedNumber || "")
  const [detail, setDetail] = useState<DataDetail | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [scanning, setScanning] = useState(false)
  const [error, setError] = useState(""), [message, setMessage] = useState("")
  const operation = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${endpoint}/eventos`, { cache: "no-store", signal: controller.signal }).then(read).then(result => { if (!controller.signal.aborted) { setEvents(result.eventos); setEventoId(previous => previous || (result.eventos.some((event: Event) => event.id === requested) ? requested || "" : "")) } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos cargar los eventos.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [requested])
  function start() { if (operation.current) return false; operation.current = true; setBusy(true); setError(""); setMessage(""); return true }
  function finish() { operation.current = false; setBusy(false) }
  async function search(value: string) {
    if (!eventoId || !start()) return
    setScanning(false); setDetail(null)
    try { setDetail(await read(await fetch(`${endpoint}/buscar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventoId, consulta: value }) }))) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No encontramos esa inscripción.") }
    finally { finish() }
  }
  async function retryConfirmation() {
    if (!detail || !canRetry || detail.ficha.apoderado.tipo !== "CONTACTO" || !detail.ficha.apoderado.correo || detail.ficha.cancelada || !start()) return
    try {
      const result = await read(await fetch("/api/recepcion/correo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventoId, inscripcionId: detail.ficha.id }) }))
      setMessage(result.correo === "ENVIADO" ? "El proveedor aceptó la confirmación para el contacto guardado." : "La inscripción está guardada. El correo sigue pendiente; espera antes de reintentar.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos reintentar el comprobante.") }
    finally { finish() }
  }
  async function reload(page = 1, historyOnly = false) {
    if (!detail || !start()) return
    try {
      const result = await read(await fetch(`${endpoint}/inscripciones/${detail.ficha.id}?eventoId=${eventoId}&pagina=${page}`, { cache: "no-store" }))
      setDetail(previous => historyOnly && previous ? { ...previous, historial: result.historial } : result)
      if (!historyOnly) setMessage("Datos actualizados. Se descartaron los cambios sin guardar.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos actualizar la ficha.") }
    finally { finish() }
  }
  return <main className="mx-auto max-w-5xl space-y-6 px-5 py-8"><div><h1 className="text-3xl font-semibold">Corrección de datos familiares</h1><p className="mt-3 text-gray-600 dark:text-gray-300">Busca una inscripción y confirma la identidad con la familia antes de corregir. Esta pantalla no modifica mediciones ni resultados clínicos.</p></div>{error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}{message && <p role="status" className="rounded-lg bg-teal-50 p-4 text-teal-900 dark:bg-teal-950 dark:text-teal-100">{message}</p>}
    <section className="space-y-4 rounded-2xl border p-6"><label className="block text-sm">Evento<select value={eventoId} disabled={busy || loading} onChange={e => { setEventoId(e.target.value); setDetail(null); setQuery(""); setScanning(false); setError(""); setMessage("") }} className={field}><option value="">{loading ? "Cargando eventos…" : "Elige un evento"}</option>{events.map(event => <option key={event.id} value={event.id}>{event.nombre} · {event.fecha} · {event.lugar}</option>)}</select></label><form className="space-y-3" onSubmit={e => { e.preventDefault(); void search(query) }}><label className="block text-sm">Número o QR de inscripción<input required disabled={busy || !eventoId} maxLength={100} value={query} onChange={e => setQuery(e.target.value)} className={field} /></label><div className="flex flex-wrap gap-3"><button disabled={busy || !eventoId} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy ? "Procesando…" : "Buscar inscripción"}</button><button type="button" disabled={busy || !eventoId} onClick={() => setScanning(true)} className="rounded-lg border px-4 py-2 disabled:opacity-50">Leer QR</button></div></form>{scanning && <ReceptionQrScanner description="Escanea el QR del comprobante para consultar la ficha que necesitas corregir." onClose={() => setScanning(false)} onCode={value => { setQuery(value); void search(value) }} />}</section>
    {detail && <><section className="space-y-4 rounded-2xl border p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm">{detail.ficha.evento} · Inscripción N.º {String(detail.ficha.numero).padStart(3, "0")}</p><h2 className="mt-2 break-words text-2xl font-semibold">{detail.ficha.bebe.nombre}</h2></div><button type="button" disabled={busy} onClick={() => reload()} className="rounded-lg border px-4 py-2 disabled:opacity-50">Descartar cambios y recargar</button></div><DataForm key={`${detail.ficha.id}:${detail.ficha.bebe.revision}:${detail.ficha.apoderado.tipo}:${detail.ficha.apoderado.revision}`} ficha={detail.ficha} eventoId={eventoId} disabled={busy} onStart={start} onFinish={finish} onSaved={(result, changed) => { setDetail(result); setMessage(changed ? "Corrección guardada en la misma ficha. Se registró el motivo y la cuenta responsable; no se enviaron correos." : "La ficha ya tenía esos datos. No se duplicaron cambios.") }} />{canRetry && !detail.ficha.cancelada && detail.ficha.apoderado.tipo === "CONTACTO" && <div className="space-y-3 border-t pt-4"><p className="break-words text-sm">Comprobante para el contacto guardado: {detail.ficha.apoderado.correo || "Sin correo"}. Primero guarda cualquier corrección del destinatario.</p><button type="button" disabled={busy || !detail.ficha.apoderado.correo} onClick={retryConfirmation} className="rounded-lg border px-4 py-2 disabled:opacity-50">Reintentar correo del comprobante</button></div>}</section>
    <CancelRegistration key={`cancel:${detail.ficha.id}`} eventoId={eventoId} inscripcionId={detail.ficha.id} disabled={busy} onStart={start} onFinish={finish} onCancelled={async () => { setDetail(await read(await fetch(`${endpoint}/inscripciones/${detail.ficha.id}?eventoId=${eventoId}`, { cache: "no-store" }))) }} />
    <section className="space-y-4 rounded-2xl border p-6"><h2 className="text-2xl font-semibold">Registro de cambios</h2><p className="text-sm">Solo datos personales y contactos. Los movimientos de fila y las revisiones clínicas tienen su propio registro.</p>{detail.historial.cambios.length === 0 ? <p>Todavía no hay cambios registrados para esta ficha.</p> : <ul className="space-y-4">{detail.historial.cambios.map(change => <li key={change.id} className="space-y-2 rounded-xl border p-4"><p className="font-medium">{change.entidad === "BEBE" ? "Bebé" : change.entidad === "CONTACTO" ? "Contacto presencial" : "Apoderado"} · Revisión {change.revision}</p><p className="text-sm">{new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(change.createdAt))} · {change.perfilActor === "APODERADO" ? "Cuenta familiar" : change.perfilActor === "ADMIN" ? "Administración" : "Recepción"} · {change.actorName}</p><p className="break-words text-sm">Motivo: {change.motivo}</p><Changes before={change.anterior} after={change.nueva} /></li>)}</ul>}<div className="flex gap-3">{detail.historial.pagina > 1 && <button disabled={busy} onClick={() => reload(detail.historial.pagina - 1, true)} className="rounded-lg border px-4 py-2">Anterior</button>}{detail.historial.hayMas && <button disabled={busy} onClick={() => reload(detail.historial.pagina + 1, true)} className="rounded-lg border px-4 py-2">Siguiente</button>}</div></section></>}
  </main>
}
function Changes({ before, after }: { before: unknown; after: unknown }) {
  const previous = before && typeof before === "object" ? before as Record<string, unknown> : {}, next = after && typeof after === "object" ? after as Record<string, unknown> : {}
  const labels: Record<string, string> = { nombre: "Nombre", rut: "RUT", fechaNacimiento: "Nacimiento", telefono: "Teléfono", correo: "Correo de contacto" }
  return <ul className="space-y-1 text-sm">{Object.keys(next).filter(key => previous[key] !== next[key]).map(key => <li key={key} className="break-words">{labels[key] || key}: {String(previous[key] || "Sin dato")} → {String(next[key] || "Sin dato")}</li>)}</ul>
}
function DataForm({ ficha, eventoId, disabled, onStart, onFinish, onSaved }: { ficha: DataDetail["ficha"]; eventoId: string; disabled: boolean; onStart: () => boolean; onFinish: () => void; onSaved: (result: DataDetail, changed: boolean) => void }) {
  const [section, setSection] = useState<"BEBE" | "APODERADO">("BEBE"), [baby, setBaby] = useState({ nombre: ficha.bebe.nombre, fechaNacimiento: ficha.bebe.fechaNacimiento, rut: ficha.bebe.rut || "" })
  const [guardian, setGuardian] = useState({ nombre: ficha.apoderado.nombre || "", telefono: ficha.apoderado.telefono || "", rut: ficha.apoderado.tipo === "CUENTA" ? ficha.apoderado.rut || "" : "", correo: ficha.apoderado.correo || "" })
  const [reason, setReason] = useState(""), [error, setError] = useState("")
  const inFlight = useRef(false), linked = ficha.apoderado.tipo === "CUENTA"
  async function save(event: FormEvent) {
    event.preventDefault(); if (disabled || inFlight.current || !onStart()) return
    inFlight.current = true; setError("")
    const datos = section === "BEBE" ? baby : linked ? { nombre: guardian.nombre, telefono: guardian.telefono, rut: guardian.rut } : { nombre: guardian.nombre, telefono: guardian.telefono, correo: guardian.correo }
    try {
      const result = await read(await fetch(`${endpoint}/inscripciones/${ficha.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventoId, seccion: section === "BEBE" ? "BEBE" : linked ? "APODERADO" : "CONTACTO", revision: section === "BEBE" ? ficha.bebe.revision : ficha.apoderado.revision, motivo: reason, datos }) }))
      onSaved(result, result.actualizado)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar. Reintenta el mismo envío.") }
    finally { inFlight.current = false; onFinish() }
  }
  return <form onSubmit={save} className="space-y-5">{error && <p role="alert" className="text-red-800 dark:text-red-200">{error}</p>}<fieldset disabled={disabled} className="space-y-5"><label className="block text-sm">Datos que vas a corregir<select value={section} onChange={e => { setSection(e.target.value as typeof section); setReason(""); setError("") }} className={field}><option value="BEBE">Bebé</option><option value="APODERADO">{linked ? "Apoderado con cuenta verificada" : "Contacto presencial"}</option></select></label>{section === "BEBE" ? <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">Nombre del bebé<input required maxLength={120} value={baby.nombre} onChange={e => setBaby({ ...baby, nombre: e.target.value })} className={field} /></label><label className="block text-sm">Fecha de nacimiento<input required type="date" min="1900-01-01" value={baby.fechaNacimiento} onChange={e => setBaby({ ...baby, fechaNacimiento: e.target.value })} className={field} /></label><label className="block text-sm">RUT del bebé · Opcional<input maxLength={20} value={baby.rut} onChange={e => setBaby({ ...baby, rut: e.target.value })} className={field} /></label></div> : <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">Nombre del apoderado<input required maxLength={120} value={guardian.nombre} onChange={e => setGuardian({ ...guardian, nombre: e.target.value })} className={field} /></label><label className="block text-sm">Teléfono · Opcional<input type="tel" maxLength={25} value={guardian.telefono} onChange={e => setGuardian({ ...guardian, telefono: e.target.value })} className={field} /></label>{linked && <label className="block text-sm">RUT del apoderado · Opcional<input maxLength={20} value={guardian.rut} onChange={e => setGuardian({ ...guardian, rut: e.target.value })} className={field} /></label>}<label className="block text-sm">{linked ? "Correo de acceso verificado · Protegido" : "Correo de contacto · Opcional"}<input type="email" readOnly={linked} maxLength={254} value={guardian.correo} onChange={e => setGuardian({ ...guardian, correo: e.target.value })} className={field} /></label></div>}
      <p className="text-sm text-gray-600 dark:text-gray-300">{section === "BEBE" ? "Se corrige la misma ficha para todas sus inscripciones. Los resultados publicados conservan su identidad original; no se alteran medidas ni recomendaciones. El bebé no debe estar en atención." : linked ? "Esta cuenta puede tener varios bebés: la corrección del perfil se reflejará en todas sus inscripciones. Su correo verificado y la vinculación de los bebés no se cambian aquí." : "Solo se corrige el contacto de esta inscripción; no se crea una cuenta ni se asigna el bebé por conocer un correo. Si corriges el correo, recepción puede reintentar el comprobante hacia la dirección corregida."}</p><p className="text-sm text-gray-600 dark:text-gray-300">Las correcciones de bebé o contacto revocan los códigos de vinculación todavía pendientes: habrá que entregar uno nuevo. Los códigos ya aceptados y las cuentas vinculadas se conservan. Guardar no envía correos.</p><label className="block text-sm">Motivo de la corrección<textarea required minLength={10} maxLength={300} rows={3} value={reason} onChange={e => setReason(e.target.value)} className={field} placeholder="Explica qué dato confirmó la familia y por qué se corrige. No incluyas información clínica." /></label><button disabled={disabled || (ficha.cancelada && section === "APODERADO" && !linked)} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{disabled ? "Guardando…" : "Guardar corrección y registrar cambio"}</button></fieldset></form>
}
