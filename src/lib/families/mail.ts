import { Resend } from "resend"
import type { CreateEmailOptions } from "resend"

export class MailUnavailable extends Error {}
export function mailConfig() {
  const key = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM
  if (!key || !from || /[\r\n]/.test(from)) throw new MailUnavailable()
  let baseUrl: string | undefined
  if (process.env.CASKU_TEST_MODE === "1" && process.env.NODE_ENV === "development" && process.env.CASKU_TEST_MAIL_URL) {
    const url = new URL(process.env.CASKU_TEST_MAIL_URL)
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") throw new MailUnavailable()
    baseUrl = url.origin
  }
  return { key, from, baseUrl }
}
export async function sendMail(message: Omit<CreateEmailOptions, "from">, idempotencyKey: string) {
  const { key, from, baseUrl } = mailConfig()
  const resend = new Resend(key, baseUrl ? { baseUrl } : undefined)
  try {
    const result = await resend.emails.send({ ...message, from } as CreateEmailOptions, { idempotencyKey, signal: AbortSignal.timeout(12000) })
    if (result.error || !result.data?.id) throw new MailUnavailable()
    return result.data.id
  } catch { throw new MailUnavailable() }
}
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)
