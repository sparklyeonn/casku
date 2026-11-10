import { FamilyInputError, normalizeEmail } from "../families/input.ts"
import { parseEventId } from "../events/input.ts"
export const LINK_HOURS = 24
export function linkCode(value: unknown) {
  if (typeof value !== "string" || value.length > 100) throw new FamilyInputError("Ingresa el código de vinculación entregado en recepción.")
  const code = value.trim().replace(/^CASKU:VINCULACION:/, "")
  if (!/^[A-Za-z0-9_-]{22}$/.test(code)) throw new FamilyInputError("Revisa el código o escanea el QR de vinculación entregado por recepción.")
  return code
}
export function invitationInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FamilyInputError("Revisa los datos de la vinculación.")
  const row = value as Record<string, unknown>
  return { id: parseEventId(row.id), eventoId: parseEventId(row.eventoId), inscripcionId: parseEventId(row.inscripcionId), correo: normalizeEmail(row.correo) }
}
