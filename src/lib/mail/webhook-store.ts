import type { Prisma, PrismaClient } from "@prisma/client"
import { applyNotifications } from "../mail-queue/store.ts"
import { canonicalMessageId, deliveryRanks, recipientKey, type BrevoEvent } from "./webhook-policy.ts"
type Tx = Prisma.TransactionClient
export async function lockBrevoMessage(tx: Tx, messageId: string) {
  // Serializa recepción y aceptación para no perder eventos que llegan antes.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`brevo:${messageId}`}))`
}
export async function applyTransactionalEvents(tx: Tx, key: string) {
  await tx.$queryRaw`SELECT clave FROM "EnvioTransaccional" WHERE clave=${key} FOR UPDATE`
  const mail = await tx.envioTransaccional.findUniqueOrThrow({where:{clave:key}})
  if (!mail.proveedorId || !mail.destinatarioClave) return
  const id = canonicalMessageId(mail.proveedorId)
  const events = await tx.notificacionCorreo.findMany({where:{proveedor:"brevo",mensajeId:{in:[id,`<${id}>`]},destinatarioClave:mail.destinatarioClave,aplicadaEnvioAt:null}})
  let delivery = mail.entrega
  for (const event of events) {
    if (deliveryRanks[event.tipo] > deliveryRanks[delivery]) delivery = event.tipo
    await tx.$executeRaw`UPDATE "NotificacionCorreo" SET "envioClave"=${key},"aplicadaEnvioAt"=CURRENT_TIMESTAMP WHERE id=${event.id}::uuid`
  }
  await tx.envioTransaccional.update({where:{clave:key},data:{entrega:delivery}})
  if (["REBOTE","QUEJA"].includes(delivery)) {
    await tx.$executeRaw`INSERT INTO "SupresionCorreo" (clave,motivo) VALUES (${mail.destinatarioClave},${delivery}) ON CONFLICT (clave) DO UPDATE SET motivo=CASE WHEN "SupresionCorreo".motivo='QUEJA' THEN 'QUEJA' ELSE EXCLUDED.motivo END`
  }
}
export async function recordBrevoEvents(db: PrismaClient, events: BrevoEvent[], secret: string) {
  await db.$transaction(async tx => {
    for (const id of [...new Set(events.map(event=>event.messageId))].sort()) await lockBrevoMessage(tx,id)
    for (const event of events) {
      await tx.notificacionCorreo.createMany({data:[{proveedor:"brevo",eventoId:event.id,mensajeId:event.messageId,tipo:event.type,ocurridoAt:event.occurredAt,destinatarioClave:event.recipient}],skipDuplicates:true})
      const mails = await tx.envioTransaccional.findMany({where:{proveedorId:{in:[event.messageId,`<${event.messageId}>`]},destinatarioClave:event.recipient},select:{clave:true}})
      for (const mail of mails) await applyTransactionalEvents(tx,mail.clave)
      const order = await tx.ordenCorreo.findFirst({where:{proveedor:"brevo",proveedorId:{in:[event.messageId,`<${event.messageId}>`]}}})
      if (order?.destinatario && recipientKey(order.destinatario,secret) === event.recipient) await applyNotifications(tx,order.id,secret)
    }
  })
}
