import { LEGACY_REFERENCE_VERSION, REFERENCE_VERSION } from "../craneometry-reference.ts"
import { readComplementaryValues, type MeasurementValues } from "../measurement-fields.ts"
export type ResultSnapshot = {
  nombreBebe: string; fechaNacimiento: string; profesional: string; evento: string | null; numero: number | null; fechaEvaluacion: string;
  medidas: MeasurementValues; indiceCraneal: number; indiceAsimetria: number; diagnostico: string; recomendacion: string;
}
export function parseSnapshot(value: unknown): ResultSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Resultado no disponible")
  const row = value as Record<string, unknown>, measures = row.medidas as Record<string, unknown> | undefined
  for (const key of ["nombreBebe", "fechaNacimiento", "profesional", "fechaEvaluacion", "diagnostico", "recomendacion"]) if (typeof row[key] !== "string" || !row[key]) throw new Error("Resultado no disponible")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.fechaNacimiento)) || !Number.isFinite(Date.parse(String(row.fechaEvaluacion)))) throw new Error("Resultado no disponible")
  const birth = new Date(`${row.fechaNacimiento}T00:00:00Z`)
  if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== row.fechaNacimiento) throw new Error("Resultado no disponible")
  if (!(row.evento === null || typeof row.evento === "string") || !(row.numero === null || (Number.isSafeInteger(row.numero) && Number(row.numero) > 0))) throw new Error("Resultado no disponible")
  if (!measures || typeof measures !== "object" || !["ap", "bp", "di", "dd"].every(key => typeof measures[key] === "number" && Number.isFinite(measures[key]) && Number(measures[key]) > 0)) throw new Error("Resultado no disponible")
  if (![row.indiceCraneal, row.indiceAsimetria].every(number => typeof number === "number" && Number.isFinite(number))) throw new Error("Resultado no disponible")
  if (Number(row.indiceCraneal) <= 0 || Number(row.indiceAsimetria) < 0) throw new Error("Resultado no disponible")
  let extra: Omit<MeasurementValues,"ap"|"bp"|"di"|"dd"> = {}
  if (["perimetro","desviacionDer","desviacionIzq","distanciaPOEtragusDer","distanciaPOEtragusIzq","protocolo"].some(key=>measures[key]!==undefined)) {
    const hasDistances=measures.distanciaPOEtragusDer!==undefined||measures.distanciaPOEtragusIzq!==undefined
    if(hasDistances&&measures.protocolo!==REFERENCE_VERSION)throw new Error("Resultado no disponible")
    const values=readComplementaryValues({...measures,protocolo:measures.protocolo??LEGACY_REFERENCE_VERSION})
    // Las copias sin versión siguen sin versión. Nunca recalcular diagnósticos ni indicadores al leer.
    if(measures.protocolo===undefined) {
      const {protocolo:version,...historical}=values
      void version
      extra=historical
    } else extra=values
  }
  // Construir una lista explícita evita devolver campos añadidos accidentalmente al JSON.
  return { nombreBebe: String(row.nombreBebe), fechaNacimiento: String(row.fechaNacimiento), profesional: String(row.profesional), evento: row.evento as string | null, numero: row.numero as number | null, fechaEvaluacion: String(row.fechaEvaluacion), medidas: { ap: Number(measures.ap), bp: Number(measures.bp), di: Number(measures.di), dd: Number(measures.dd), ...extra }, indiceCraneal: Number(row.indiceCraneal), indiceAsimetria: Number(row.indiceAsimetria), diagnostico: String(row.diagnostico), recomendacion: String(row.recomendacion) }
}
