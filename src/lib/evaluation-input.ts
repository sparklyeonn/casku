import { calcularDiagnostico } from "./craneometria.ts"
export class InvalidEvaluation extends Error {}
export function parseEvaluation(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InvalidEvaluation("Datos de evaluación inválidos.")
  const raw = input as Record<string, unknown>
  function text(key: string, max = 150) {
    if (typeof raw[key] !== "string" || !raw[key].trim() || raw[key].length > max) throw new InvalidEvaluation(`Revisa el campo ${key}.`)
    return raw[key].trim()
  }
  const nombre = text("nombre"), rut = text("rut", 20).replace(/\./g, "").toUpperCase(), correo = text("correo", 254), fnac = text("fnac", 10)
  if (!/^\d{7,8}-[\dK]$/.test(rut)) throw new InvalidEvaluation("Ingresa el RUT del bebé con guion y dígito verificador.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new InvalidEvaluation("El correo no es válido.")
  const fecha = new Date(`${fnac}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fnac) || !Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== fnac || fecha > new Date()) throw new InvalidEvaluation("La fecha de nacimiento no es válida.")
  const measurements = parseMeasurements(raw)
  const body = rut.slice(0, -2), digit = rut.slice(-1)
  const formatted = `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${digit}`
  return { nombre, rut, rutVariants: [...new Set([rut, formatted, String(raw.rut).trim()])], correo, fecha,
    ...measurements }
}

export function parseMeasurements(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InvalidEvaluation("Datos de evaluación inválidos.")
  const raw = input as Record<string, unknown>
  function measure(key: string) {
    const value = raw[key]
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new InvalidEvaluation("Ingresa cuatro mediciones positivas y válidas.")
    return value
  }
  const ap = measure("ap"), bp = measure("bp"), di = measure("di"), dd = measure("dd")
  const result = calcularDiagnostico(ap, bp, di, dd)
  if (!Number.isFinite(result.indiceCraneal) || !Number.isFinite(result.indiceAsimetria)) throw new InvalidEvaluation("Las mediciones no permiten calcular el resultado.")
  return { ap, bp, di, dd, indiceCraneal: result.indiceCraneal, indiceAsimetria: result.indiceAsimetria,
    diagnostico: [result.diagCraneal, result.diagAsim].filter(Boolean).join(" + "), recomendacion: result.recomendacion }
}
