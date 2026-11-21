import { REFERENCE_VERSION } from "../craneometry-reference.ts"
import { parseMeasurements, InvalidEvaluation } from "../evaluation-input.ts"
import type { MeasurementValues } from "../measurement-fields.ts"
import type { ResultSnapshot } from "./snapshot.ts"
const measurementKeys = ["ap","bp","di","dd","perimetro","protocolo","distanciaPOEtragusDer","distanciaPOEtragusIzq","desviacionDer","desviacionIzq"] as const
export function sameMeasurements(a:MeasurementValues,b:MeasurementValues) {
  return measurementKeys.every(key=>a[key]===b[key])
}
export function legacyFour(m:MeasurementValues) {
  return [m.protocolo,m.perimetro,m.desviacionDer,m.desviacionIzq,m.distanciaPOEtragusDer,m.distanciaPOEtragusIzq].every(value=>value===undefined)
}
export function revisedMeasurements(previous:MeasurementValues,input:MeasurementValues) {
  // Cuatro medidas conservan su protocolo tanto en borradores como en correcciones publicadas.
  if(legacyFour(previous)&&legacyFour(input))return parseMeasurements(input)
  if(input.protocolo!==REFERENCE_VERSION)throw new InvalidEvaluation("Recaptura ambas distancias completas POE–trago y guarda con el protocolo v2. No se convierten las desviaciones históricas.")
  // Recalcular también aquí: los callers no pueden aportar índices o textos sin validar.
  return parseMeasurements({...input,...(input.perimetro===undefined&&previous.perimetro!==undefined?{perimetro:previous.perimetro}:{})})
}
export function publicationProblem(snapshot:ResultSnapshot):string|null {
  if(!legacyFour(snapshot.medidas)&&snapshot.medidas.protocolo!==REFERENCE_VERSION)return "Registro histórico: recaptura ambas distancias completas POE–trago y guarda el borrador con protocolo v2 antes de publicar."
  try {
    const checked=parseMeasurements(snapshot.medidas)
    if(snapshot.indiceCraneal!==checked.indiceCraneal||snapshot.indiceAsimetria!==checked.indiceAsimetria||snapshot.diagnostico!==checked.diagnostico||snapshot.recomendacion!==checked.recomendacion)return "Revisa y guarda las medidas antes de publicar este resultado."
  } catch {return "Completa y guarda ambas distancias completas POE–trago válidas del protocolo v2 antes de publicar."}
  return null
}
