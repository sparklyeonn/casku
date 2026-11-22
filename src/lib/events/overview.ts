import { calendlyCapacity } from "@/lib/calendly/capacity"
import { prisma } from "@/lib/prisma"

export async function eventOverview(eventoId: string) {
  // Una sola instantánea: una llegada o publicación concurrente no mezcla totales.
  return prisma.$transaction(async tx => {
    const event = await tx.evento.findUnique({ where: { id: eventoId }, select: { id: true, nombre: true, cupos: true, inscritos: true, fecha: true } })
    if (!event) return null
    const [inscritos, canceladas, states, resultadosPendientes, resultadosPublicados, resultadosRetirados] = await Promise.all([
      tx.inscripcion.count({ where: { eventoId, cancelacion: { is: null } } }),
      tx.inscripcion.count({ where: { eventoId, cancelacion: { isNot: null } } }),
      tx.entradaFila.groupBy({ by: ["estado"], where: { eventoId }, _count: { _all: true } }),
      tx.evaluacion.count({ where: { fila: { is: { eventoId } }, publicacion: { is: null } } }),
      tx.evaluacion.count({ where: { fila: { is: { eventoId } }, publicacion: { is: { estado: "VIGENTE" } } } }),
      tx.evaluacion.count({ where: { fila: { is: { eventoId } }, publicacion: { is: { estado: "RETIRADO" } } } }),
    ])
    const count = (state: string) => states.find(row => row.estado === state)?._count._all ?? 0
    const enEspera = count("EN_ESPERA"), enAtencion = count("EN_ATENCION"), atendidos = count("ATENDIDO"), ausentes = count("AUSENTE")
    const [presenciales, presencialesCanceladas] = await Promise.all([
      tx.inscripcion.count({ where: { eventoId, origen: "PRESENCIAL", cancelacion: { is: null } } }),
      tx.inscripcion.count({ where: { eventoId, origen: "PRESENCIAL", cancelacion: { isNot: null } } }),
    ])
    const fecha = event.fecha.toISOString().slice(0, 10)
    // Solo agregado por fecha local. No asigna estas evaluaciones a este evento,
    // ni deduce si la familia tenía reserva a partir de nombre, correo o fecha.
    const [unassigned] = await tx.$queryRaw<Array<{ evaluaciones: number; bebes: number }>>`
      SELECT count(*)::int evaluaciones, count(DISTINCT "pacienteId")::int bebes
      FROM "Evaluacion" WHERE "filaId" IS NULL
      AND "createdAt" >= ((${fecha}::date::timestamp AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC')
      AND "createdAt" < (((${fecha}::date + interval '1 day') AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC')`
    const calendly = await calendlyCapacity(tx, event)
    return {
      evento: { id: event.id, nombre: event.nombre, cupos: event.cupos },
      calendly,
      participacion: { totalReservados: inscritos + calendly.protegidos, presenciales, presencialesCanceladas },
      sinInscripcionDelDia: { fecha, ...unassigned },
      totales: { inscritos, canceladas, enEspera, enAtencion, atendidos, ausentes, sinLlegada: inscritos - enEspera - enAtencion - atendidos - ausentes, resultadosPendientes, resultadosPublicados, resultadosRetirados },
      consultadoAt: new Date().toISOString(),
    }
  }, { isolationLevel: "RepeatableRead", timeout: 15000 })
}
export type EventOverview = NonNullable<Awaited<ReturnType<typeof eventOverview>>>
