"use client"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"

export type PublicEvent = { id: string; nombre: string; fecha: string; lugar: string; disponibles: number }
export function eventDate(date: string) { return new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)) }
export function PublicEvents() {
  const { data: session } = useSession()
  const [events, setEvents] = useState<PublicEvent[]>([]), [error, setError] = useState(""), [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/eventos/disponibles", { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setEvents(data.eventos) }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos consultar los eventos.") }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  return <main className="mx-auto max-w-4xl px-5 py-12"><Link href="/" className="text-2xl font-semibold text-teal-700 dark:text-teal-300">casku</Link><h1 className="mt-8 text-3xl font-semibold">Elige tu evento</h1><p className="mt-3 text-gray-600 dark:text-gray-300">Inscribe a tu bebé y recibe un número y QR para presentar al llegar.</p>
    {error && <p role="alert" className="mt-6 text-red-700 dark:text-red-200">{error}</p>}
    {loading ? <p role="status" className="mt-8">Consultando eventos…</p> : !error && events.length === 0 ? <div className="mt-8 rounded-xl border p-6"><h2 className="text-xl font-medium">No hay inscripciones abiertas por ahora</h2><p className="mt-3">Cuando Casku habilite un evento, aparecerá aquí.</p><Link href="/login?portal=familias" className="mt-4 inline-block text-teal-700 dark:text-teal-300">Consultar mis inscripciones</Link></div> : <ul className="mt-8 grid gap-5 sm:grid-cols-2">{events.map(event => <li key={event.id} className="space-y-3 rounded-xl border p-6"><h2 className="break-words text-xl font-semibold">{event.nombre}</h2><p>{eventDate(event.fecha)}</p><p className="break-words text-gray-600 dark:text-gray-300">{event.lugar}</p><p className="text-sm">{event.disponibles.toLocaleString("es-CL")} cupos disponibles</p><Link className="inline-block rounded-lg bg-teal-700 px-5 py-3 text-white" href={session?.user.role === "APODERADO" ? `/familias?evento=${event.id}` : `/login?portal=familias&evento=${event.id}`}>Inscribir a mi bebé</Link></li>)}</ul>}
    <p className="mt-8 text-sm text-gray-600 dark:text-gray-300">La inscripción no reserva una hora de atención. Al llegar al evento, recepción confirmará tu presencia.</p>
  </main>
}
