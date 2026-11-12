import { resultMessage } from "./message"
export { resultMessage } from "./message"
import { emailPermission } from "@/lib/privacy/email"
import { trace } from "@/lib/privacy/store"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/families/mail"
import { parseSnapshot } from "./snapshot"

export async function deliverResult(publicacionId: string) {
  // El trabajador toma el control solo después de la activación explícita.
  if (process.env.CASKU_MAIL_AUTOMATION === "1") return
  const now = new Date(), token = randomUUID()
  const claimed = await prisma.$transaction(async tx => {
    if (!await emailPermission(tx, publicacionId, "RESULTADO", true)) {
      await tx.correoResultado.updateMany({ where: { publicacionId, estado: { in: ["PENDIENTE","FALLIDO"] } }, data: { estado: "CANCELADO", ultimoError: "PRIVACIDAD" } })
      return { count: 0 }
    }
    const result = await tx.correoResultado.updateMany({ where: { publicacionId, OR: [{ estado: { in: ["PENDIENTE", "FALLIDO"] }, disponibleAt: { lte: now } }, { estado: "ENVIANDO", bloqueoHasta: { lt: now } }] }, data: { estado: "ENVIANDO", bloqueoToken: token, bloqueoHasta: new Date(now.getTime() + 120000), intentos: { increment: 1 } } })
    if (result.count) await trace(tx, { id: "sistema:correo", role: "SISTEMA" }, "RESERVAR_ENVIO", "PUBLICACION", publicacionId)
    return result
  })
  if (!claimed.count) return
  try {
    const mail = await prisma.correoResultado.findUniqueOrThrow({ where: { publicacionId }, include: { publicacion: { include: { apoderado: true, evaluacion: { include: { paciente: true, fila: { include: { inscripcion: true } } } } } } } })
    const { publicacion: published } = mail, family = published.apoderado
    if (!family.activo || family.correo !== mail.destinatario || published.evaluacion.paciente.apoderadoId !== family.id || published.evaluacion.fila?.inscripcion.apoderadoId !== family.id || published.evaluacion.fila.estado !== "ATENDIDO") throw new Error("Vinculación no disponible")
    if (!await emailPermission(prisma, publicacionId, "RESULTADO")) throw new Error("Autorización retirada")
    const providerId = await sendMail({ to: mail.destinatario, ...resultMessage(parseSnapshot(published.datos), mail.portalUrl) }, `result-${mail.id}`)
    await prisma.correoResultado.updateMany({ where: { publicacionId, bloqueoToken: token }, data: { estado: "ENVIADO", enviadoAt: new Date(), proveedorId: providerId, bloqueoToken: null, bloqueoHasta: null, ultimoError: null } })
    await prisma.ordenCorreo.updateMany({where:{publicacionId,etapa:"INICIAL",estado:"BLOQUEADO"},data:{estado:"ACEPTADO",motivo:"ENVIO_INICIAL_EXISTENTE",proveedor:"legacy",proveedorId:providerId,aceptadoAt:new Date()}})
  } catch {
    await prisma.correoResultado.updateMany({ where: { publicacionId, bloqueoToken: token }, data: { estado: "FALLIDO", disponibleAt: new Date(Date.now() + 60000), bloqueoToken: null, bloqueoHasta: null, ultimoError: "ENVIO_NO_CONFIRMADO" } })
  }
}
