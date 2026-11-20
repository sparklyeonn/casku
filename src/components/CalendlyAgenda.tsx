"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { CalendlyProtection } from "./CalendlyProtection"
import { CalendlyArrival } from "./CalendlyArrival"
import type { CalendlyAgendaListing } from "@/lib/calendly/agenda"
type Row = Omit<CalendlyAgendaListing["citas"][number], "correo"> & { correo?: string; vinculacion?: { numero: number; estado: string } | null }
type Listing = Omit<CalendlyAgendaListing, "citas"> & { citas: Row[] }
const time = (value: string) => new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value))
const arrivalState: Record<string, string> = { EN_ESPERA: "En espera", EN_ATENCION: "En atención", ATENDIDO: "Atención finalizada", AUSENTE: "Ausente", CANCELADO: "Inscripción cancelada", SIN_LLEGADA: "Sin llegada confirmada" }
const day = (value: string) => new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "full" }).format(new Date(value + "T12:00:00Z"))
export function CalendlyAgenda({ initialDate, canReceive = false, canProtect = false }: { initialDate: string; canReceive?: boolean; canProtect?: boolean }) {
  const [fecha, setFecha] = useState(initialDate), [estado, setEstado] = useState("active")
  const [data, setData] = useState<Listing | null>(null), [status, setStatus] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [search, setSearch] = useState("")
  const [confirming, setConfirming] = useState<string | null>(null)
  const active = useRef<AbortController | null>(null), working = useRef(false)
  const consult = useCallback(async (cursor?: string) => {
    if (working.current) return
    working.current = true; setBusy(true); setError("")
    const controller = new AbortController(); active.current = controller
    const query = new URLSearchParams({ consultar: "1", fecha, estado })
    if (cursor) query.set("cursor", cursor)
    try {
      const response = await fetch("/api/calendly/agenda?" + query, { cache: "no-store", signal: controller.signal })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error || "No pudimos consultar la agenda.")
      if (controller.signal.aborted) return
      setStatus(value.estado)
      if (value.estado !== "CONECTADO") { setData(null); return }
      setData(previous => ({ ...value, participantesPendientes: value.participantesPendientes || (!!cursor && !!previous?.participantesPendientes), turnosSinParticipantes: value.turnosSinParticipantes + (cursor ? previous?.turnosSinParticipantes || 0 : 0), citas: cursor && previous ? [...new Map([...previous.citas, ...value.citas].map(row => [row.reservaId + ":" + row.id, row])).values()] : value.citas }))
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos consultar la agenda.") }
    finally { working.current = false; if (!controller.signal.aborted) setBusy(false) }
  }, [fecha, estado])
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/calendly/agenda", { cache: "no-store", signal: controller.signal }).then(async response => {
      const value = await response.json()
      if (!response.ok) throw new Error(value.error || "No pudimos consultar la configuración.")
      if (!controller.signal.aborted) setStatus(value.estado)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Conexión no disponible.") })
    return () => { controller.abort(); active.current?.abort() }
  }, [])
  // Cada consulta sustituye la vista anterior: nunca mezcla días o estados distintos.
  function changeDate(value: string) { setFecha(value); setData(null); setError(""); setSearch("") }
  const rows = (data?.citas || []).filter(row => (row.nombreReserva + " " + (row.correo || "")).toLocaleLowerCase("es-CL").includes(search.trim().toLocaleLowerCase("es-CL")))
  return <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
    <div><p className="text-sm uppercase tracking-widest">Expo Bebé · Calendly</p><h1 className="mt-2 text-3xl font-semibold">Agenda de citas</h1></div>
    <p>Consulta las citas con hora reservada en Calendly. Todos los horarios se muestran en Santiago de Chile.</p>
    <section className="space-y-3 rounded-2xl border p-5">
      <p>El nombre corresponde a lo ingresado en la reserva y puede ser del bebé o del apoderado. Recepción puede confirmar el bebé y vincular la reserva a su inscripción al registrar la llegada.</p>
      <p className="text-sm">Los cambios de Calendly se reflejan al actualizar la consulta. No se envían correos ni se modifican reservas.</p>
    </section>
    <form className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void consult() }}>
      <label className="block">Día de atención<input className="mt-2 block w-full rounded-lg border p-3" type="date" required value={fecha} disabled={busy} onChange={event => changeDate(event.target.value)} /></label>
      <label className="block">Estado de la reserva<select aria-label="Estado de la reserva" className="mt-2 block w-full rounded-lg border p-3" value={estado} disabled={busy} onChange={event => { setEstado(event.target.value); setData(null); setError(""); setSearch("") }}><option value="active">Activas</option><option value="canceled">Canceladas y reprogramadas</option><option value="all">Todas</option></select></label>
      <button className="rounded-full bg-teal-700 px-5 py-3 text-white disabled:opacity-50 sm:col-span-2" disabled={busy || !fecha}>{busy ? "Consultando Calendly…" : data ? "Actualizar agenda" : "Consultar citas"}</button>
    </form>
    <p role="status">{busy ? "Consultando citas y participantes…" : status === "PENDIENTE_CONFIGURACION" ? "Falta configurar la clave privada de Calendly en el alojamiento." : status === "DESACTIVADO" ? "La conexión con Calendly está desactivada." : data ? "Agenda consultada." : "Selecciona el día y consulta la agenda."}</p>
    {error && <p role="alert" className="rounded-xl border border-red-300 p-4">{error}{data ? " Se conservan los datos de la última consulta correcta." : ""}</p>}
    {canProtect && <CalendlyProtection key={fecha} fecha={fecha} reception={canReceive} />}
    {data && <section className="space-y-4" aria-labelledby="agenda-day"><h2 id="agenda-day" className="text-xl font-semibold">{day(data.fecha)}</h2><p>{data.tipoCita} · {data.citas.length} reservas cargadas · Última consulta: {time(data.consultadoAt)}.</p>
      <label className="block">Buscar entre las reservas cargadas<input className="mt-2 block w-full rounded-lg border p-3" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre o correo, si tu perfil lo permite" /></label>
      {(data.siguiente || data.participantesPendientes) && <p className="rounded-xl border border-amber-300 p-4">{data.siguiente ? "Hay más citas para consultar: la lista todavía no está completa." : ""} {data.participantesPendientes ? "Calendly devolvió más de 100 participantes para una cita. Esa cita requiere revisión; no se presenta como completa." : ""}</p>}
      {!!data.turnosSinParticipantes && <p>{data.turnosSinParticipantes} citas de esta página no devolvieron participantes. Revisa Calendly antes de considerar libre ese horario.</p>}
      {!rows.length && <p>{search ? "No hay coincidencias entre las reservas cargadas." : data.siguiente ? "Esta página no contiene reservas de Expo Bebé para los filtros elegidos. Consulta la siguiente." : "No hay reservas en las páginas cargadas para este día y estado."}</p>}
      <ul className="space-y-3" aria-label="Citas de Calendly">{rows.map(row => <li key={row.reservaId + ":" + row.id} className="rounded-2xl border p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xl font-semibold">{time(row.inicio)}–{time(row.fin)}</p><h3 className="mt-2 text-lg">{row.nombreReserva}</h3>{row.correo && <p className="break-all text-sm">{row.correo}</p>}</div><span className="rounded-full border px-3 py-1 text-sm">{row.estado === "ACTIVA" ? "Confirmada en Calendly" : row.estado === "REPROGRAMADA" ? "Reprogramada · horario anterior" : "Cancelada"}</span></div><p className="mt-3 text-sm">Referencia Calendly: {row.id}</p>{row.vinculacion && <p className="mt-3">Inscripción N.º {String(row.vinculacion.numero).padStart(3, "0")} · {arrivalState[row.vinculacion.estado] || "Revisar en recepción"}. Gestiona la atención o el regreso desde Recepción.</p>}{canReceive && !row.vinculacion && row.estado === "ACTIVA" && <><button type="button" className="mt-4 rounded-full border px-5 py-2" onClick={() => setConfirming(row.reservaId + ":" + row.id)}>Confirmar bebé y llegada</button>{confirming === row.reservaId + ":" + row.id && <CalendlyArrival key={confirming} cita={row} onClose={() => setConfirming(null)} />}</>}</li>)}</ul>
      {data.siguiente && <button className="rounded-full border px-5 py-3 disabled:opacity-50" disabled={busy} onClick={() => void consult(data.siguiente!)}>Cargar más citas</button>}
    </section>}
  </main>
}
