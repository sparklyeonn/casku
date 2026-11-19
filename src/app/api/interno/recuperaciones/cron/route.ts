import { runVercelRecoveryCron } from "@/lib/team-passwords/vercel-cron"
import { POST } from "../procesar/route"

export const maxDuration = 120

export async function GET(request: Request) {
  return runVercelRecoveryCron(request, process.env, POST)
}
