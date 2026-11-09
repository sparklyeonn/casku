import { prisma } from "@/lib/prisma"
import { parseEventId } from "@/lib/events/input"
import { registrationQr } from "@/lib/families/confirmation"
import { receptionAccess, receptionFailure, receptionResponse } from "@/lib/reception/http"
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await receptionAccess(); if (access.response) return access.response
  try {
    const row = await prisma.inscripcion.findFirst({ where: { id: parseEventId((await params).id), eventoId: parseEventId(new URL(request.url).searchParams.get("eventoId")) }, select: { qrToken: true } })
    if (!row) return receptionResponse({ error: "Comprobante no disponible en este evento." }, 404)
    return new Response(new Uint8Array(await registrationQr(row.qrToken)), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
  } catch (error) { return receptionFailure(error) }
}
