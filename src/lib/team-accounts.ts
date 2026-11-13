import { createHash } from "node:crypto"
import { isRole, type Role } from "./roles.ts"
export type TeamAccount = { id: string; email: string; name: string; role: Role; passwordHash: string; active: boolean; mustChangePassword?:boolean }
export function parseTeamAccounts(raw: string | undefined): TeamAccount[] {
  if (!raw) return []
  let values: unknown
  try { values = JSON.parse(raw) } catch { throw new Error("CASKU_TEAM_ACCOUNTS no contiene JSON válido.") }
  if (!Array.isArray(values)) throw new Error("CASKU_TEAM_ACCOUNTS debe ser una lista.")
  const ids = new Set<string>(), emails = new Set<string>()
  return values.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Cuenta del equipo inválida.")
    const a = value as Record<string, unknown>
    if (typeof a.id !== "string" || !a.id || typeof a.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email) || typeof a.name !== "string" || !a.name.trim() ||
      !isRole(a.role) || typeof a.passwordHash !== "string" || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(a.passwordHash) ||
      typeof a.active !== "boolean") throw new Error("Faltan datos o permisos válidos en una cuenta del equipo.")
    if(a.mustChangePassword!==undefined&&typeof a.mustChangePassword!=="boolean")throw new Error("Marca de contraseña temporal inválida.")
    const email = a.email.toLowerCase().trim()
    if (ids.has(a.id) || emails.has(email)) throw new Error("Hay cuentas del equipo duplicadas.")
    ids.add(a.id); emails.add(email)
    return { id: a.id, email, name: a.name.trim(), role: a.role, passwordHash: a.passwordHash, active: a.active,...(typeof a.mustChangePassword==="boolean"?{mustChangePassword:a.mustChangePassword}:{}) }
  })
}
export const getTeamAccounts = () => parseTeamAccounts(process.env.CASKU_TEAM_ACCOUNTS)
export const accountRevision = (a: TeamAccount) => createHash("sha256").update(`${a.id}:${a.role}:${a.passwordHash}`).digest("hex")
