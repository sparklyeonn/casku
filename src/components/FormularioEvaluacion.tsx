"use client"

import { PaperPrivacy, emptyDeclaration } from "./PrivacyFields"
import { PRIVACY_VERSION } from "@/lib/privacy/policy"
import { useRef, useState } from "react"
import Link from "next/link"

import { calcularDiagnostico } from "@/lib/craneometria"

const colorChip = {
  normal: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  leve: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  moderado: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
}

const colorVal = {
  normal: "text-emerald-600 dark:text-emerald-400",
  leve: "text-amber-600 dark:text-amber-400",
  moderado: "text-red-600 dark:text-red-400",
}

export type AssignedForm = { id: string; reservaId: string; numero: number; evento: { nombre: string }; bebe: { nombre: string; rut: string; fnac: string }; correo: string }
export default function FormularioEvaluacion({ profesional, atencion }: { profesional: string; atencion?: AssignedForm }) {
  const [declaration, setDeclaration] = useState(emptyDeclaration)
  const initial = { nombre: atencion?.bebe.nombre || "", rut: atencion?.bebe.rut || "", fnac: atencion?.bebe.fnac || "", correo: atencion?.correo || "", ap: "", bp: "", di: "", dd: "", kine: "" }
  const [form, setForm] = useState({
    ...initial,
  })
  const [guardando, setGuardando] = useState(false)
  const [guardada, setGuardada] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const inFlight = useRef(false)
  const [toast, setToast] = useState<string | null>(null)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const ap = parseFloat(form.ap)
  const bp = parseFloat(form.bp)
  const di = parseFloat(form.di)
  const dd = parseFloat(form.dd)
  const medidasOk = [ap, bp, di, dd].every(v => Number.isFinite(v) && v > 0)
  const resultado = medidasOk ? calcularDiagnostico(ap, bp, di, dd) : null

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function guardar() {
    if (!resultado) return mostrarToast("Ingresa las 4 medidas")
    if (inFlight.current || guardada) return
    if (!form.fnac) return mostrarToast("Ingresa la fecha de nacimiento")
    if (!form.correo && !atencion) return mostrarToast("⚠ Ingresa el correo del padre/madre")
    if (!form.nombre || (!atencion && !form.rut)) return mostrarToast("⚠ Completa los datos del paciente")

    inFlight.current = true
    setGuardando(true)
    try {
      const res = await fetch("/api/evaluaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(atencion ? { atencionId: atencion.id, reservaId: atencion.reservaId, ap, bp, di, dd } : {
          ...form, declaracion: declaration, privacidad: { version: PRIVACY_VERSION, datos: declaration.documentada, correoResultados: false, seguimiento: false },
          ap, bp, di, dd,
          indiceCraneal: resultado.indiceCraneal,
          indiceAsimetria: resultado.indiceAsimetria,
          diagnostico: [resultado.diagCraneal, resultado.diagAsim].filter(Boolean).join(" + "),
          recomendacion: resultado.recomendacion,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No se pudo guardar")
      mostrarToast("Evaluación guardada como borrador. Ya puedes revisarla.")
      setSavedId(data.evaluacionId)
      if (atencion) setGuardada(true)
      else setForm(initial)
    } catch (error) {
      mostrarToast(error instanceof Error ? error.message : "Error al guardar. Intenta de nuevo.")
    } finally {
      setGuardando(false)
      inFlight.current = false
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-7">
      {savedId && <section className="mb-5 space-y-3 rounded-xl border border-teal-300 p-4"><p role="status">Borrador guardado. Revisa el resultado antes de publicarlo para la familia.</p><Link href={`/kinesiologia/resultados/${savedId}`} className="inline-block rounded-lg bg-teal-700 px-5 py-3 text-white">Revisar y publicar resultado</Link></section>}
      {atencion && <section className="mb-6 space-y-3 rounded-xl border border-teal-300 p-4"><h1 className="text-xl font-semibold">Craneometría · Inscripción N.º {String(atencion.numero).padStart(3, "0")}</h1><p>{atencion.evento.nombre}</p><p className="text-sm">Datos recuperados de la inscripción. Verifica el nombre del bebé antes de medir.</p>{guardada && <p role="status" className="font-medium text-teal-700 dark:text-teal-300">Evaluación guardada y atención finalizada.</p>}<Link href="/kinesiologia" className="inline-block underline">{guardada ? "Volver y llamar al siguiente bebé" : "Volver a mi atención"}</Link></section>}
      <fieldset disabled={guardando || guardada} className="min-w-0">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <ellipse cx="8" cy="8" rx="6" ry="4.5" stroke="white" strokeWidth="1.5"/>
              <line x1="2" y1="8" x2="14" y2="8" stroke="white" strokeWidth="1.3"/>
              <line x1="8" y1="3.5" x2="8" y2="12.5" stroke="white" strokeWidth="1.3"/>
            </svg>
          </div>
          <span className="font-semibold text-base">Casku</span>
        </div>
        <span className="text-xs font-medium text-gray-500 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1 uppercase tracking-wide">
          Kinesióloga
        </span>
      </div>

      {/* Datos paciente */}
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Datos del paciente</p>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-500">Nombre completo</label>
            <input className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition" placeholder="Nombre del bebé" readOnly={Boolean(atencion)} value={form.nombre} onChange={e => set("nombre", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-500">RUT del paciente</label>
            <input className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition" placeholder={atencion ? "Sin RUT registrado" : "12.345.678-9"} readOnly={Boolean(atencion)} value={form.rut} onChange={e => set("rut", e.target.value)} />
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-800" />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-500">Fecha de nacimiento</label>
            <input type="date" className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition" readOnly={Boolean(atencion)} value={form.fnac} onChange={e => set("fnac", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-500">Correo padre/madre</label>
            <input type="email" className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition" placeholder="correo@ejemplo.com" readOnly={Boolean(atencion)} value={form.correo} onChange={e => set("correo", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Medidas */}
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Medidas craneales (mm)</p>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "ap", label: "Anteroposterior" },
            { key: "bp", label: "Biparietal" },
            { key: "di", label: "Diagonal izquierda" },
            { key: "dd", label: "Diagonal derecha" },
          ].map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500">{label}</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 pr-10 text-sm font-mono outline-none focus:border-blue-500 transition"
                  placeholder="0.0"
                  value={form[key as keyof typeof form]}
                  onChange={e => set(key, e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-mono">mm</span>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 dark:border-gray-800" />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-500">Nombre kinesióloga</label>
          <input className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition" placeholder="Tu nombre" value={profesional} readOnly aria-label="Profesional de la sesión" />
        </div>
      </div>

      {/* Resultado */}
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Resultado</p>
      <div className={`bg-white dark:bg-gray-900 border rounded-xl mb-5 overflow-hidden transition-colors ${resultado ? "border-blue-400" : "border-gray-200 dark:border-gray-800"}`}>
        <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${resultado ? "bg-blue-500 animate-pulse" : "bg-gray-300"}`} />
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Calculando en tiempo real</span>
        </div>
        <div className="p-5">
          {!resultado ? (
            <div className="flex flex-col items-center gap-2 py-5 text-gray-300 dark:text-gray-600">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <ellipse cx="18" cy="18" rx="13" ry="10" stroke="currentColor" strokeWidth="2"/>
                <line x1="5" y1="18" x2="31" y2="18" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="18" y1="8" x2="18" y2="28" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <p className="text-sm">Ingresa las 4 medidas para ver el diagnóstico</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className={`font-mono text-2xl font-medium tabular-nums ${colorVal[resultado.severidad]}`}>
                    {resultado.indiceCraneal.toFixed(1)}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-gray-400 mt-1">Índice craneal</p>
                </div>
                <div className={`bg-gray-50 dark:bg-gray-800 rounded-lg p-3`}>
                  <p className={`font-mono text-2xl font-medium tabular-nums ${resultado.indiceAsimetria >= 6 ? colorVal[resultado.severidad] : "text-gray-700 dark:text-gray-200"}`}>
                    {resultado.indiceAsimetria.toFixed(1)}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-gray-400 mt-1">Asimetría (mm)</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${colorChip[resultado.severidad]}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {resultado.diagCraneal}
                </span>
                {resultado.diagAsim && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${resultado.indiceAsimetria >= 12 ? colorChip["moderado"] : colorChip["leve"]}`}>                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {resultado.diagAsim}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">{resultado.recomendacion}</p>
            </div>
          )}
        </div>
      </div>

      {/* Botones */}
      <div className="flex gap-3">
        <button onClick={() => setForm(initial)} className="border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 px-4 py-2.5 rounded-lg text-sm font-medium hover:border-gray-400 transition">
          {atencion ? "Limpiar medidas" : "Limpiar"}
        </button>
        {!atencion && <PaperPrivacy value={declaration} onChange={setDeclaration} disabled={guardando} />}
        <button onClick={guardar} disabled={guardando} className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2">
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
    </div>
  )
}
