"use client"
import { useRef, useState } from "react"
import type { FormEvent } from "react"
import Link from "next/link"
import { ReceptionQrScanner } from "./ReceptionQrScanner"
type Preview = { id: string; inscripcionId: string; nombreBebe: string; fechaNacimiento: string; numero: number; evento: string; expiraAt: string }
export function FamilyLinking({ disabled, onStart, onFinish, onLinked }: { disabled: boolean; onStart: () => boolean; onFinish: () => void; onLinked: () => Promise<void> }) {
  const [code, setCode] = useState(""), [preview, setPreview] = useState<Preview | null>(null)
  const [linked, setLinked] = useState(false), [busy, setBusy] = useState(false), [scanning, setScanning] = useState(false)
  const [error, setError] = useState(""), [message, setMessage] = useState("")
  const inFlight = useRef(false)
  async function request(value: string, accept: boolean) {
    if (disabled || inFlight.current || !onStart()) return
    inFlight.current = true; setBusy(true); setError(""); setMessage(""); setScanning(false)
    try {
      const response = await fetch(`/api/familias/vinculaciones${accept ? "" : "/consultar"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: value }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No pudimos consultar el código.")
      setPreview(data.vinculacion); setLinked(data.vinculada)
      if (accept || data.vinculada) {
        setMessage("La inscripción está vinculada a tu cuenta. Conserva su número y comprobante; los resultados aparecerán cuando la profesional los publique.")
        try { await onLinked() } catch { setError("La vinculación quedó guardada. Actualiza tus inscripciones para ver el comprobante.") }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos conectar. Reintenta el mismo código.") }
    finally { inFlight.current = false; setBusy(false); onFinish() }
  }
  function submit(event: FormEvent) { event.preventDefault(); void request(code, false) }
  return <section className="space-y-4 rounded-2xl border p-6"><h2 className="text-2xl font-semibold">Vincular inscripción presencial</h2><p className="text-sm">Si registraste a tu bebé en recepción, usa el código o QR de vinculación que te entregaron. Debes ingresar con el correo confirmado allí.</p>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}{message && <p role="status" className="rounded-lg bg-teal-50 p-3 text-teal-900 dark:bg-teal-950 dark:text-teal-100">{message}</p>}<form onSubmit={submit} className="space-y-3"><label className="block text-sm">Código de vinculación<input required maxLength={100} autoComplete="off" value={code} disabled={busy || disabled} onChange={e => { setCode(e.target.value); setPreview(null); setLinked(false); setMessage(""); setError("") }} className="mt-2 w-full rounded-lg border bg-white p-3 text-gray-900 dark:bg-gray-900 dark:text-gray-100" /></label><div className="flex flex-wrap gap-3"><button disabled={busy || disabled} className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50">{busy ? "Procesando…" : "Revisar inscripción"}</button><button type="button" disabled={busy || disabled || scanning} onClick={() => { setPreview(null); setLinked(false); setScanning(true) }} className="rounded-lg border px-4 py-2 disabled:opacity-50">Leer QR de vinculación</button></div></form>{scanning && <ReceptionQrScanner description="Escanea el QR de vinculación entregado por recepción. Podrás revisar los datos antes de asociarlos a tu cuenta." onClose={() => setScanning(false)} onCode={value => { setCode(value); setPreview(null); setLinked(false); void request(value, false) }} />}
    {preview && <article className="space-y-3 rounded-xl bg-gray-50 p-5 dark:bg-gray-900"><h3 className="text-xl font-semibold">{preview.nombreBebe}</h3><p>Nacimiento: {preview.fechaNacimiento}</p><p>{preview.evento} · N.º {String(preview.numero).padStart(3, "0")}</p>{linked ? <Link href="/familias/resultados" className="inline-block underline">Consultar mis resultados publicados</Link> : <><p className="text-sm">Comprueba que corresponde a tu bebé antes de vincular esta inscripción a tu cuenta.</p><button type="button" disabled={busy || disabled} onClick={() => request(code, true)} className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50">Confirmar y vincular a mi cuenta</button></>}</article>}
  </section>
}
