import { isRole } from "../roles.ts"
import { normalizeEmail } from "../families/input.ts"
import { parseEventId } from "../events/input.ts"
export class TeamInputError extends Error {}
export function accountId(value: unknown) {
  if (typeof value !== "string" || !value || value.length > 128 || /[\s/\x00-\x1f]/.test(value) || value.startsWith("familia:")) throw new TeamInputError("Cuenta inválida.")
  return value
}
export function accountInput(value: unknown, create: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TeamInputError("Revisa los datos de la cuenta.")
  const row = value as Record<string, unknown>
  const name = typeof row.name === "string" ? row.name.trim().replace(/\s+/g, " ") : ""
  if (!name || name.length > 120) throw new TeamInputError("El nombre debe tener entre 1 y 120 caracteres.")
  if (!isRole(row.role) || typeof row.active !== "boolean") throw new TeamInputError("Selecciona un perfil y estado válidos.")
  if (create && !row.active) throw new TeamInputError("Las cuentas nuevas se crean activas.")
  const password = row.password === undefined ? "" : row.password
  if (typeof password !== "string" || ((create || password !== "") && (password.length < 12 || password.length > 128))) throw new TeamInputError("La contraseña debe tener entre 12 y 128 caracteres.")
  if (!create && (!Number.isSafeInteger(row.version) || Number(row.version) < 1)) throw new TeamInputError("Actualiza la cuenta antes de guardar.")
  return { id: create ? parseEventId(row.id) : undefined, email: normalizeEmail(row.email), name, role: row.role, active: row.active, password, version: create ? undefined : Number(row.version) }
}
