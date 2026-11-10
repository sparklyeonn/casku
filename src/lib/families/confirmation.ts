import { mailFamily, readMailFamily } from "./identity-snapshot"
import { mailEvent, readMailEvent } from "@/lib/events/mail-snapshot"
import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import QRCode from "qrcode"
import { prisma } from "@/lib/prisma"
import { sendMail, escapeHtml } from "./mail"

export const qrContent = (token: string) => `CASKU:INSCRIPCION:${token}`
export const registrationQr = (token: string) => QRCode.toBuffer(qrContent(token), { type: "png", width: 240, margin: 4, errorCorrectionLevel: "M" })

export async function deliverConfirmation(inscripcionId: string) {
  const now = new Date(), lock = randomUUID()
  const claimed = await prisma.correoInscripcion.updateMany({ where: { inscripcionId, inscripcion: { cancelacion: { is: null } }, OR: [{ estado: { in: ["PENDIENTE", "FALLIDO"] }, disponibleAt: { lte: now } }, { estado: "ENVIANDO", bloqueoHasta: { lt: now } }] }, data: { estado: "ENVIANDO", bloqueoToken: lock, bloqueoHasta: new Date(now.getTime() + 120000), intentos: { increment: 1 } } })
  if (!claimed.count) return
  try {
    const mail = await prisma.correoInscripcion.findUniqueOrThrow({ where: { inscripcionId }, include: { inscripcion: { include: { paciente: true, evento: true, apoderado: true } } } })
    const { inscripcion: row } = mail, number = String(row.numero).padStart(3, "0")
    // La primera versión del evento queda fijada también para reintentos del proveedor.
    if (mail.datosEvento === null) {
      await prisma.correoInscripcion.updateMany({ where: { inscripcionId, bloqueoToken: lock, datosEvento: { equals: Prisma.DbNull } }, data: { datosEvento: mailEvent(row.evento) } })
      mail.datosEvento = (await prisma.correoInscripcion.findUniqueOrThrow({ where: { inscripcionId } })).datosEvento
    }
    if (mail.datosFamilia === null) {
      await prisma.correoInscripcion.updateMany({ where: { inscripcionId, bloqueoToken: lock, datosFamilia: { equals: Prisma.DbNull } }, data: { datosFamilia: mailFamily(row.paciente.nombre, row.apoderado?.correo || row.contactoCorreo, !!row.apoderadoId) } })
      mail.datosFamilia = (await prisma.correoInscripcion.findUniqueOrThrow({ where: { inscripcionId } })).datosFamilia
    }
    const identity = readMailFamily(mail.datosFamilia)
    const event = readMailEvent(mail.datosEvento)
    const date = new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${event.fecha}T00:00:00Z`))
    const recipient = identity.correo
    if (!recipient) throw new Error("Sin correo de contacto")
    const qr = await registrationQr(row.qrToken)
    const configuredUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL
    if (!configuredUrl) throw new Error("Falta dirección del portal")
    const portal = new URL("/familias", configuredUrl)
    if (!["https:", "http:"].includes(portal.protocol)) throw new Error("Dirección inválida")
    const portalSection = identity.conCuenta ? `<p><a href="${escapeHtml(portal.href)}">Consultar mi comprobante en Casku</a></p>` : "<p>Conserva este comprobante. Recepción puede ayudarte a consultar tu inscripción presencial.</p>"
    const portalText = identity.conCuenta ? `Comprobante: ${portal.href}` : "Conserva este comprobante o consulta tu inscripción en recepción."
    const html = `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;padding:28px;color:#18353b"><h1>¡Inscripción confirmada!</h1><p>Hola, familia:</p><p>Registramos a <strong>${escapeHtml(identity.nombreBebe)}</strong> en ${escapeHtml(event.nombre)}.</p><div style="background:#e6f3ef;padding:24px;text-align:center;border-radius:12px"><p>Tu número de inscripción</p><p style="font-size:48px;margin:8px">${number}</p><img src="cid:inscripcion-qr" width="240" height="240" alt="QR de la inscripción ${number}"/><p>Presenta el QR o indica tu número en recepción.</p></div><p><strong>Fecha:</strong> ${escapeHtml(date)}</p><p><strong>Lugar:</strong> ${escapeHtml(event.lugar)}</p><p>Tu número identifica la inscripción; no reserva una hora ni una posición fija en la fila. Al llegar, recepción confirmará tu presencia.</p>${portalSection}<p>Equipo Casku</p></div>`
    const providerId = await sendMail({ to: recipient, subject: `Inscripción confirmada · ${event.nombre} · N.º ${number}`, html, text: `Inscripción de ${identity.nombreBebe} confirmada. Evento: ${event.nombre}. Número: ${number}. Fecha: ${date}. Lugar: ${event.lugar}. Presenta el QR adjunto o indica tu número al llegar. Este número no reserva una hora de atención. ${portalText}`, attachments: [{ filename: `casku-${number}.png`, content: qr.toString("base64"), contentType: "image/png", contentId: "inscripcion-qr" }] }, mail.revisionContenido === 1 ? `registration-${mail.id}` : `registration-${mail.id}-revision-${mail.revisionContenido}`)
    await prisma.correoInscripcion.updateMany({ where: { inscripcionId, bloqueoToken: lock }, data: { estado: "ENVIADO", enviadoAt: new Date(), proveedorId: providerId, bloqueoToken: null, bloqueoHasta: null, ultimoError: null } })
  } catch {
    await prisma.correoInscripcion.updateMany({ where: { inscripcionId, bloqueoToken: lock }, data: { estado: "FALLIDO", disponibleAt: new Date(Date.now() + 60000), bloqueoToken: null, bloqueoHasta: null, ultimoError: "ENVIO_NO_CONFIRMADO" } })
  }
}
