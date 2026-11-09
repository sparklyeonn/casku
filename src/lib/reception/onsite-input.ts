import { normalizeEmail, parseRegistration, FamilyInputError } from "../families/input.ts"

export function parseOnsiteInput(raw: unknown) {
  const details = parseRegistration(raw)
  if (details.bebeId || !details.nuevoBebe) throw new FamilyInputError("Ingresa los datos del bebé presente o busca su inscripción existente.")
  const data = raw as Record<string, unknown>
  const correo = data.correo === undefined || data.correo === "" ? null : normalizeEmail(data.correo)
  return { id: details.id, eventoId: details.eventoId, nombreApoderado: details.nombreApoderado, telefono: details.telefono, bebe: details.nuevoBebe, correo }
}
export type OnsiteInput = ReturnType<typeof parseOnsiteInput>
