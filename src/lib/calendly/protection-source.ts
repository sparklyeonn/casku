import { listCalendlyAgenda, parseAgendaDate, AgendaInputError } from "./agenda.ts"
// A partial page never releases seats. No names, contact details or answers are retained.
export async function completeCalendlyDay(date: string, requestSignal?: AbortSignal) {
  const fecha = parseAgendaDate(date), startedAt = new Date()
  const signal = requestSignal ? AbortSignal.any([requestSignal, AbortSignal.timeout(35000)]) : AbortSignal.timeout(35000)
  const seen = new Set<string>(), rows = new Map<string, { invitadoId: string; reservaId: string; inicio: Date; fin: Date; estado: "ACTIVA" | "CANCELADA" }>()
  let cursor: string | null = null
  for (let page = 0; page < 30; page++) {
    const result = await listCalendlyAgenda({ fecha, estado: "all", cursor, signal })
    if (result.participantesPendientes || result.turnosSinParticipantes) throw new AgendaInputError("Calendly devolvió una agenda incompleta. Se conservan los cupos protegidos; revisa la agenda y reintenta.")
    for (const row of result.citas) {
      const next = { invitadoId: row.id, reservaId: row.reservaId, inicio: new Date(row.inicio), fin: new Date(row.fin), estado: row.estado === "ACTIVA" ? "ACTIVA" as const : "CANCELADA" as const }
      const previous = rows.get(row.id)
      if (previous && JSON.stringify(previous) !== JSON.stringify(next)) throw new AgendaInputError("La agenda cambió durante la consulta. Actualiza la protección antes de admitir nuevas inscripciones.")
      rows.set(row.id, next)
    }
    if (!result.siguiente) return { fecha, startedAt, reservas: [...rows.values()] }
    if (seen.has(result.siguiente)) break
    seen.add(result.siguiente); cursor = result.siguiente
  }
  throw new AgendaInputError("La agenda supera el límite de consulta o repitió una página. No se actualizaron los cupos.")
}
export type ProtectionSnapshot = Awaited<ReturnType<typeof completeCalendlyDay>>
