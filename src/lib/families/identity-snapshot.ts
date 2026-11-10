export function mailFamily(nombreBebe: string, correo: string | null, conCuenta: boolean) { return { nombreBebe, correo, conCuenta } }
export function readMailFamily(value: unknown): ReturnType<typeof mailFamily> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Comprobante sin identidad")
  const row = value as Record<string, unknown>
  if (typeof row.nombreBebe !== "string" || (row.correo !== null && typeof row.correo !== "string") || typeof row.conCuenta !== "boolean") throw new Error("Comprobante con identidad inválida")
  return { nombreBebe: row.nombreBebe, correo: row.correo, conCuenta: row.conCuenta }
}
