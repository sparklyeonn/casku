// Referencia literal del PDF de Casku; los intervalos ambiguos no se interpolan.
export type CompleteMeasurements = { ap: number; bp: number; di: number; dd: number; perimetro?: number; desviacionDer: number; desviacionIzq: number }
export const REFERENCE_VERSION = "casku-pdf-borrador-v1" as const
const levels = ["Normal", "Leve", "Moderada", "Severa", "Muy severa"] as const
export function referenceCVA(value: number) {
  if (value < 3) return levels[0]
  if (value <= 6) return levels[1]
  if (value >= 7 && value <= 12) return levels[2]
  if (value >= 13 && value <= 18) return levels[3]
  if (value > 18) return levels[4]
  return "Límite decimal por confirmar"
}
export function referenceDPOE(value: number) {
  if ([5, 10, 15].includes(value)) return "Límite compartido por confirmar"
  return levels[value < 5 ? 0 : value < 10 ? 1 : value < 15 ? 2 : value <= 20 ? 3 : 4]
}
export function referenceCI(value: number) {
  if (value >= 76 && value <= 83) return "Proporción normal"
  if (value >= 84 && value <= 87) return "Braquicefalia leve"
  if (value >= 88 && value <= 92) return "Braquicefalia moderada"
  if (value >= 93 && value <= 97) return "Braquicefalia severa"
  if (value > 97) return "Braquicefalia muy severa"
  if (value >= 72 && value <= 75) return "Dolicocefalia leve"
  if (value >= 67 && value <= 71) return "Dolicocefalia moderada"
  if (value >= 62 && value <= 66) return "Dolicocefalia severa"
  if (value < 62) return "Dolicocefalia muy severa"
  return "Límite por confirmar con Casku"
}
export function calcularReferencia(m: CompleteMeasurements) {
  if (![m.ap,m.bp,m.di,m.dd].every(v=>Number.isFinite(v)&&v>0) || ![m.desviacionDer,m.desviacionIzq].every(v=>Number.isFinite(v)&&v>=0)) throw new Error("Mediciones inválidas")
  const ci=m.bp/m.ap*100, cva=Math.abs(m.di-m.dd), dpoe=Math.max(m.desviacionDer,m.desviacionIzq)
  if (ci<=0 || ![ci,cva,dpoe,cva/Math.min(m.di,m.dd)*100].every(Number.isFinite)) throw new Error("Índice fuera de rango")
  return { version:REFERENCE_VERSION, ci, cva, dpoe, cvai:null, forma:referenceCI(ci), clasificacionCVA:referenceCVA(cva), clasificacionDPOE:referenceDPOE(dpoe),
    diagnostico:`Orientación preliminar: ${referenceCI(ci)}. Plagiocefalia: CVA ${referenceCVA(cva).toLowerCase()}; DPOE ${referenceDPOE(dpoe).toLowerCase()}. CVAI y clasificación conjunta pendientes de confirmación clínica.`,
    recomendacion:"Pendiente de revisión por la profesional y confirmación del protocolo de Casku. Los indicadores se muestran por separado; esta referencia no determina automáticamente tratamiento ni indicación de casco." }
}
