import type { PrismaClient } from "@prisma/client"
import { parseBrevoEvents, webhookAuthorized, WebhookInputError } from "./webhook-policy.ts"
import { recordBrevoEvents } from "./webhook-store.ts"
const MAX_BYTES = 131072
const reply = (status: number) => Response.json({ok:status===200},{status,headers:{"Cache-Control":"no-store"}})
async function boundedJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return {status:415} as const
  const declared = request.headers.get("content-length")
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) return {status:413} as const
  if (!request.body) return {status:400} as const
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const {value,done} = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) {await reader.cancel();return {status:413} as const}
      chunks.push(value)
    }
    return {payload:JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)))}
  } catch {return {status:400} as const} finally {reader.releaseLock()}
}
export async function handleBrevoWebhook(request: Request, database: () => Promise<PrismaClient>) {
  if (!webhookAuthorized(request.headers.get("authorization"),process.env.BREVO_WEBHOOK_SECRET ?? "")) return reply(401)
  const secret = process.env.CASKU_MAIL_SUPPRESSION_SECRET ?? ""
  if (process.env.BREVO_WEBHOOK_ENABLED !== "1" || secret.length < 32) return reply(503)
  const body = await boundedJson(request)
  if ("status" in body) return reply(body.status!)
  try {
    const events = parseBrevoEvents(body.payload,secret)
    if (events.length) await recordBrevoEvents(await database(),events,secret)
    return reply(200)
  } catch(error) {return reply(error instanceof WebhookInputError ? 400 : 503)}
}
