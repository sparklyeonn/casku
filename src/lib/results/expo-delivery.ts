import { createHash } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { recipientKey } from "../mail/webhook-policy.ts"
import { contactSnapshotHash } from "./contact-policy.ts"
import type { ResultSnapshot } from "./snapshot.ts"
export const expoResultKey = (id: string, revision: number) => `expo-result-20261123-${createHash("sha256").update(id).digest("hex")}-r${revision}`
export async function expoDelivery(tx: Pick<Prisma.TransactionClient, "envioTransaccional">, id: string, revision: number) {
 const key = expoResultKey(id, revision), mail = await tx.envioTransaccional.findUnique({ where: { clave: key } })
 return mail?.clave === key && mail.finalidad === "RESULTADO" ? mail : null
}
export function expoDeliveryBlocksAnotherMail(mail: { estado: string } | null) {
 return !!mail && ["PENDIENTE", "ENVIANDO", "REVISION", "ACEPTADO"].includes(mail.estado)
}
export function expoDeliveryBlocksEdit(mail: { estado: string; disponibleAt: Date; entrega: string } | null, now = new Date()) {
 if (!mail) return false
 if (["PENDIENTE", "ENVIANDO", "REVISION"].includes(mail.estado)) return true
 return mail.estado === "ACEPTADO" && !["ENTREGADO", "REBOTE", "QUEJA"].includes(mail.entrega) && mail.disponibleAt.getTime() + 5 * 60_000 > now.getTime()
}
export async function previousExpoMail(tx: Pick<Prisma.TransactionClient, "envioTransaccional">, id: string, revision: number, email: string, snapshot: ResultSnapshot) {
 const mail = await expoDelivery(tx, id, revision)
 if (!expoDeliveryBlocksAnotherMail(mail)) return null
 if (mail!.estado === "ENVIANDO" || mail!.estado === "PENDIENTE") return { estado: "ENVIANDO" as const }
 const secret = process.env.CASKU_MAIL_SUPPRESSION_SECRET
 if (mail!.estado === "ACEPTADO" && mail!.proveedorId && secret && secret.length >= 32 && mail!.destinatarioClave === recipientKey(email, secret) && mail!.motivo === `EXPO_PROGRAMADO:${contactSnapshotHash(snapshot)}`) return { estado: "ACEPTADO" as const, proveedorId: mail!.proveedorId, aceptadoAt: mail!.aceptadoAt ?? mail!.updatedAt }
 return { estado: "REVISION" as const }
}
