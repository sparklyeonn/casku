import { randomUUID } from "node:crypto"
import QRCode from "qrcode"
import { prisma } from "@/lib/prisma"
import { sendMail, escapeHtml } from "./mail"

export const qrContent = (token: string) => `CASKU:INSCRIPCION:${token}`
export const registrationQr = (token: string) => QRCode.toBuffer(qrContent(token), { type: "png", width: 240, margin: 4, errorCorrectionLevel: "M" })

export async function deliverConfirmation(inscripcionId: string) {
  const now = new Date(), lock = randomUUID()
  const claimed = await prisma.correoInscripcion.updateMany({ where: { inscripcionId, OR: [{ estado: { in: ["PENDIENTE", "FALLIDO"] }, disponibleAt: { lte: now } }, { estado: "ENVIANDO", bloqueoHasta: { lt: now } }] }, data: { estado: "ENVIANDO", bloqueoToken: lock, bloqueoHasta: new Date(now.getTime() + 120000), intentos: { increment: 1 } } })
  if (!claimed.count) return
  try {
    const mail = await prisma.correoInscripcion.findUniqueOrThrow({ where: { inscripcionId }, include: { inscripcion: { include: { paciente: true, evento: true, apoderado: true } } } })
    const { inscripcion: row } = mail, number = String(row.numero).padStart(3, "0")
    const date = new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(row.evento.fecha)
    const qr = await registrationQr(row.qrToken)
    const configuredUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL
    if (!configuredUrl) throw new Error("Falta dirección del portal")
    const portal = new URL("/familias", configuredUrl)
    if (!["https:", "http:"].includes(portal.protocol)) throw new Error("Dirección inválida")
    const html = `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;padding:28px;color:#18353b"><h1>¡Inscripción confirmada!</h1><p>Hola, familia:</p><p>Registramos a <strong>${escapeHtml(row.paciente.nombre)}</strong> en ${escapeHtml(row.evento.nombre)}.</p><div style="background:#e6f3ef;padding:24px;text-align:center;border-radius:12px"><p>Tu número de inscripción</p><p style="font-size:48px;margin:8px">${number}</p><img src="cid:inscripcion-qr" width="240" height="240" alt="QR de la inscripción ${number}"/><p>Presenta el QR o indica tu número en recepción.</p></div><p><strong>Fecha:</strong> ${escapeHtml(date)}</p><p><strong>Lugar:</strong> ${escapeHtml(row.evento.lugar)}</p><p>Tu número identifica la inscripción; no reserva una hora ni una posición fija en la fila. Al llegar, recepción confirmará tu presencia.</p><p><a href="${escapeHtml(portal.href)}">Consultar mi comprobante en Casku</a></p><p>Equipo Casku</p></div>`
    const providerId = await sendMail({ to: row.apoderado.correo, subject: `Inscripción confirmada · ${row.evento.nombre} · N.º ${number}`, html, text: `Inscripción de ${row.paciente.nombre} confirmada. Evento: ${row.evento.nombre}. Número: ${number}. Fecha: ${date}. Lugar: ${row.evento.lugar}. Presenta el QR adjunto o indica tu número al llegar. Este número no reserva una hora de atención. Comprobante: ${portal.href}`, attachments: [{ filename: `casku-${number}.png`, content: qr.toString("base64"), contentType: "image/png", contentId: "inscripcion-qr" }] }, `registration-${mail.id}`)
    await prisma.correoInscripcion.updateMany({ where: { inscripcionId, bloqueoToken: lock }, data: { estado: "ENVIADO", enviadoAt: new Date(), proveedorId: providerId, bloqueoToken: null, bloqueoHasta: null, ultimoError: null } })
  } catch {
    await prisma.correoInscripcion.updateMany({ where: { inscripcionId, bloqueoToken: lock }, data: { estado: "FALLIDO", disponibleAt: new Date(Date.now() + 60000), bloqueoToken: null, bloqueoHasta: null, ultimoError: "ENVIO_NO_CONFIRMADO" } })
  }
}
