"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
type Invitation = { id: string; correo: string; expiraAt: string; estado: string; propia: boolean }
type Status = { vinculada: boolean; disponible: boolean; correoSugerido: string; vinculacion: Invitation | null }
export function ReceptionLinking({ eventoId, inscripcionId, disabled, onStart, onFinish }: { eventoId: string; inscripcionId: string; disabled: boolean; onStart: () => boolean; onFinish: () => void }) {
  const [status, setStatus] = useState<Status | null>(null), [correo, setCorreo] = useState("")
  const [secret, setSecret] = useState<{ id: string; codigo: string; qr: string; expiraAt: string } | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("")
  const inFlight = useRef(false), edited = useRef(false), requestId = useRef<string | null>(null), revision = useRef(0)
  async function read(response: Response) { const data = await response.json(); if (!response.ok) throw new Error(data.error || "No pudimos consultar la vinculación."); return data }
  const load = useCallback((signal?: AbortSignal) => {
    if (inFlight.current) return Promise.resolve()
    const version = revision.current
    return fetch(`/api/recepcion/vinculaciones?eventoId=${eventoId}&inscripcionId=${inscripcionId}`, { cache: "no-store", signal }).then(read).then((data: Status) => {
      if (!signal?.aborted && version === revision.current) {
        setStatus(data)
        if (!edited.current) setCorreo(data.vinculacion?.correo || data.correoSugerido)
        setSecret(previous => previous && !data.vinculada && data.vinculacion?.id === previous.id && data.vinculacion.estado === "PENDIENTE" ? previous : null)
      }
    }).catch(cause => { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "No pudimos consultar la vinculación.") })
  }, [eventoId, inscripcionId])
  useEffect(() => {
    const controller = new AbortController(); void load(controller.signal)
    const interval = setInterval(() => { if (!document.hidden) void load(controller.signal) }, 15000)
    return () => { controller.abort(); clearInterval(interval) }
  }, [load])
  async function issue() {
    if (disabled || inFlight.current || !onStart()) return
    inFlight.current = true; revision.current++; setBusy(true); setError(""); setMessage("")
    const current = status?.vinculacion
    requestId.current ??= current?.propia && current.estado === "PENDIENTE" && current.correo === correo.trim().toLowerCase() ? current.id : crypto.randomUUID()
    try {
      const result = await read(await fetch("/api/recepcion/vinculaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: requestId.current, eventoId, inscripcionId, correo }) }))
      setSecret(result.codigo ? { id: result.vinculacion.id, codigo: result.codigo, qr: result.qr, expiraAt: result.vinculacion.expiraAt } : null)
      requestId.current = null
      setMessage(result.codigo ? "Entrega este código o QR directamente al apoderado. Deberá aceptarlo desde la cuenta del correo indicado." : "El código ya no está disponible. Consulta el estado de la vinculación.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos generar el código. Reintenta el mismo envío.") }
    finally { inFlight.current = false; setBusy(false); onFinish(); await load() }
  }
  async function revoke() {
    const current = status?.vinculacion
    if (!current || disabled || inFlight.current || !onStart()) return
    inFlight.current = true; revision.current++; setBusy(true); setError(""); setMessage("")
    try {
      await read(await fetch(`/api/recepcion/vinculaciones/${current.id}/revocar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventoId, inscripcionId }) }))
      setSecret(null); requestId.current = null; setMessage("Código revocado. Para vincular, genera uno nuevo con la dirección confirmada.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos revocar el código.") }
    finally { inFlight.current = false; setBusy(false); onFinish(); await load() }
  }
  return <section className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Vincular con la cuenta familiar</h3>{error && <p role="alert" className="text-sm text-red-700 dark:text-red-200">{error}</p>}{message && <p role="status" className="text-sm text-teal-800 dark:text-teal-200">{message}</p>}{!status ? <button type="button" disabled={busy || disabled} onClick={() => load()} className="rounded-lg border px-3 py-2">Consultar vinculación</button> : status.vinculada ? <p className="text-sm text-teal-800 dark:text-teal-200">La inscripción ya está vinculada. La familia verá los resultados cuando la profesional los publique.</p> : !status.disponible ? <p className="text-sm">Esta ficha requiere revisión antes de vincularse. No se cambia una cuenta ya asignada desde esta pantalla.</p> : <><p className="text-sm">Confirma con el apoderado el nombre del bebé y el correo de su cuenta. El código permite asociar esta inscripción sin volver a registrar al bebé.</p><label className="block text-sm">Correo de la cuenta familiar<input type="email" required maxLength={254} value={correo} disabled={busy || disabled} onChange={e => { edited.current = true; requestId.current = null; setCorreo(e.target.value); setSecret(null) }} className="mt-2 w-full rounded-lg border bg-white p-3 text-gray-900 dark:bg-gray-900 dark:text-gray-100" /></label>{status.vinculacion && <p className="text-xs">Invitación {status.vinculacion.estado.toLowerCase()} para {status.vinculacion.correo}.</p>}<div className="flex flex-wrap gap-3"><button type="button" disabled={busy || disabled || !correo.trim()} onClick={issue} className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50">{busy ? "Procesando…" : status.vinculacion?.propia && status.vinculacion.estado === "PENDIENTE" && status.vinculacion.correo === correo.trim().toLowerCase() ? "Mostrar código vigente" : "Generar código de vinculación"}</button>{status.vinculacion?.estado === "PENDIENTE" && <button type="button" disabled={busy || disabled} onClick={revoke} className="rounded-lg border px-4 py-2 disabled:opacity-50">Revocar código</button>}</div>{secret && <div className="space-y-3 rounded-lg bg-white p-4 text-gray-900"><Image unoptimized src={secret.qr} width={200} height={200} alt="QR para vincular la cuenta familiar" /><p className="text-sm">Código de vinculación</p><code className="block select-all break-all text-lg">{secret.codigo}</code><p className="text-sm">En su cuenta, la familia entra a «Vincular inscripción presencial». Vence: {new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(secret.expiraAt))}. Se usa una sola vez.</p></div>}<p className="text-xs">Se entrega directamente a la familia. El QR de inscripción conserva su función de recepción. Generar un código nuevo revoca el anterior.</p></>}</section>
}
