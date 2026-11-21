// Los huecos decimales y límites compartidos se conservan sin interpolar.
export const LEGACY_REFERENCE_VERSION = "casku-pdf-borrador-v1" as const
export const REFERENCE_VERSION = "casku-craneometria-v2" as const
export type CompleteMeasurements = { ap:number; bp:number; di:number; dd:number; perimetro?:number; protocolo:typeof REFERENCE_VERSION; distanciaPOEtragusDer:number; distanciaPOEtragusIzq:number }
const levels = ["Normal", "Leve", "Moderada", "Severa", "Muy severa"] as const
export function referenceCVA(value: number) {
  if (value < 3) return levels[0]
  if (value <= 6) return levels[1]
  if (value >= 7 && value <= 12) return levels[2]
  if (value >= 13 && value <= 18) return levels[3]
  if (value > 18) return levels[4]
  return "Límite decimal por confirmar"
}
export function referenceCVAI(value: number) {
  if (value < 1.5) return levels[0]
  if (value <= 3.5) return levels[1]
  if (value >= 3.6 && value <= 6) return levels[2]
  if (value >= 6.1 && value <= 8) return levels[3]
  if (value > 8) return levels[4]
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
export const formatCI = (value:number) => new Intl.NumberFormat("es-CL", {minimumFractionDigits:1, maximumFractionDigits:1}).format(value)
export function calcularReferencia(m: CompleteMeasurements) {
  if (m.protocolo!==REFERENCE_VERSION || ![m.ap,m.bp,m.di,m.dd,m.distanciaPOEtragusDer,m.distanciaPOEtragusIzq].every(v=>Number.isFinite(v)&&v>0)) throw new Error("Recaptura las distancias POE–trago para el protocolo v2")
  const ci=m.bp/m.ap*100, cva=Math.abs(m.di-m.dd), cvai=cva/Math.max(m.di,m.dd)*100, dpoe=Math.abs(m.distanciaPOEtragusDer-m.distanciaPOEtragusIzq)
  if (ci<=0 || ![ci,cva,dpoe,cvai].every(Number.isFinite)) throw new Error("Índice fuera de rango")
  return { version:REFERENCE_VERSION, ci, cva, dpoe, cvai, forma:referenceCI(ci), clasificacionCVA:referenceCVA(cva), clasificacionCVAI:referenceCVAI(cvai), clasificacionDPOE:referenceDPOE(dpoe),
    diagnostico:`Orientación preliminar: ${referenceCI(ci)}. Plagiocefalia: CVA ${referenceCVA(cva).toLowerCase()}; CVAI ${referenceCVAI(cvai).toLowerCase()}; DPOE ${referenceDPOE(dpoe).toLowerCase()}. Clasificación conjunta pendiente de confirmación clínica.`,
    recomendacion:"Pendiente de revisión por la profesional. Los indicadores se muestran por separado; esta referencia no determina automáticamente tratamiento ni indicación de casco." }
}
