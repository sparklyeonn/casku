import { timingSafeEqual } from "node:crypto"

type Environment = Record<string, string | undefined>
type Processor = (request: Request) => Promise<Response>
const validToken = (value: string | undefined): value is string => !!value && /^[A-Za-z0-9_-]{32,256}$/.test(value)
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } })

// Reutiliza el procesador POST y sus bloqueos; no hace solicitudes de red.
export async function runVercelRecoveryCron(request: Request, env: Environment, processBatch: Processor) {
  if (request.method !== "GET") return reply({ error: "Método no permitido." }, 405)
  const supplied = Buffer.from(request.headers.get("authorization") || "")
  const secret = env.CRON_SECRET
  if (!validToken(secret)) return reply({ error: "Acceso no autorizado." }, 401)
  const expected = Buffer.from(`Bearer ${secret}`)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply({ error: "Acceso no autorizado." }, 401)
  if (env.VERCEL_ENV !== "production" || env.CASKU_PASSWORD_RECOVERY_ENABLED !== "1") return reply({ estado: "DESACTIVADO" })
  const worker = env.CASKU_PASSWORD_RECOVERY_WORKER_SECRET
  if (!validToken(worker) || worker === secret) return reply({ error: "Configuración pendiente." }, 503)
  try {
    // El origen es fijo: ninguna cabecera o URL del visitante controla el destino.
    return await processBatch(new Request("https://internal.invalid/api/interno/recuperaciones/procesar", {
      method: "POST", headers: { authorization: `Bearer ${worker}` },
    }))
  } catch {
    return reply({ error: "No se pudo procesar el lote." }, 503)
  }
}
