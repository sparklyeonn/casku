export const evaluationOriginLabels = {
 CALENDLY: "Reserva de Calendly",
 WEB: "Inscripción web",
 PRESENCIAL: "Inscripción presencial",
 DIRECTA_SIN_INSCRIPCION: "Atención directa sin inscripción",
} as const
export type EvaluationOrigin = keyof typeof evaluationOriginLabels
export class EvaluationContextError extends Error {}
export function parseEvaluationEvent(value: unknown): string {
 if(typeof value!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw new EvaluationContextError("Selecciona un evento válido antes de guardar la evaluación.")
 return value.toLowerCase()
}
// La procedencia se toma de la inscripción guardada, nunca del formulario clínico.
export function registeredEvaluationOrigin(row: {origen:string;calendlyReservaId?:string|null;calendlyInvitadoId?:string|null}): EvaluationOrigin {
 if(row.calendlyReservaId||row.calendlyInvitadoId){
  if(!row.calendlyReservaId||!row.calendlyInvitadoId)throw new EvaluationContextError("La referencia de Calendly está incompleta; revisa la inscripción.")
  return "CALENDLY"
 }
 if(row.origen==="PRESENCIAL")return "PRESENCIAL"
 if(row.origen==="PREVIA")return "WEB"
 throw new EvaluationContextError("El origen de la inscripción requiere revisión.")
}
export function evaluationOriginLabel(value: unknown) {
 return typeof value==="string"&&Object.hasOwn(evaluationOriginLabels,value)?evaluationOriginLabels[value as EvaluationOrigin]:"Origen no registrado (histórico)"
}
