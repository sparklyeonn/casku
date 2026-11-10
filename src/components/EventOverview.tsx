"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { EventOverview as Overview } from "@/lib/events/overview"

const metrics = [
  { key: "inscritos", label: "Inscritos", description: "Reservas vigentes, previas y del día." },
  { key: "atendidos", label: "Atendidos", description: "Atenciones finalizadas al guardar la evaluación." },
  { key: "enEspera", label: "En espera", description: "Llegada confirmada y esperando llamado." },
  { key: "ausentes", label: "Ausentes", description: "No respondieron y aún no se reincorporan." },
  { key: "resultadosPendientes", label: "Pendientes de publicación", description: "Evaluaciones guardadas de este evento sin publicar." },
] as const
export function EventOverview({ eventoId }: { eventoId: string }) {
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true)
  const inFlight = useRef(false), controller = useRef<AbortController | null>(null)
  const load = useCallback((signal: AbortSignal) => {
    if (inFlight.current) return Promise.resolve()
    inFlight.current = true
    return fetch(`/api/eventos/${eventoId}/resumen`, { cache: "no-store", signal }).then(async response => {
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("No pudimos consultar el resumen. Vuelve a intentarlo.")
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "No pudimos consultar el resumen.")
      return result as Overview
    }).then(result => { if (!signal.aborted) { setData(result); setError("") } })
      .catch(cause => { if (!signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos actualizar el resumen.") })
      .finally(() => { inFlight.current = false; if (!signal.aborted) setLoading(false) })
  }, [eventoId])
  useEffect(() => {
    const current = new AbortController(); controller.current = current
    // La microtarea también evita que el ciclo de prueba de efectos deje una carga cancelada en curso.
    void Promise.resolve().then(() => { if (!current.signal.aborted) void load(current.signal) })
    const refresh = () => { if (!document.hidden) void load(current.signal) }
    const interval = setInterval(refresh, 15000)
    document.addEventListener("visibilitychange", refresh)
    return () => { current.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", refresh) }
  }, [load])
  function refresh() { if (controller.current && !inFlight.current) { setLoading(true); void load(controller.current.signal) } }
  const number = (value: number) => value.toLocaleString("es-CL")
  return <section aria-labelledby="event-overview-title" className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="event-overview-title" className="text-xl font-semibold">Resumen del evento</h2><p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{data ? data.evento.nombre : "Consultando el evento seleccionado"} · Actualización automática cada 15 segundos mientras esta página está visible.</p></div><button type="button" disabled={loading} onClick={refresh} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{loading ? "Actualizando…" : "Actualizar resumen"}</button></div>
    {error && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}{data ? " Se muestran los últimos datos consultados; pueden haber cambiado." : " Los totales no están disponibles."}</p>}
    {!data ? loading ? <p role="status">Cargando totales…</p> : null : <>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(metric => <div key={metric.key} className="rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950"><dt className="text-sm font-medium">{metric.label}</dt><dd className="mt-3 text-4xl font-semibold tabular-nums">{number(data.totales[metric.key])}</dd><dd className="mt-3 text-xs text-gray-600 dark:text-gray-300">{metric.description}</dd></div>)}</dl>
      <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm"><div><dt className="inline">Canceladas: </dt><dd className="inline font-semibold">{number(data.totales.canceladas)}</dd></div><div><dt className="inline">Sin llegada confirmada: </dt><dd className="inline font-semibold">{number(data.totales.sinLlegada)}</dd></div><div><dt className="inline">En atención: </dt><dd className="inline font-semibold">{number(data.totales.enAtencion)}</dd></div><div><dt className="inline">Resultados publicados: </dt><dd className="inline font-semibold">{number(data.totales.resultadosPublicados)}</dd></div></dl>
      <p className="text-xs text-gray-600 dark:text-gray-300">Última consulta: {new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Santiago" }).format(new Date(data.consultadoAt))}.</p>
    </>}
    <p className="text-sm text-gray-600 dark:text-gray-300">Se cuenta una inscripción por bebé; una familia con dos bebés cuenta dos veces. Los pendientes incluyen resultados que esperan vinculación familiar. Los resultados sin inscripción no se asignan a un evento.</p>
  </section>
}
