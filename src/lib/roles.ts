export const roles = ["KINESIOLOGO", "RECEPCION", "ADMIN"] as const
export type Role = typeof roles[number]
export const roleLabels: Record<Role, string> = { KINESIOLOGO: "Kinesiología", RECEPCION: "Recepción", ADMIN: "Administración Casku" }
export const roleHomes: Record<Role, string> = { KINESIOLOGO: "/kinesiologia", RECEPCION: "/recepcion", ADMIN: "/administracion" }
export function isRole(value: unknown): value is Role { return roles.some(role => role === value) }
export function canEvaluate(role: unknown) { return role === "KINESIOLOGO" }
