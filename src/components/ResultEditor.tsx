"use client"
import { evaluationOriginLabel } from "@/lib/evaluation-context"
import { useRef, useState } from "react"
import Link from "next/link"
import { publicationProblem } from "@/lib/results/protocol"
import { resultEditorState, resultResponse } from "@/lib/results/editor-state"
import { measurementForm } from "@/lib/measurement-fields"
import { MeasurementFields } from "./MeasurementFields"
import type { ResultReview } from "@/lib/results/store"
import { PublishedResultActions } from "./PublishedResultActions"
import { ResultCard } from "./ResultCard"
import { ResultContactMail } from "./ResultContactMail"
import { ResultMailPanel } from "./ResultMailPanel"
const formValues = (row: ResultReview) => measurementForm(row.datos.medidas)
export function ResultEditor({ initial }: { initial: ResultReview }) {
  const [row, setRow] = useState(initial), [form, setForm] = useState(formValues(initial))
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("")
  const inFlight = useRef(false)
  const [needsReload, setNeedsReload] = useState(false)
  const { measures, changed, valid, calculated, error: measurementError, legacyFour, recapture } = resultEditorState(row.datos.medidas, form, !row.publicacion)
  const preview = calculated && !row.publicacion ? { ...row.datos, medidas: measures, indiceCraneal: calculated.indiceCraneal, indiceAsimetria: calculated.indiceAsimetria, diagnostico: calculated.diagnostico, recomendacion: calculated.recomendacion } : row.datos
  const publishProblem = publicationProblem(row.datos)
  async function request(action: "save" | "publish" | "reload") {
    if (inFlight.current || (needsReload && action !== "reload")) return
    if (action !== "reload" && (!valid || (action === "publish" && (changed || !row.publicable || !!publishProblem)))) return
    inFlight.current = true; setBusy(true); setError(""); setMessage("")
    try {
      const response = await fetch(`/api/kinesiologia/resultados/${row.id}${action === "publish" ? "/publicar" : ""}`, action === "reload" ? { cache: "no-store" } : { method: action === "save" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "save" ? { revision: row.revision, ...measures } : { revision: row.revision }) })
      const data = await resultResponse(response)
      setNeedsReload(false)
      setRow(data.resultado); setForm(formValues(data.resultado))
      setMessage(action === "publish" ? (data.aviso || "Resultado publicado para la familia. La publicación no confirma el envío: consulta el estado del correo más abajo.") : action === "save" ? "Borrador guardado. Los índices y la recomendación se recalcularon en el servidor." : "Cargamos la versión guardada.")
    } catch (cause) {
      if (action !== "reload") setNeedsReload(true)
      setError(cause instanceof Error ? cause.message : "No pudimos conectar. Consulta el estado guardado antes de continuar.")
    }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <main aria-busy={busy} className="mx-auto max-w-3xl space-y-6 px-5 py-8"><Link href="/kinesiologia/resultados" className="underline">Volver a mis resultados</Link><div><h1 className="mt-4 text-3xl font-semibold">{row.publicacion ? row.publicacion.estado==="RETIRADO"?"Resultado retirado":"Resultado publicado" : "Revisar resultado"}</h1><p className="mt-3">{row.publicacion ? "La publicación conserva cada versión revisada. Puedes corregirla o retirarla con un motivo." : "Comprueba las medidas y el resultado antes de habilitarlo para la familia."}</p></div>{error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}{message && <p role="status" className="rounded-lg bg-teal-50 p-4 text-teal-900 dark:bg-teal-950 dark:text-teal-100">{message}</p>}
    {!row.publicacion && <section className="space-y-4 rounded-xl border p-5"><h2 className="text-xl font-semibold">Medidas guardadas · Revisión {row.revision}</h2><fieldset disabled={busy || needsReload} aria-describedby="draft-help" className="space-y-4"><legend className="sr-only">Editar medidas del borrador</legend><MeasurementFields value={form} onChange={(key,value)=>setForm(previous=>({...previous,[key]:value}))} /></fieldset><p id="draft-help" className="text-sm">Puedes editar y guardar el borrador aunque la vinculación familiar esté pendiente. No se envía correo al guardar.</p>{legacyFour && <p className="text-sm">Borrador histórico de cuatro medidas: puedes editarlo y guardarlo conservando ese protocolo. Completa ambas distancias POE–trago solo si se han vuelto a medir y deseas adoptar v2.</p>}{recapture && <p className="text-sm">Registro histórico: conserva su resultado guardado. Para editar y publicar con el protocolo v2, recaptura ambas distancias completas POE–trago. Las desviaciones anteriores no son esas distancias; no las copies ni completes valores que no se midieron.</p>}{!valid && <p role="alert">{measurementError} Se muestra el resultado guardado hasta completar medidas válidas.</p>}{changed && <p className="text-sm text-amber-800 dark:text-amber-200">{calculated ? "Vista previa con cambios sin guardar. Guarda antes de publicar." : "Hay cambios sin guardar. La ficha muestra el resultado guardado; completa las medidas antes de guardar."}</p>}<div className="flex flex-wrap gap-3"><button type="button" disabled={busy || needsReload || !valid} onClick={() => request("save")} className="rounded-lg border px-4 py-2 disabled:opacity-50">Guardar cambios del borrador</button><button type="button" disabled={busy} onClick={() => request("reload")} className="rounded-lg border px-4 py-2 disabled:opacity-50">Recargar versión guardada</button></div></section>}
    {needsReload && <section role="status" className="rounded border border-amber-500 p-4"><p>Consulta el estado guardado antes de continuar: la solicitud pudo haberse aplicado o los permisos pudieron cambiar. Copia tus cambios pendientes antes de recargar; se reemplazarán por lo guardado.</p><button type="button" disabled={busy} onClick={() => request("reload")} className="mt-3 rounded border px-4 py-3">Consultar estado guardado</button></section>}
    {!row.publicacion&&!row.publicable&&<ResultContactMail key={`${row.id}:${row.revision}`} id={row.id} revision={row.revision} disabled={busy||changed||needsReload} onStart={()=>{if(inFlight.current)return false;inFlight.current=true;setBusy(true);return true}} onFinish={()=>{inFlight.current=false;setBusy(false)}}/>}
    {row.publicacion?.estado==="RETIRADO"&&<p role="status" className="rounded border border-amber-500 p-4">Copia histórica retirada. No debe utilizarse como resultado vigente y no es visible clínicamente para la familia.</p>}
    <p className="text-sm">Origen: {evaluationOriginLabel(row.origen)}</p>
    <ResultCard data={preview} publicadoAt={row.publicacion?.publicadoAt} />
    {row.publicacion&&<PublishedResultActions key={row.publicacion.id} row={row} disabled={busy} onStart={()=>{if(inFlight.current)return false;inFlight.current=true;setBusy(true);return true}} onFinish={()=>{inFlight.current=false;setBusy(false)}} onChanged={value=>{setRow(value);setForm(formValues(value))}}/>}
    {!row.publicacion ? <section className="space-y-4 rounded-xl border p-5"><h2 className="text-xl font-semibold">{row.publicable ? "Publicar para la familia" : "Cuenta familiar (opcional)"}</h2>{row.publicable ? <p>La familia podrá ver este resultado en su cuenta. El correo depende de su autorización específica y de la configuración de envío. Destinatario verificado: <strong className="break-all">{row.correoDestino}</strong>.</p> : <p className="text-amber-800 dark:text-amber-200">{row.motivoBloqueo}{row.motivoBloqueo !== publishProblem && <> La vinculación es necesaria para mostrar el resultado dentro de una cuenta familiar. Puedes enviar una copia autorizada sin crear una cuenta desde el bloque anterior. Si después vinculan su cuenta, recarga el estado guardado.</>}</p>}<p id="publish-help" className="text-sm">{changed ? "Guarda los cambios antes de publicar." : !valid ? "Corrige las medidas antes de publicar." : publishProblem || "Publicar conserva una copia revisada. Los cambios posteriores requieren una nueva versión."}</p><button type="button" aria-describedby="publish-help" disabled={busy || needsReload || changed || !valid || !row.publicable || !!publishProblem} onClick={() => request("publish")} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy ? "Procesando…" : "Publicar resultado y solicitar correo autorizado"}</button></section> : row.publicacion.estado==="RETIRADO"?null:<ResultMailPanel retryAllowed={row.publicacion.version === 1} disabled={busy} key={`${row.publicacion.id}:${row.publicacion.correo.estado}:${row.publicacion.correo.reintentarDesde}`} initial={row.publicacion.correo} endpoint={`/api/kinesiologia/resultados/${row.id}/correo`} />}
  </main>
}
