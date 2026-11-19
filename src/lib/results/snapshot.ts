export type ResultSnapshot = {
  nombreBebe: string; fechaNacimiento: string; profesional: string; evento: string | null; numero: number | null; fechaEvaluacion: string;
  medidas: { ap: number; bp: number; di: number; dd: number; perimetro?: number; desviacionDer?: number; desviacionIzq?: number }; indiceCraneal: number; indiceAsimetria: number; diagnostico: string; recomendacion: string;
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
  const extra: {perimetro?:number;desviacionDer?:number;desviacionIzq?:number} = {}
  if (["perimetro","desviacionDer","desviacionIzq"].some(key=>measures[key]!==undefined)) {
    if ((measures.perimetro!==undefined&&(typeof measures.perimetro!=="number"||!Number.isFinite(measures.perimetro)||measures.perimetro<=0))||![measures.desviacionDer,measures.desviacionIzq].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0)) throw new Error("Resultado no disponible")
    Object.assign(extra,{...(measures.perimetro===undefined?{}:{perimetro:measures.perimetro}),desviacionDer:measures.desviacionDer,desviacionIzq:measures.desviacionIzq})
  }
  // Construir una lista explícita evita devolver campos añadidos accidentalmente al JSON.
  return { nombreBebe: String(row.nombreBebe), fechaNacimiento: String(row.fechaNacimiento), profesional: String(row.profesional), evento: row.evento as string | null, numero: row.numero as number | null, fechaEvaluacion: String(row.fechaEvaluacion), medidas: { ap: Number(measures.ap), bp: Number(measures.bp), di: Number(measures.di), dd: Number(measures.dd), ...extra }, indiceCraneal: Number(row.indiceCraneal), indiceAsimetria: Number(row.indiceAsimetria), diagnostico: String(row.diagnostico), recomendacion: String(row.recomendacion) }
}
