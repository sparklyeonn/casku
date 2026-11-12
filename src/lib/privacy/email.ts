import type { Prisma } from "@prisma/client"
import { PRIVACY_VERSION } from "./policy"
export async function emailPermission(tx: Prisma.TransactionClient, publicacionId: string, purpose: "RESULTADO" | "SEGUIMIENTO", lock = false) {
  const published = await tx.resultadoPublicado.findUnique({ where: { id: publicacionId }, include: { apoderado: true, evaluacion: { include: { paciente: true, fila: { include: { inscripcion: true } } } } } })
  if (!published || published.estado!=="VIGENTE" || published.versionActual!==1) return false
  const inscription = published.evaluacion.fila?.inscripcion, family = published.apoderado
  const id = inscription?.autorizacionId
  if (!id || !family.activo || published.evaluacion.paciente.apoderadoId !== family.id || inscription?.apoderadoId !== family.id || published.evaluacion.fila?.estado !== "ATENDIDO") return false
  if (lock) await tx.$queryRaw`SELECT id FROM "AutorizacionPrivacidad" WHERE id=${id}::uuid FOR UPDATE`
  const permission = await tx.autorizacionPrivacidad.findUnique({ where: { id } })
  return !!(permission?.datos && permission.correoResultados && permission.versionTexto===PRIVACY_VERSION && permission.apoderadoId===family.id && permission.pacienteId===published.evaluacion.pacienteId && permission.eventoId===inscription.eventoId && (purpose!=="SEGUIMIENTO" || permission.seguimiento))
}
