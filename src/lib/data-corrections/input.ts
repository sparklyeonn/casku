import { chileToday, FamilyInputError, normalizeEmail, normalizeRut } from "../families/input.ts"
export function object(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FamilyInputError("Revisa los datos enviados.")
  return value as Record<string, unknown>
}
export function text(value: unknown, label: string, max: number, required = true) {
  if (value === null || value === undefined) value = ""
  if (typeof value !== "string") throw new FamilyInputError(`Revisa ${label}.`)
  const result = value.normalize("NFC").trim().replace(/\s+/g, " ")
  if ((required && !result) || result.length > max) throw new FamilyInputError(`Revisa ${label}.`)
  return result
}
export function revision(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new FamilyInputError("Actualiza los datos antes de guardar.")
  return Number(value)
}
export function correctionInput(value: unknown) {
  const raw = object(value), data = object(raw.datos)
  const motivo = text(raw.motivo, "el motivo de la corrección", 300)
  if (motivo.length < 10) throw new FamilyInputError("Explica el motivo de la corrección con al menos 10 caracteres.")
  const base = { revision: revision(raw.revision), motivo }
  const nombre = text(data.nombre, "el nombre", 120), rut = normalizeRut(data.rut)
  if (raw.seccion === "BEBE") {
    const date = text(data.fechaNacimiento, "la fecha de nacimiento", 10)
    const fechaNacimiento = new Date(`${date}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "1900-01-01" || date > chileToday() || !Number.isFinite(fechaNacimiento.getTime()) || fechaNacimiento.toISOString().slice(0, 10) !== date) throw new FamilyInputError("Revisa la fecha de nacimiento del bebé.")
    return { ...base, seccion: "BEBE" as const, datos: { nombre, rut, fechaNacimiento, nombreNormalizado: nombre.toLocaleLowerCase("es-CL") } }
  }
  const telefono = text(data.telefono, "el teléfono", 25, false) || null
  if (raw.seccion === "APODERADO") {
    if (Object.hasOwn(data, "correo")) throw new FamilyInputError("El correo de acceso está verificado y no se cambia desde esta pantalla.")
    return { ...base, seccion: "APODERADO" as const, datos: { nombre, rut, telefono } }
  }
  if (raw.seccion === "CONTACTO") {
    const correo = data.correo === "" || data.correo === null || data.correo === undefined ? null : normalizeEmail(data.correo)
    return { ...base, seccion: "CONTACTO" as const, datos: { nombre, correo, telefono } }
  }
  throw new FamilyInputError("Selecciona los datos que necesitas corregir.")
}
export function rutVariants(rut: string) { const [body, digit] = rut.split("-"); return [rut, `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${digit}`] }
