"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
type Cancellation = { createdAt: string; motivo: string; perfilActor: string; nombreActor: string; estadoFilaAnterior: string | null }
type Status = { puedeCancelar: boolean; bloqueo: string | null; cancelacion: Cancellation | null }
export function CancelRegistration({ eventoId, inscripcionId, disabled, onStart, onFinish, onCancelled }: { eventoId: string; inscripcionId: string; disabled: boolean; onStart: () => boolean; onFinish: () => void; onCancelled: () => Promise<void> }) {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(""), [message, setMessage] = useState("")
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false)
  const operation = useRef(false), revision = useRef(0)
  const endpoint = `/api/inscripciones/${inscripcionId}/cancelacion`
  async function read(response: Response) { const data = await response.json(); if (!response.ok) throw new Error(data.error || "No pudimos consultar la cancelación."); return data }
  const load = useCallback((signal?: AbortSignal) => {
    if (operation.current) return Promise.resolve()
    const version = ++revision.current
    return fetch(`${endpoint}?eventoId=${eventoId}`, { cache: "no-store", signal }).then(read).then(data => { if (!signal?.aborted && version === revision.current) { setStatus(data); setError("") } })
      .catch(cause => { if (!signal?.aborted && version === revision.current) setError(cause instanceof Error ? cause.message : "No pudimos consultar el estado.") })
  }, [endpoint, eventoId])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  async function cancel(event: FormEvent) {
    event.preventDefault(); if (disabled || operation.current || !confirmed || !onStart()) return
    operation.current = true; revision.current++; setBusy(true); setError(""); setMessage("")
    try {
      const result = await read(await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventoId, motivo: reason }) }))
      setStatus(result); setMessage(result.nueva ? "Inscripción cancelada. Su cupo quedó disponible para otra reserva." : "La cancelación ya estaba registrada. No se liberó otro cupo.")
      try { await onCancelled() } catch { setError("La cancelación quedó guardada. Actualiza la pantalla para ver los totales y el historial.") }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cancelar. Consulta el estado o reintenta el mismo envío.") }
    finally { operation.current = false; setBusy(false); onFinish() }
  }
  return <section className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Cancelación de inscripción</h3>{error && <p role="alert" className="text-sm text-red-800 dark:text-red-200">{error}</p>}{message && <p role="status" className="text-sm text-teal-800 dark:text-teal-200">{message}</p>}{!status ? <button type="button" disabled={disabled || busy} onClick={() => load()} className="rounded-lg border px-3 py-2">Consultar estado de cancelación</button> : status.cancelacion ? <div className="space-y-2 text-sm"><p className="font-medium">Inscripción cancelada · Cupo liberado</p><p>{new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(status.cancelacion.createdAt))} · {status.cancelacion.nombreActor} · {status.cancelacion.perfilActor === "APODERADO" ? "Familia" : status.cancelacion.perfilActor === "ADMIN" ? "Administración" : "Recepción"}</p><p className="break-words">Motivo: {status.cancelacion.motivo}</p><p>Conserva su número e historial. El comprobante anterior no permite volver a la fila ni reactivar esta reserva.</p></div> : !status.puedeCancelar ? <div className="space-y-3 text-sm"><p>{status.bloqueo}</p><button type="button" disabled={disabled || busy} onClick={() => load()} className="rounded-lg border px-3 py-2">Actualizar estado</button></div> : <form onSubmit={cancel} className="space-y-3"><p className="text-sm">Se libera una reserva y se retira de la fila si estaba esperando o ausente. Se conservan bebé, número, QR y registros anteriores. Esta cancelación no se revierte automáticamente.</p><label className="block text-sm">Motivo administrativo · Visible para la familia<textarea required minLength={10} maxLength={300} rows={3} disabled={disabled || busy} value={reason} onChange={e => setReason(e.target.value)} className="mt-2 w-full rounded-lg border bg-white p-3 text-gray-900 dark:bg-gray-900 dark:text-gray-100" placeholder="Explica por qué se cancela, sin incluir información clínica." /></label><label className="flex items-start gap-3 text-sm"><input type="checkbox" required disabled={disabled || busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />Confirmo que corresponde cancelar esta inscripción y liberar su cupo.</label><button disabled={disabled || busy || !confirmed} className="rounded-lg border border-red-700 px-4 py-2 text-red-800 disabled:opacity-50 dark:border-red-400 dark:text-red-200">{busy ? "Cancelando…" : "Confirmar cancelación y liberar cupo"}</button><button type="button" disabled={disabled || busy} onClick={() => load()} className="ml-3 rounded-lg border px-4 py-2 disabled:opacity-50">Actualizar estado</button></form>}</section>
}
