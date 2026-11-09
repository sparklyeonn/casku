import { parseEventId } from "../events/input.ts"

export class ReceptionInputError extends Error {}
export function parseLookup(value: unknown) {
  if (typeof value !== "string" || value.length > 100) throw new ReceptionInputError("Ingresa un número de inscripción o un QR de Casku.")
  const text = value.trim()
  if (/^\d{1,6}$/.test(text) && Number(text) > 0 && Number(text) <= 100000) return { numero: Number(text) }
  const match = /^CASKU:INSCRIPCION:([A-Za-z0-9_-]{32})$/.exec(text)
  if (match) return { qrToken: match[1] }
  throw new ReceptionInputError("El dato no corresponde a un número ni a un QR de inscripción de Casku.")
}
export function receptionInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReceptionInputError("Revisa los datos enviados.")
  const data = value as Record<string, unknown>
  return { data, eventoId: parseEventId(data.eventoId) }
}
export function parseCursor(value: string | null) {
  if (value === null) return 0
  if (!/^\d{1,6}$/.test(value) || Number(value) > 100000) throw new ReceptionInputError("La página de la fila no es válida.")
  return Number(value)
}
