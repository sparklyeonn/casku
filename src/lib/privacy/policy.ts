export const PRIVACY_VERSION = "2026-11-11.1"
export const PRIVACY_TEXT = {
  datos: "Declaro ser el apoderado o representante del bebé y autorizo a Casku a registrar sus datos y mediciones, realizar la evaluación y conservar su resultado e historial. La cuenta familiar verá sus resultados publicados; recepción gestionará la inscripción y el equipo clínico autorizado realizará la atención.",
  correoResultados: "Autorizo recibir los resultados publicados de esta evaluación en mi correo verificado. Es opcional; si no acepto, podré consultarlos en mi cuenta.",
  seguimiento: "Autorizo los correos de seguimiento de esta evaluación, previstos a la semana y al mes, con resultados e indicaciones revisadas por la profesional. Puedo retirar esta autorización sin perder el acceso a los resultados ya publicados.",
} as const
export type PrivacyChoice = { version: string; datos: boolean; correoResultados: boolean; seguimiento: boolean }
export const emptyPrivacy: PrivacyChoice = { version: PRIVACY_VERSION, datos: false, correoResultados: false, seguimiento: false }
export class PrivacyInputError extends Error {}
export function parsePrivacy(value: unknown, requireData = true): PrivacyChoice {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PrivacyInputError("Revisa las autorizaciones de privacidad antes de continuar.")
  const row = value as Record<string, unknown>
  if (row.version !== PRIVACY_VERSION) throw new PrivacyInputError("Los textos de privacidad cambiaron. Actualiza la pantalla y vuelve a revisarlos.")
  if ([row.datos, row.correoResultados, row.seguimiento].some(value => typeof value !== "boolean")) throw new PrivacyInputError("Indica expresamente tus opciones de privacidad.")
  if (requireData && row.datos !== true) throw new PrivacyInputError("Se requiere la autorización para registrar los datos y realizar la evaluación.")
  if ((!row.datos && (row.correoResultados || row.seguimiento)) || (!row.correoResultados && row.seguimiento)) throw new PrivacyInputError("El seguimiento requiere autorización para los datos y para recibir resultados por correo.")
  return { version: PRIVACY_VERSION, datos: row.datos as boolean, correoResultados: row.correoResultados as boolean, seguimiento: row.seguimiento as boolean }
}
export function paperDeclaration(value: unknown) {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const text = (key: string, max: number) => typeof row[key] === "string" && String(row[key]).length <= max ? String(row[key]).trim().replace(/\s+/g, " ") : ""
  const declarante = text("declarante",120), referencia = text("referencia",100)
  if (row.documentada !== true || declarante.length < 3 || declarante.length > 120 || referencia.length < 3 || referencia.length > 100) throw new PrivacyInputError("Identifica al apoderado y la referencia de su autorización documentada. No basta con marcar una casilla por la familia.")
  return { declarante, referencia }
}
