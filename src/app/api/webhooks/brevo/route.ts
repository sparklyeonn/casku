import { handleBrevoWebhook } from "@/lib/mail/webhook-http"
export async function POST(request: Request) {
  return handleBrevoWebhook(request,async () => (await import("@/lib/prisma")).prisma)
}
