"use client"
import { useRef, useState } from "react"
import Link from "next/link"
import { calcularDiagnostico } from "@/lib/craneometria"
import type { ResultReview } from "@/lib/results/store"
import { PublishedResultActions } from "./PublishedResultActions"
import { ResultCard } from "./ResultCard"
import { ResultMailPanel } from "./ResultMailPanel"
const formValues = (row: ResultReview) => ({ ap: String(row.datos.medidas.ap), bp: String(row.datos.medidas.bp), di: String(row.datos.medidas.di), dd: String(row.datos.medidas.dd) })
export function ResultEditor({ initial }: { initial: ResultReview }) {
  const [row, setRow] = useState(initial), [form, setForm] = useState(formValues(initial))
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("")
  const inFlight = useRef(false)
  const measures = { ap: Number(form.ap), bp: Number(form.bp), di: Number(form.di), dd: Number(form.dd) }
  const valid = Object.values(measures).every(value => Number.isFinite(value) && value > 0)
  const changed = (Object.keys(measures) as Array<keyof typeof measures>).some(key => measures[key] !== row.datos.medidas[key])
  const calculated = valid && changed ? calcularDiagnostico(measures.ap, measures.bp, measures.di, measures.dd) : null
  const preview = calculated && !row.publicacion ? { ...row.datos, medidas: measures, indiceCraneal: calculated.indiceCraneal, indiceAsimetria: calculated.indiceAsimetria, diagnostico: [calculated.diagCraneal, calculated.diagAsim].filter(Boolean).join(" + "), recomendacion: calculated.recomendacion } : row.datos
  async function request(action: "save" | "publish" | "reload") {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(""); setMessage("")
    try {
      const response = await fetch(`/api/kinesiologia/resultados/${row.id}${action === "publish" ? "/publicar" : ""}`, action === "reload" ? { cache: "no-store" } : { method: action === "save" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "save" ? { revision: row.revision, ...measures } : { revision: row.revision }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No pudimos completar la operación.")
      setRow(data.resultado); setForm(formValues(data.resultado))
      setMessage(action === "publish" ? "Resultado publicado para la familia. Puedes consultar el estado del correo más abajo." : action === "save" ? "Borrador guardado. Los índices y la recomendación se recalcularon en el servidor." : "Cargamos la versión guardada.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos conectar.") }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <main className="mx-auto max-w-3xl space-y-6 px-5 py-8"><Link href="/kinesiologia/resultados" className="underline">Volver a mis resultados</Link><div><h1 className="mt-4 text-3xl font-semibold">{row.publicacion ? row.publicacion.estado==="RETIRADO"?"Resultado retirado":"Resultado publicado" : "Revisar resultado"}</h1><p className="mt-3">{row.publicacion ? "La publicación conserva cada versión revisada. Puedes corregirla o retirarla con un motivo." : "Comprueba las medidas y el resultado antes de habilitarlo para la familia."}</p></div>{error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}{message && <p role="status" className="rounded-lg bg-teal-50 p-4 text-teal-900 dark:bg-teal-950 dark:text-teal-100">{message}</p>}
    {!row.publicacion && <section className="space-y-4 rounded-xl border p-5"><h2 className="text-xl font-semibold">Medidas guardadas · Revisión {row.revision}</h2><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">{([{ key: "ap", label: "Anteroposterior" }, { key: "bp", label: "Biparietal" }, { key: "di", label: "Diagonal izquierda" }, { key: "dd", label: "Diagonal derecha" }] as const).map(({ key, label }) => <label key={key} className="block text-sm">{label} (mm)<input className="mt-2 w-full rounded-lg border bg-white p-3 text-gray-900 dark:bg-gray-900 dark:text-gray-100" type="number" min="0.1" step="any" value={form[key]} onChange={e => setForm(previous => ({ ...previous, [key]: e.target.value }))} /></label>)}</fieldset>{changed && <p className="text-sm text-amber-800 dark:text-amber-200">Vista previa con cambios sin guardar. Guarda antes de publicar.</p>}<div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !valid} onClick={() => request("save")} className="rounded-lg border px-4 py-2 disabled:opacity-50">Guardar cambios del borrador</button><button type="button" disabled={busy} onClick={() => request("reload")} className="rounded-lg border px-4 py-2 disabled:opacity-50">Recargar versión guardada</button></div></section>}
    {row.publicacion?.estado==="RETIRADO"&&<p role="status" className="rounded border border-amber-500 p-4">Copia histórica retirada. No debe utilizarse como resultado vigente y no es visible clínicamente para la familia.</p>}
    <ResultCard data={preview} publicadoAt={row.publicacion?.publicadoAt} />
    {row.publicacion&&<PublishedResultActions key={row.publicacion.id} row={row} disabled={busy} onStart={()=>{if(inFlight.current)return false;inFlight.current=true;setBusy(true);return true}} onFinish={()=>{inFlight.current=false;setBusy(false)}} onChanged={value=>{setRow(value);setForm(formValues(value))}}/>}
    {!row.publicacion ? <section className="space-y-4 rounded-xl border p-5"><h2 className="text-xl font-semibold">Publicar para la familia</h2>{row.publicable ? <p>La familia podrá ver este resultado en su cuenta y se intentará enviar una copia a <strong className="break-all">{row.correoDestino}</strong>.</p> : <p className="text-amber-800 dark:text-amber-200">{row.motivoBloqueo} Recepción puede entregar el código de vinculación para que la familia lo acepte desde su cuenta verificada. Luego recarga la versión guardada.</p>}<button type="button" disabled={busy || changed || !valid || !row.publicable} onClick={() => request("publish")} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy ? "Procesando…" : "Publicar resultado y enviar correo"}</button></section> : row.publicacion.estado==="RETIRADO"?null:<ResultMailPanel disabled={busy} key={`${row.publicacion.id}:${row.publicacion.correo.estado}:${row.publicacion.correo.reintentarDesde}`} initial={row.publicacion.correo} endpoint={`/api/kinesiologia/resultados/${row.id}/correo`} />}
  </main>
}
