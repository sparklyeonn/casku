"use client"

import { EvaluationConsent } from "./PrivacyFields"
import { PRIVACY_VERSION } from "@/lib/privacy/policy"
import { useId, useRef, useState } from "react"
import Link from "next/link"

import { MeasurementFields } from "./MeasurementFields"
import { CraneometryReference } from "./CraneometryReference"
import { measurementForm, measurementValues, validMeasurements } from "@/lib/measurement-fields"

export type AssignedForm = { id: string; reservaId: string; numero: number; evento: { nombre: string }; bebe: { nombre: string; rut: string; fnac: string }; correo: string }
export default function FormularioEvaluacion({ profesional, atencion }: { profesional: string; atencion?: AssignedForm }) {
  const formId = useId()
  const [authorized, setAuthorized] = useState(false)
  const initial = { nombre: atencion?.bebe.nombre || "", rut: atencion?.bebe.rut || "", fnac: atencion?.bebe.fnac || "", correo: atencion?.correo || "", ...measurementForm() }
  const [form, setForm] = useState({
    ...initial,
  })
  const [guardando, setGuardando] = useState(false)
  const [guardada, setGuardada] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const inFlight = useRef(false)
  const [toast, setToast] = useState<string | null>(null)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const measures = measurementValues(form)
  const medidasOk = validMeasurements(measures, true)

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function guardar() {
    if (!medidasOk) return mostrarToast("Completa las seis mediciones válidas en milímetros. Las desviaciones pueden ser cero.")
    if (inFlight.current || guardada) return
    if (!atencion && !authorized) return mostrarToast("El apoderado debe marcar la autorización antes de guardar.")
    if (!form.fnac) return mostrarToast("Ingresa la fecha de nacimiento")
    if (!form.correo && !atencion) return mostrarToast("⚠ Ingresa el correo del padre/madre")
    if (!form.nombre || (!atencion && !form.rut)) return mostrarToast("⚠ Completa los datos del paciente")

    inFlight.current = true
    setGuardando(true)
    try {
      const res = await fetch("/api/evaluaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(atencion ? { atencionId: atencion.id, reservaId: atencion.reservaId, ...measures } : {
          ...form, autorizacionPresencial: authorized, privacidad: { version: PRIVACY_VERSION, datos: authorized, correoResultados: false, seguimiento: false },
          ...measures,

        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No se pudo guardar")
      mostrarToast("Evaluación guardada como borrador. Ya puedes revisarla.")
      setSavedId(data.evaluacionId)
      if (atencion) setGuardada(true)
      else { setForm(initial); setAuthorized(false) }
    } catch (error) {
      mostrarToast(error instanceof Error ? error.message : "Error al guardar. Intenta de nuevo.")
    } finally {
      setGuardando(false)
      inFlight.current = false
    }
  }

  return (
    <main className="team-evaluation craneometry-page max-w-5xl mx-auto px-4 py-7">
      {savedId && <section className="mb-5 space-y-3 rounded-xl border border-teal-300 p-4"><p role="status">Borrador guardado. Revisa el resultado antes de publicarlo para la familia.</p><Link href={`/kinesiologia/resultados/${savedId}`} className="inline-block rounded-lg bg-teal-700 px-5 py-3 text-white">Revisar y publicar resultado</Link></section>}
      {atencion && <section className="mb-6 space-y-3 rounded-xl border border-teal-300 p-4"><h1 className="text-xl font-semibold">Craneometría · Inscripción N.º {String(atencion.numero).padStart(3, "0")}</h1><p>{atencion.evento.nombre}</p><p className="text-sm">Datos recuperados de la inscripción. Verifica el nombre del bebé antes de medir.</p>{guardada && <p role="status" className="font-medium text-teal-700 dark:text-teal-300">Evaluación guardada y atención finalizada.</p>}<Link href="/kinesiologia" className="inline-block underline">{guardada ? "Volver y llamar al siguiente bebé" : "Volver a mi atención"}</Link></section>}
      <fieldset disabled={guardando || guardada} className="min-w-0">

      <div className="team-form-intro craneometry-intro"><p className="casku-eyebrow">Evaluación craneométrica</p>{!atencion && <h1 className="text-2xl font-semibold">Craneometría sin inscripción</h1>}<p>Seis medidas, una ficha. Revisa los datos del bebé y registra cada medición en milímetros.</p></div>

      {/* Datos paciente */}
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Datos del paciente</p>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-nombre`} className="text-xs font-medium text-gray-500">Nombre completo</label>
            <input className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition" id={`${formId}-nombre`} placeholder="Nombre del bebé" readOnly={Boolean(atencion)} value={form.nombre} onChange={e => set("nombre", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-rut`} className="text-xs font-medium text-gray-500">RUT del paciente</label>
            <input className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition" id={`${formId}-rut`} placeholder={atencion ? "Sin RUT registrado" : "12.345.678-9"} readOnly={Boolean(atencion)} value={form.rut} onChange={e => set("rut", e.target.value)} />
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-800" />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-fnac`} className="text-xs font-medium text-gray-500">Fecha de nacimiento</label>
            <input id={`${formId}-fnac`} type="date" className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition" readOnly={Boolean(atencion)} value={form.fnac} onChange={e => set("fnac", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-correo`} className="text-xs font-medium text-gray-500">Correo padre/madre</label>
            <input id={`${formId}-correo`} type="email" className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition" placeholder="correo@ejemplo.com" readOnly={Boolean(atencion)} value={form.correo} onChange={e => set("correo", e.target.value)} />
          </div>
        </div>
      </div>

      <MeasurementFields value={form} onChange={set} required />
      <section className="craneometry-professional"><p className="casku-eyebrow">Profesional responsable</p><p>{profesional}</p></section>
      <CraneometryReference measurements={measures} />
      {!medidasOk && <p className="craneometry-help">Cada indicador aparece al completar sus medidas. Para guardar, completa las seis mediciones; las desviaciones pueden ser cero.</p>}

      {/* Botones */}
      <div className="team-evaluation-actions flex flex-wrap gap-3">
        <button onClick={() => { setForm(initial); setAuthorized(false) }} className="border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 px-4 py-2.5 rounded-lg text-sm font-medium hover:border-gray-400 transition">
          {atencion ? "Limpiar medidas" : "Limpiar"}
        </button>
        {!atencion && <EvaluationConsent checked={authorized} onChange={setAuthorized} disabled={guardando} />}
        <button onClick={guardar} disabled={guardando} className="flex-1 bg-teal-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2">
          {guardando ? "Guardando..." : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1.5 7.5L5 11L12.5 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Guardar evaluación
            </>
          )}
        </button>
      </div>

      <p className="mt-4 text-sm text-gray-500">Guardar crea un borrador. El resultado se habilita para la familia y se intenta enviar por correo al publicarlo.</p>
      </fieldset>

      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-3 rounded-xl text-sm font-medium shadow-lg w-[calc(100%-2rem)] max-w-lg z-50">
          {toast}
        </div>
      )}
    </main>
  )
}
