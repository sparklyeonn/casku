import { InvalidEvaluation } from "../evaluation-input.ts"
export function evaluationId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new InvalidEvaluation("Selecciona una evaluación válida.")
  return value
}
export function resultRevision(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value >= 2147483647) throw new InvalidEvaluation("La revisión de la evaluación no es válida. Actualiza la pantalla.")
  return value
}
export function resultPage(value: string | null | undefined) {
  if (value === undefined || value === null) return 1
  if (!/^[1-9]\d{0,3}$/.test(value) || Number(value) > 5000) throw new InvalidEvaluation("La página de resultados no es válida.")
  return Number(value)
}
export function familyResultPath(value: unknown) {
  if (value === "lista") return "/familias/resultados"
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) return null
  return `/familias/resultados/${value.toLowerCase()}`
}
