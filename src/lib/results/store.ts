import { requireDataConsent, trace } from "@/lib/privacy/store"
import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AttentionConflict, AttentionUnavailable } from "@/lib/kinesiology/http"
import { parseMeasurements } from "@/lib/evaluation-input"
import { parseSnapshot, type ResultSnapshot } from "./snapshot"

const reviewInclude = { paciente: true, fila: { include: { inscripcion: { include: { apoderado: true, evento: true } } } }, publicacion: { include: { correo: true } } } satisfies Prisma.EvaluacionInclude
type Review = Prisma.EvaluacionGetPayload<{ include: typeof reviewInclude }>
function draftSnapshot(row: Review): ResultSnapshot {
  return parseSnapshot({ nombreBebe: row.paciente.nombre, fechaNacimiento: row.paciente.fechaNacimiento.toISOString().slice(0, 10), profesional: row.kinesiologa, evento: row.fila?.inscripcion.evento.nombre ?? null, numero: row.fila?.inscripcion.numero ?? null, fechaEvaluacion: row.createdAt.toISOString(), medidas: { ap: row.anteroposterior, bp: row.biparietal, di: row.diagonalIzq, dd: row.diagonalDer }, indiceCraneal: row.indiceCraneal, indiceAsimetria: row.indiceAsimetria, diagnostico: row.diagnostico, recomendacion: row.recomendacion })
}
function recipient(row: Review) {
  const inscription = row.fila?.inscripcion, family = inscription?.apoderado
  if (!family?.activo || !row.paciente.apoderadoId || family.id !== row.paciente.apoderadoId || inscription?.pacienteId !== row.pacienteId || row.fila?.estado !== "ATENDIDO") return null
  return family
}
const mailSummary = (mail: { estado: string; disponibleAt: Date } | null) => mail ? { estado: mail.estado, reintentarDesde: mail.disponibleAt.toISOString() } : { estado: "PENDIENTE", reintentarDesde: null }
function reviewSummary(row: Review) {
  const family = recipient(row)
  return { id: row.id, revision: row.revision, datos: row.publicacion ? parseSnapshot(row.publicacion.datos) : draftSnapshot(row), publicable: !!family, motivoBloqueo: family ? null : "Pendiente de vinculación con una cuenta familiar verificada y activa.", correoDestino: row.publicacion?.correo?.destinatario ?? family?.correo ?? null, publicacion: row.publicacion ? { id: row.publicacion.id, publicadoAt: row.publicacion.publicadoAt.toISOString(), correo: mailSummary(row.publicacion.correo) } : null }
}
export type ResultReview = ReturnType<typeof reviewSummary>
export async function ownedReview(staffId: string, id: string) {
  const row = await prisma.evaluacion.findFirst({ where: { id, autorId: staffId }, include: reviewInclude })
  if (row) await trace(prisma, { id: staffId, role: "KINESIOLOGO" }, "CONSULTAR", "EVALUACION", row.id)
  return row ? reviewSummary(row) : null
}
export async function ownResults(staffId: string, page: number, state: "TODOS" | "BORRADOR" | "PUBLICADO", eventoId?: string) {
  const where: Prisma.EvaluacionWhereInput = { autorId: staffId, ...(eventoId ? { fila: { is: { eventoId } } } : {}), ...(state === "BORRADOR" ? { publicacion: { is: null } } : state === "PUBLICADO" ? { publicacion: { isNot: null } } : {}) }
  const [total, rows] = await prisma.$transaction([prisma.evaluacion.count({ where }), prisma.evaluacion.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20, select: { id: true, revision: true, createdAt: true, paciente: { select: { nombre: true } }, fila: { select: { inscripcion: { select: { numero: true, evento: { select: { nombre: true } } } } } }, publicacion: { select: { id: true, datos: true, correo: { select: { estado: true } } } } } })])
  return { total, pagina: page, hayMas: page * 20 < total, resultados: rows.map(row => { const snapshot = row.publicacion ? parseSnapshot(row.publicacion.datos) : null; return { id: row.id, revision: row.revision, nombreBebe: snapshot?.nombreBebe || row.paciente.nombre, fecha: row.createdAt.toISOString(), evento: snapshot?.evento || row.fila?.inscripcion.evento.nombre || null, numero: snapshot?.numero ?? row.fila?.inscripcion.numero ?? null, estado: row.publicacion ? "PUBLICADO" : "BORRADOR", correo: row.publicacion?.correo?.estado ?? null } }) }
}
async function lockOwned(tx: Prisma.TransactionClient, staffId: string, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Evaluacion" WHERE "id" = ${id} AND "autorId" = ${staffId} FOR UPDATE`
  if (!rows.length) throw new AttentionUnavailable()
  return tx.evaluacion.findUniqueOrThrow({ where: { id }, include: reviewInclude })
}
export async function reviseResult(staffId: string, id: string, revision: number, measures: ReturnType<typeof parseMeasurements>) {
  return prisma.$transaction(async tx => {
    const row = await lockOwned(tx, staffId, id)
    if (row.publicacion) throw new AttentionConflict("El resultado ya está publicado. No se modificó su contenido.")
    if (row.revision !== revision) throw new AttentionConflict("La evaluación cambió en otra pantalla. Actualiza antes de guardar.")
    await requireDataConsent(tx, row.autorizacionId ?? row.fila?.inscripcion.autorizacionId, row.pacienteId, row.paciente.apoderadoId)
    const anterior = draftSnapshot(row)
    const data = { anteroposterior: measures.ap, biparietal: measures.bp, diagonalIzq: measures.di, diagonalDer: measures.dd, indiceCraneal: measures.indiceCraneal, indiceAsimetria: measures.indiceAsimetria, diagnostico: measures.diagnostico, recomendacion: measures.recomendacion }
    if (Object.entries(data).every(([key, value]) => row[key as keyof typeof data] === value)) return reviewSummary(row)
    const updated = await tx.evaluacion.update({ where: { id }, data: { ...data, revision: { increment: 1 } }, include: reviewInclude })
    await tx.revisionEvaluacion.create({ data: { evaluacionId: id, revision: updated.revision, autorId: staffId, anterior, nueva: draftSnapshot(updated) } })
    return reviewSummary(updated)
  }, { timeout: 15000 })
}
function portalUrl(id: string) {
  try { const base = process.env.AUTH_URL || process.env.NEXTAUTH_URL; if (!base) return null; const url = new URL(`/familias/resultados/${id}`, base); return ["https:", "http:"].includes(url.protocol) ? url.href : null } catch { return null }
}
export async function publishResult(staffId: string, id: string, revision: number) {
  return prisma.$transaction(async tx => {
    const row = await lockOwned(tx, staffId, id)
    if (row.revision !== revision) throw new AttentionConflict("La evaluación cambió. Revisa la última versión antes de publicarla.")
    if (row.publicacion) return { id: row.publicacion.id, nueva: false }
    const family = recipient(row)
    if (!family) throw new AttentionConflict("Primero debe verificarse la vinculación del bebé con una cuenta familiar activa. No se envió el resultado al correo de contacto.")
    const authorization = await requireDataConsent(tx, row.autorizacionId ?? row.fila?.inscripcion.autorizacionId, row.pacienteId, family.id)
    const snapshot = draftSnapshot(row), checked = parseMeasurements(snapshot.medidas)
    if (snapshot.indiceCraneal !== checked.indiceCraneal || snapshot.indiceAsimetria !== checked.indiceAsimetria || snapshot.diagnostico !== checked.diagnostico || snapshot.recomendacion !== checked.recomendacion) throw new AttentionConflict("Revisa y guarda las medidas antes de publicar este resultado.")
    const publicationId = randomUUID()
    await tx.resultadoPublicado.create({ data: { id: publicationId, evaluacionId: id, apoderadoId: family.id, publicadoPorId: staffId, revision, datos: snapshot, correo: { create: { destinatario: family.correo, portalUrl: portalUrl(publicationId), ...(authorization.correoResultados ? {} : { estado: "CANCELADO", ultimoError: "PRIVACIDAD" }) } } } })
    await trace(tx, { id: staffId, role: "KINESIOLOGO" }, "PUBLICAR", "PUBLICACION", publicationId)
    return { id: publicationId, nueva: true }
  }, { timeout: 15000 })
}
export const familyResultScope = (familyId: string): Prisma.ResultadoPublicadoWhereInput => ({ apoderadoId: familyId, apoderado: { activo: true }, evaluacion: { paciente: { apoderadoId: familyId }, fila: { is: { estado: "ATENDIDO", inscripcion: { apoderadoId: familyId } } } } })
export async function familyPublishedResults(familyId: string, page: number) {
  const where = familyResultScope(familyId)
  const [total, rows] = await prisma.$transaction([prisma.resultadoPublicado.count({ where }), prisma.resultadoPublicado.findMany({ where, orderBy: [{ publicadoAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20, select: { id: true, publicadoAt: true, datos: true } })])
  return { total, pagina: page, hayMas: page * 20 < total, resultados: rows.map(row => ({ id: row.id, publicadoAt: row.publicadoAt.toISOString(), datos: parseSnapshot(row.datos) })) }
}
export async function familyPublishedResult(familyId: string, id: string) {
  const row = await prisma.resultadoPublicado.findFirst({ where: { id, ...familyResultScope(familyId) }, select: { id: true, publicadoAt: true, datos: true, correo: { select: { estado: true, disponibleAt: true } } } })
  if (row) await trace(prisma, { id: `familia:${familyId}`, role: "APODERADO" }, "CONSULTAR", "PUBLICACION", row.id)
  return row ? { id: row.id, publicadoAt: row.publicadoAt.toISOString(), datos: parseSnapshot(row.datos), correo: mailSummary(row.correo) } : null
}
