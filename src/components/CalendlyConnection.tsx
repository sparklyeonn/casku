"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import type { CalendlyListing } from "@/lib/calendly/client"
type Status = "PENDIENTE_CONFIGURACION" | "DESACTIVADO" | "LISTO_PARA_CONSULTAR" | "CONECTADO"
const labels: Record<Status, string> = { PENDIENTE_CONFIGURACION: "Falta configurar el acceso privado a Calendly.", DESACTIVADO: "La conexión con Calendly está desactivada.", LISTO_PARA_CONSULTAR: "Acceso configurado. Puedes comprobar la conexión.", CONECTADO: "Cuenta conectada. Puedes revisar sus tipos de cita." }
export function CalendlyConnection() {
  const [status, setStatus] = useState<Status | null>(null), [listing, setListing] = useState<CalendlyListing | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const working = useRef(false), active = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/administracion/calendly", { cache: "no-store", signal: controller.signal }).then(async response => {
      const value = await response.json(); if (!response.ok) throw new Error(value.error || "No pudimos consultar la conexión.")
      if (!controller.signal.aborted) setStatus(value.estado)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos consultar la conexión.") })
    return () => { controller.abort(); active.current?.abort() }
  }, [])
  async function consult(cursor?: string) {
    if (working.current) return
    working.current = true; setBusy(true); setError("")
    const controller = new AbortController(); active.current = controller
    const query = new URLSearchParams({ consultar: "1" }); if (cursor) query.set("cursor", cursor)
    try {
      const response = await fetch(`/api/administracion/calendly?${query}`, { cache: "no-store", signal: controller.signal }), value = await response.json()
      if (!response.ok) throw new Error(value.error || "No pudimos consultar Calendly.")
      if (controller.signal.aborted) return
      setStatus(value.estado)
      if (value.estado === "CONECTADO") setListing(previous => ({ ...value, tipos: cursor && previous ? [...new Map([...previous.tipos, ...value.tipos].map(row => [row.id, row])).values()] : value.tipos }))
      else setListing(null)
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos consultar Calendly.") }
    finally { working.current = false; if (!controller.signal.aborted) setBusy(false) }
  }
  return <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
    <h1 className="text-3xl font-semibold">Conexión con Calendly</h1>
    <Link href="/agenda" className="inline-block rounded-full bg-teal-700 px-5 py-3 text-white">Ver agenda de citas y horarios</Link>
    <p>Las reservas de Expo Bebé incluyen una hora de atención. Puedes consultarlas en la agenda. Su vinculación con fichas y fila requiere confirmar los datos de cada familia.</p>
    <section className="space-y-3 rounded-xl border p-5" aria-labelledby="calendly-status"><h2 id="calendly-status" className="text-xl font-semibold">Estado de la conexión</h2>
      <p role="status">{busy ? "Consultando Calendly…" : status ? labels[status] : error ? "Conexión no disponible." : "Revisando la configuración…"}</p>
      {error && <p role="alert">{error}</p>}
      {<button className="rounded-lg border px-4 py-3 disabled:opacity-50" disabled={busy} onClick={() => void consult()}>{busy ? "Consultando…" : status === "LISTO_PARA_CONSULTAR" || status === "CONECTADO" ? "Consultar tipos de cita" : "Comprobar conexión"}</button>}
      {listing && <p>Cuenta: {listing.cuenta.nombre} · Zona horaria: {listing.cuenta.zonaHoraria}</p>}
    </section>
    {listing && <section className="space-y-4" aria-labelledby="calendly-types"><h2 id="calendly-types" className="text-xl font-semibold">Tipos de cita disponibles</h2>
      {!listing.tipos.length && <p>No hay tipos de cita disponibles para esta cuenta.</p>}
      {listing.tipos.map(type => <article key={type.id} className="space-y-3 rounded-xl border p-5"><h3 className="text-lg font-semibold">{type.nombre}</h3><p>{type.duracion} minutos · {type.activo ? "Activo" : "Inactivo"}</p>
        <a href={type.enlace} target="_blank" rel="noopener noreferrer" className="underline">Abrir página de reserva</a>
        <details><summary>Preguntas de inscripción ({type.preguntas.length})</summary>{type.preguntas.length ? <ul className="mt-3 space-y-2">{type.preguntas.map((question, index) => <li key={index}>{question.nombre} · {question.requerida ? "Obligatoria" : "Opcional"}</li>)}</ul> : <p>Calendly no devolvió preguntas adicionales para este tipo de cita.</p>}</details>
      </article>)}
      {listing.siguiente && <button disabled={busy} className="rounded-lg border px-4 py-3 disabled:opacity-50" onClick={() => void consult(listing.siguiente!)}>Ver más tipos de cita</button>}
    </section>}
    <section className="space-y-2 rounded-xl border p-5"><h2 className="text-xl font-semibold">Siguiente etapa</h2><p>Elegir el tipo de cita de Expo Bebé, relacionarlo con el evento de Casku y revisar los datos necesarios del bebé y del apoderado.</p><p>La importación de reservas, sus cambios de horario y cancelaciones todavía está pendiente de configuración. Esta consulta no modifica inscripciones ni la fila.</p></section>
  </main>
}
