import { parseMeasurements } from "../evaluation-input.ts"
import { measurementForm, measurementValues, validMeasurements, type MeasurementForm, type MeasurementValues } from "../measurement-fields.ts"
import { REFERENCE_VERSION } from "../craneometry-reference.ts"

// A failed preview must never make the saved draft inaccessible.
export function draftCalculation(measures: MeasurementValues) {
  try { return { calculated: parseMeasurements(measures), error: "" } }
  catch (cause) { return { calculated: null, error: cause instanceof Error ? cause.message : "Revisa las mediciones antes de guardar." } }
}

export async function resultResponse(response: Response) {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const fallback = response.status === 401 ? "Tu sesión venció. Vuelve a ingresar antes de continuar." : response.status === 409 ? "El resultado o sus permisos cambiaron. Recarga el estado guardado antes de continuar." : "No pudimos confirmar la operación. Consulta el estado guardado antes de reintentar."
    throw new Error(typeof data?.error === "string" ? data.error : fallback)
  }
  if (!data?.resultado?.id || !data.resultado.datos?.medidas) throw new Error("No pudimos confirmar el resultado. Consulta el estado guardado antes de continuar.")
  return data
}

export function resultEditorState(saved: MeasurementValues, form: MeasurementForm, calculate = true) {
  const baseline = measurementForm(saved)
  const changed = (Object.keys(baseline) as Array<keyof MeasurementForm>).some(key => {
    const before = baseline[key] ?? "", after = form[key] ?? ""
    return before === "" || after === "" ? before !== after : !Object.is(Number(before), Number(after))
  })
  const legacyFour = saved.protocolo === undefined && [saved.desviacionDer, saved.desviacionIzq, saved.distanciaPOEtragusDer, saved.distanciaPOEtragusIzq, saved.perimetro].every(value => value === undefined)
  // Only a four-measure draft can retain the four-measure protocol. Never downgrade six measurements.
  const keepFour = legacyFour && form.distanciaPOEtragusDer === "" && form.distanciaPOEtragusIzq === ""
  const measures: MeasurementValues = keepFour ? { ap: Number(form.ap), bp: Number(form.bp), di: Number(form.di), dd: Number(form.dd) } : measurementValues(form)
  const inputValid = validMeasurements(measures, !keepFour)
  const calculation = inputValid && changed && calculate ? draftCalculation(measures) : { calculated: null, error: "" }
  const valid = inputValid && !calculation.error
  const recapture = !legacyFour && saved.protocolo !== REFERENCE_VERSION
  const error = calculation.error || (!inputValid ? keepFour ? "Completa las cuatro medidas históricas con valores positivos en milímetros." : "Completa las seis medidas positivas, incluidas ambas distancias completas POE–trago. No copies las desviaciones históricas." : "")
  return { measures, changed, valid, calculated: calculation.calculated, error, legacyFour, recapture, keepFour }
}
