import { FamilyInputError } from "../families/input.ts"
export function cancellationReason(value: unknown) {
  if (typeof value !== "string") throw new FamilyInputError("Indica el motivo de la cancelación.")
  const reason = value.normalize("NFC").trim().replace(/\s+/g, " ")
  if (reason.length < 10 || reason.length > 300) throw new FamilyInputError("El motivo debe tener entre 10 y 300 caracteres.")
  return reason
}
