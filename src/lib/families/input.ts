import { parseEventId } from "../events/input.ts"

export class FamilyInputError extends Error {}
export function chileToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const value = (key: string) => parts.find(p => p.type === key)!.value
  return `${value("year")}-${value("month")}-${value("day")}`
}
export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") throw new FamilyInputError("Ingresa un correo válido.")
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FamilyInputError("Ingresa un correo válido.")
  return email
}
export function normalizeRut(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string" || value.length > 20) throw new FamilyInputError("Revisa el RUT ingresado.")
  const rut = value.replace(/[.\s]/g, "").toUpperCase()
  if (!rut) return null
  if (!/^\d{7,8}-[\dK]$/.test(rut)) throw new FamilyInputError("Ingresa el RUT con guion y dígito verificador.")
  const [body, digit] = rut.split("-")
  let sum = 0, multiplier = 2
  for (const char of [...body].reverse()) { sum += Number(char) * multiplier; multiplier = multiplier === 7 ? 2 : multiplier + 1 }
  const expected = 11 - sum % 11
  if (digit !== (expected === 11 ? "0" : expected === 10 ? "K" : String(expected))) throw new FamilyInputError("El dígito verificador del RUT no coincide.")
  return rut
}
export function parseRegistration(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FamilyInputError("Revisa los datos de inscripción.")
  const raw = input as Record<string, unknown>
  const text = (key: string, max: number, required = true) => {
    const value = typeof raw[key] === "string" ? raw[key].normalize("NFC").trim().replace(/\s+/g, " ") : ""
    if ((required && !value) || value.length > max) throw new FamilyInputError(`Revisa el campo ${key}.`)
    return value
  }
  const id = parseEventId(raw.id), eventoId = parseEventId(raw.eventoId)
  const nombreApoderado = text("nombreApoderado", 120), telefono = text("telefono", 25, false)
  const rutApoderado = normalizeRut(raw.rutApoderado)
  if (raw.bebeId) return { id, eventoId, nombreApoderado, telefono, rutApoderado, bebeId: text("bebeId", 100), nuevoBebe: null }
  const nombre = text("nombreBebe", 120)
  const date = text("fechaNacimiento", 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "1900-01-01" || date > chileToday()) throw new FamilyInputError("Revisa la fecha de nacimiento del bebé.")
  const fechaNacimiento = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(fechaNacimiento.getTime()) || fechaNacimiento.toISOString().slice(0, 10) !== date) throw new FamilyInputError("La fecha de nacimiento no existe.")
  return { id, eventoId, nombreApoderado, telefono, rutApoderado, bebeId: null,
    nuevoBebe: { nombre, nombreNormalizado: nombre.toLocaleLowerCase("es-CL"), fechaNacimiento, rut: normalizeRut(raw.rutBebe) } }
}
export type RegistrationInput = ReturnType<typeof parseRegistration>
