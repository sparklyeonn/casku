export const PREVIOUS_PER_WALKIN = 3
export const WAIT_PRIORITY_MINUTES = 30
export type Origin = "PREVIA" | "PRESENCIAL"
export type QueueCandidate = { id: string; orden: number; esperaDesde: Date; origen: Origin }
export type QueueReason = "ESPERA_MAXIMA" | "PRIORIDAD_PREVIA" | "TURNO_PRESENCIAL" | "UNICO_GRUPO" | "CITA_PROGRAMADA"
export function chooseNext<T extends QueueCandidate>(previous: T | null, walkin: T | null, streak: number, now: Date) {
  const heads = [previous, walkin].filter((row): row is T => row !== null)
  const overdue = heads.filter(row => row.esperaDesde.getTime() <= now.getTime() - WAIT_PRIORITY_MINUTES * 60000)
    .sort((a, b) => a.esperaDesde.getTime() - b.esperaDesde.getTime() || a.orden - b.orden)[0]
  const selected = overdue || (previous && (!walkin || streak < PREVIOUS_PER_WALKIN) ? previous : walkin)
  if (!selected) return null
  const reason: QueueReason = overdue ? "ESPERA_MAXIMA" : !previous || !walkin ? "UNICO_GRUPO" : selected.origen === "PREVIA" ? "PRIORIDAD_PREVIA" : "TURNO_PRESENCIAL"
  return { entrada: selected, motivo: reason, siguientesPrevios: selected.origen === "PREVIA" ? Math.min(PREVIOUS_PER_WALKIN, streak + 1) : 0 }
}
export const queuePolicy = { previosPorPresencial: PREVIOUS_PER_WALKIN, prioridadDesdeMinutos: WAIT_PRIORITY_MINUTES }
export const queueReasonLabels: Record<QueueReason, string> = { CITA_PROGRAMADA: "Cita confirmada: horario de atención alcanzado", ESPERA_MAXIMA: "Prioridad por espera de 30 minutos o más", PRIORIDAD_PREVIA: "Prioridad de inscripción previa", TURNO_PRESENCIAL: "Turno de inscripción del día", UNICO_GRUPO: "Único grupo en espera" }
export const originLabel = (origin: Origin) => origin === "PREVIA" ? "Inscripción previa" : "Inscripción del día"

export function chooseWithAppointment<T extends QueueCandidate>(previous: T | null, walkin: T | null, appointment: (T & { citaInicio: Date }) | null, streak: number, now: Date) {
  const regular = chooseNext(previous, walkin, streak, now)
  if (!appointment || appointment.citaInicio > now) return regular
  // The maximum-wait protection remains in force for unscheduled families.
  if (regular?.motivo === "ESPERA_MAXIMA") return regular
  return { entrada: appointment, motivo: "CITA_PROGRAMADA" as QueueReason, siguientesPrevios: appointment.origen === "PREVIA" ? Math.min(PREVIOUS_PER_WALKIN, streak + 1) : 0 }
}
