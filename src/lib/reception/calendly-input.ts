import { parseRegistration, FamilyInputError, normalizeEmail } from "../families/input.ts"
import { bookingId } from "../calendly/booking.ts"
import { parsePrivacy, PrivacyInputError } from "../privacy/policy.ts"
export function parseCalendlyArrival(raw: unknown) {
  const details = parseRegistration(raw), data = raw as Record<string, unknown>
  if (!details.nuevoBebe || details.bebeId) throw new FamilyInputError("Confirma los datos del bebé presente.")
  if (data.confirmado !== true || data.autorizado !== true) throw new PrivacyInputError("Confirma la identidad con la familia y solicita que el apoderado presente marque su autorización.")
  const privacidad = parsePrivacy(details.privacidad)
  if (privacidad.correoResultados || privacidad.seguimiento) throw new PrivacyInputError("Esta operación no habilita correos clínicos ni de seguimiento.")
  const numero = data.numero === undefined || data.numero === "" ? null : data.numero
  if (numero !== null && (typeof numero !== "number" || !Number.isSafeInteger(numero) || numero < 1 || numero > 100000)) throw new FamilyInputError("Revisa el número de inscripción existente.")
  return { correo: data.correo ? normalizeEmail(data.correo) : null, id: details.id, eventoId: details.eventoId, bebe: details.nuevoBebe, nombreApoderado: details.nombreApoderado, telefono: details.telefono, privacidad, numero, reservaId: bookingId(data.reservaId), invitadoId: bookingId(data.invitadoId) }
}
export type CalendlyArrivalInput = ReturnType<typeof parseCalendlyArrival>
