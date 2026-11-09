import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AttentionConflict, AttentionUnavailable } from "./http"
import type { parseMeasurements } from "@/lib/evaluation-input"

const attentionSelect = {
  id: true, eventoId: true, estado: true, profesionalId: true, reservaId: true, llamadaAt: true,
  evento: { select: { nombre: true, fecha: true, lugar: true } },
  inscripcion: { select: { numero: true, paciente: { select: { id: true, nombre: true, rut: true, fechaNacimiento: true } }, apoderado: { select: { nombre: true, correo: true } } } },
} satisfies Prisma.EntradaFilaSelect
type AttentionRow = Prisma.EntradaFilaGetPayload<{ select: typeof attentionSelect }>
function summary(row: AttentionRow) {
  return { id: row.id, eventoId: row.eventoId, estado: row.estado, reservaId: row.reservaId!, llamadaAt: row.llamadaAt?.toISOString() ?? null,
    evento: { ...row.evento, fecha: row.evento.fecha.toISOString().slice(0, 10) }, numero: row.inscripcion.numero,
    bebe: { nombre: row.inscripcion.paciente.nombre, rut: row.inscripcion.paciente.rut || "", fnac: row.inscripcion.paciente.fechaNacimiento.toISOString().slice(0, 10) }, apoderado: row.inscripcion.apoderado.nombre || "Apoderado", correo: row.inscripcion.apoderado.correo }
}
export async function currentAttention(staffId: string) {
  const row = await prisma.entradaFila.findFirst({ where: { profesionalId: staffId, estado: "EN_ATENCION" }, select: attentionSelect })
  return row ? summary(row) : null
}
export async function assignedAttention(staffId: string, id: string, reservaId: string) {
  const row = await prisma.entradaFila.findFirst({ where: { id, profesionalId: staffId, reservaId, estado: "EN_ATENCION" }, select: attentionSelect })
  return row ? summary(row) : null
}
export async function clinicOverview(staffId: string, eventoId: string) {
  const [event, active, waiting] = await prisma.$transaction([
    prisma.evento.findUnique({ where: { id: eventoId }, select: { id: true } }),
    prisma.entradaFila.findFirst({ where: { profesionalId: staffId, estado: "EN_ATENCION" }, select: attentionSelect }),
    prisma.entradaFila.count({ where: { eventoId, estado: "EN_ESPERA" } }),
  ])
  if (!event) throw new AttentionUnavailable()
  return { atencion: active ? summary(active) : null, esperando: waiting }
}
export async function callNext(staffId: string, eventoId: string, requestId: string) {
  const save = () => prisma.$transaction(async tx => {
    const event = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Evento" WHERE "id" = ${eventoId}::uuid FOR UPDATE`
    if (!event.length) throw new AttentionUnavailable()
    const replay = await tx.llamadaFila.findUnique({ where: { id: requestId } })
    if (replay) {
      if (replay.profesionalId !== staffId || replay.eventoId !== eventoId) throw new AttentionConflict("Este envío corresponde a otra solicitud. Actualiza la pantalla.")
      if (!replay.entradaId) return { atencion: null, resultado: "VACIA" as const }
      const own = await tx.entradaFila.findFirst({ where: { id: replay.entradaId, profesionalId: staffId, reservaId: replay.reservaId, estado: "EN_ATENCION" }, select: attentionSelect })
      return { atencion: own ? summary(own) : null, resultado: own ? "ACTIVA" as const : "TERMINADA" as const }
    }
    let active = await tx.entradaFila.findFirst({ where: { profesionalId: staffId, estado: "EN_ATENCION" }, select: attentionSelect })
    if (!active) {
      const next = await tx.entradaFila.findFirst({ where: { eventoId, estado: "EN_ESPERA" }, orderBy: { orden: "asc" }, select: { id: true } })
      if (next) active = await tx.entradaFila.update({ where: { id: next.id }, data: { estado: "EN_ATENCION", profesionalId: staffId, reservaId: requestId, llamadaAt: new Date(), finalizadaAt: null }, select: attentionSelect })
    }
    await tx.llamadaFila.create({ data: { id: requestId, profesionalId: staffId, eventoId, entradaId: active?.id, reservaId: active?.reservaId } })
    return { atencion: active ? summary(active) : null, resultado: active ? "ACTIVA" as const : "VACIA" as const }
  }, { timeout: 15000 })
  for (let attempt = 0; ; attempt++) {
    try { return await save() } catch (error) {
      // El índice parcial impide dos atenciones activas aun si se llaman eventos distintos.
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) continue
      throw error
    }
  }
}
async function lockAttention(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.entradaFila.findUnique({ where: { id }, select: { eventoId: true } })
  if (!row) throw new AttentionUnavailable()
  await tx.$queryRaw`SELECT "id" FROM "Evento" WHERE "id" = ${row.eventoId}::uuid FOR UPDATE`
}
export async function returnToQueue(staffId: string, id: string, reservaId: string) {
  return prisma.$transaction(async tx => {
    await lockAttention(tx, id)
    const row = await tx.entradaFila.findUnique({ where: { id } })
    if (!row || row.profesionalId !== staffId || row.reservaId !== reservaId) throw new AttentionUnavailable()
    if (row.estado === "EN_ESPERA") return
    if (row.estado !== "EN_ATENCION") throw new AttentionConflict("Esta atención ya está finalizada.")
    // Conserva orden/hora de llegada. El identificador cambia en el próximo llamado.
    await tx.entradaFila.update({ where: { id }, data: { estado: "EN_ESPERA" } })
  })
}
export async function saveAssignedEvaluation(staff: { id: string; name: string }, id: string, reservaId: string, measures: ReturnType<typeof parseMeasurements>) {
  return prisma.$transaction(async tx => {
    await lockAttention(tx, id)
    const row = await tx.entradaFila.findUnique({ where: { id }, include: { evaluacion: true, inscripcion: { include: { apoderado: true } } } })
    if (!row || row.profesionalId !== staff.id || row.reservaId !== reservaId) throw new AttentionUnavailable()
    if (row.evaluacion) {
      const old = row.evaluacion
      if (old.anteroposterior !== measures.ap || old.biparietal !== measures.bp || old.diagonalIzq !== measures.di || old.diagonalDer !== measures.dd) throw new AttentionConflict("La evaluación ya se guardó con otras mediciones. No se sobrescribió.")
      return { evaluacionId: old.id, nueva: false }
    }
    if (row.estado !== "EN_ATENCION") throw new AttentionConflict("Esta atención ya no está activa. Vuelve a tu fila.")
    const saved = await tx.evaluacion.create({ data: { filaId: row.id, pacienteId: row.inscripcion.pacienteId, correoPadre: row.inscripcion.apoderado.correo,
      anteroposterior: measures.ap, biparietal: measures.bp, diagonalIzq: measures.di, diagonalDer: measures.dd,
      indiceCraneal: measures.indiceCraneal, indiceAsimetria: measures.indiceAsimetria, diagnostico: measures.diagnostico, recomendacion: measures.recomendacion, kinesiologa: staff.name } })
    await tx.entradaFila.update({ where: { id }, data: { estado: "ATENDIDO", finalizadaAt: new Date() } })
    return { evaluacionId: saved.id, nueva: true }
  }, { timeout: 15000 })
}
