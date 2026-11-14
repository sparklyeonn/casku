import { mailConfig, type MailMessage, type MailPurpose } from "../mail/brevo.ts"
export { mailConfig, MailUnavailable, escapeHtml } from "../mail/brevo.ts"
export async function sendMail(message: MailMessage, idempotencyKey: string, purpose: MailPurpose) {
  const config = mailConfig(purpose)
  const [{ deliverOnce },{ prisma }] = await Promise.all([import("../mail/delivery-store"),import("../prisma")])
  return deliverOnce(prisma,message,idempotencyKey,purpose,config)
}
