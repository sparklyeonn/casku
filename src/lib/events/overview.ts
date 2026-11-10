import { prisma } from "@/lib/prisma"

export async function eventOverview(eventoId: string) {
  // Una sola instantánea: una llegada o publicación concurrente no mezcla totales.
  return prisma.$transaction(async tx => {
    const event = await tx.evento.findUnique({ where: { id: eventoId }, select: { id: true, nombre: true, cupos: true } })
    if (!event) return null
    const [inscritos, canceladas, states, resultadosPendientes, resultadosPublicados] = await Promise.all([
      tx.inscripcion.count({ where: { eventoId, cancelacion: { is: null } } }),
      tx.inscripcion.count({ where: { eventoId, cancelacion: { isNot: null } } }),
      tx.entradaFila.groupBy({ by: ["estado"], where: { eventoId }, _count: { _all: true } }),
      tx.evaluacion.count({ where: { fila: { is: { eventoId } }, publicacion: { is: null } } }),
      tx.evaluacion.count({ where: { fila: { is: { eventoId } }, publicacion: { isNot: null } } }),
    ])
    const count = (state: string) => states.find(row => row.estado === state)?._count._all ?? 0
    const enEspera = count("EN_ESPERA"), enAtencion = count("EN_ATENCION"), atendidos = count("ATENDIDO"), ausentes = count("AUSENTE")
    return {
      evento: event,
      totales: { inscritos, canceladas, enEspera, enAtencion, atendidos, ausentes, sinLlegada: inscritos - enEspera - enAtencion - atendidos - ausentes, resultadosPendientes, resultadosPublicados },
      consultadoAt: new Date().toISOString(),
    }
  }, { isolationLevel: "RepeatableRead", timeout: 15000 })
}
export type EventOverview = NonNullable<Awaited<ReturnType<typeof eventOverview>>>
