import type { Prisma } from "@prisma/client"
import { protectionFresh } from "./protection-policy.ts"
type Store = Pick<Prisma.TransactionClient, "jornadaCalendly" | "reservaCupoCalendly">
// Caller locks Evento before any write; readers use one repeatable-read snapshot.
export async function calendlyCapacity(tx: Store, event: { id: string; cupos: number; inscritos: number }, now = new Date()) {
  const jornada = await tx.jornadaCalendly.findUnique({ where: { eventoId: event.id } })
  const protegidos = jornada ? await tx.reservaCupoCalendly.count({ where: { eventoId: event.id, estado: "ACTIVA", OR: [{ inscripcionId: null }, { inscripcion: { is: { cancelacion: { isNot: null } } } }] } }) : 0
  const bloqueada = !!jornada && !protectionFresh(jornada, now)
  const ocupados = event.inscritos + protegidos
  return { configurada: !!jornada, protegidos, ocupados, exceso: Math.max(0, ocupados - event.cupos), disponibles: bloqueada ? 0 : Math.max(0, event.cupos - ocupados), bloqueada, sincronizadaAt: jornada?.sincronizadaAt?.toISOString() ?? null, error: jornada?.errorSincronizacion ?? false }
}
