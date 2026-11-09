export const MAX_EVENT_CAPACITY = 100000
export class EventInputError extends Error {
  field?: string
  constructor(message: string, field?: string) { super(message); this.field = field }
}
export function parseEventId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new EventInputError("Selecciona un evento válido.", "id")
  return value.toLowerCase()
}
export function parseEventInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new EventInputError("Los datos del evento no son válidos.")
  const raw = input as Record<string, unknown>
  function text(field: string, label: string, max: number) {
    const value = typeof raw[field] === "string" ? raw[field].trim() : ""
    if (!value || value.length > max) throw new EventInputError(`${label}: ingresa entre 1 y ${max} caracteres.`, field)
    return value
  }
  const id = parseEventId(raw.id)
  const nombre = text("nombre", "Nombre", 120), lugar = text("lugar", "Lugar", 200)
  if (typeof raw.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.fecha) || raw.fecha < "1900-01-01") throw new EventInputError("Ingresa una fecha válida.", "fecha")
  const fecha = new Date(`${raw.fecha}T00:00:00.000Z`)
  if (!Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== raw.fecha) throw new EventInputError("La fecha del evento no existe.", "fecha")
  if (typeof raw.cupos !== "number" || !Number.isSafeInteger(raw.cupos) || raw.cupos < 1 || raw.cupos > MAX_EVENT_CAPACITY) throw new EventInputError(`Los cupos deben ser un número entero entre 1 y ${MAX_EVENT_CAPACITY}.`, "cupos")
  return { id, nombre, fecha, lugar, cupos: raw.cupos }
}
export type EventInput = ReturnType<typeof parseEventInput>
export type EventSummary = { id: string; nombre: string; fecha: string; lugar: string; cupos: number; inscritos: number; inscripcionesAbiertas: boolean }
