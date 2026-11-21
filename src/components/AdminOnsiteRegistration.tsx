"use client"
import { useCallback, useEffect, useState } from "react"
import type { EventSummary } from "@/lib/events/input"
import { OnsiteRegistration } from "./OnsiteRegistration"

type Availability = { disponibles: number; presencialHabilitada: boolean }
export function AdminOnsiteRegistration({ event, disabled, onStart, onFinish, onRegistered }: { event: EventSummary; disabled: boolean; onStart: () => boolean; onFinish: () => void; onRegistered: () => Promise<void> }) {
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [error, setError] = useState("")
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/recepcion/presencial?eventoId=${event.id}`, { cache: "no-store", signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "No pudimos consultar los cupos presenciales.")
      if (!signal?.aborted) { setAvailability(result); setError("") }
    } catch (cause) {
      if (!signal?.aborted) { setAvailability(null); setError(cause instanceof Error ? cause.message : "No pudimos consultar los cupos presenciales.") }
    }
  }, [event.id])
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => { if (!controller.signal.aborted) void load(controller.signal) })
    return () => controller.abort()
  }, [load])
  return <div className="space-y-3">
    <button type="button" disabled={disabled} onClick={() => void load()} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Actualizar cupos presenciales</button>
    {error && <p role="alert">{error}</p>}
    <OnsiteRegistration administration event={event} enabled={availability?.presencialHabilitada ?? false} disponibles={availability?.disponibles ?? null} disabled={disabled} onStart={onStart} onFinish={onFinish} onRegistered={async () => { await load(); await onRegistered() }} />
  </div>
}
