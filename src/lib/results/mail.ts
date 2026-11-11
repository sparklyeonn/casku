import { emailPermission } from "@/lib/privacy/email"
import { trace } from "@/lib/privacy/store"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { escapeHtml, sendMail } from "@/lib/families/mail"
import { parseSnapshot, type ResultSnapshot } from "./snapshot"

export function resultMessage(data: ResultSnapshot, url: string | null) {
  const number = (value: number) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value)
  const measures = `Anteroposterior: ${number(data.medidas.ap)} mm; biparietal: ${number(data.medidas.bp)} mm; diagonal izquierda: ${number(data.medidas.di)} mm; diagonal derecha: ${number(data.medidas.dd)} mm.`
  const linkHtml = url ? `<p><a href="${escapeHtml(url)}">Ver el resultado en mi cuenta de Casku</a></p>` : "<p>Puedes consultar este resultado en tu cuenta familiar de Casku.</p>"
  return { subject: "Tu resultado de craneometría en Casku", text: `Resultado publicado de ${data.nombreBebe}.\n${data.evento ? `Evento: ${data.evento}.\n` : ""}Profesional: ${data.profesional}.\n${measures}\nÍndice craneal: ${number(data.indiceCraneal)} %. Asimetría: ${number(data.indiceAsimetria)} mm.\nResultado: ${data.diagnostico}\nRecomendación: ${data.recomendacion}\n${url ? `Consultar en tu cuenta: ${url}` : "Disponible también en tu cuenta familiar de Casku."}`, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#18353b"><h1>Resultado de craneometría</h1><p>Publicamos el resultado de <strong>${escapeHtml(data.nombreBebe)}</strong>.</p>${data.evento ? `<p>Evento: ${escapeHtml(data.evento)}</p>` : ""}<p>Profesional: ${escapeHtml(data.profesional)}</p><h2>Mediciones</h2><p>${escapeHtml(measures)}</p><p>Índice craneal: <strong>${number(data.indiceCraneal)} %</strong><br>Asimetría: <strong>${number(data.indiceAsimetria)} mm</strong></p><h2>Resultado</h2><p>${escapeHtml(data.diagnostico)}</p><h2>Recomendación</h2><p style="white-space:pre-wrap">${escapeHtml(data.recomendacion)}</p>${linkHtml}<p>Equipo Casku</p></div>` }
}
export async function deliverResult(publicacionId: string) {
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
  } catch {
    await prisma.correoResultado.updateMany({ where: { publicacionId, bloqueoToken: token }, data: { estado: "FALLIDO", disponibleAt: new Date(Date.now() + 60000), bloqueoToken: null, bloqueoHasta: null, ultimoError: "ENVIO_NO_CONFIRMADO" } })
  }
}
