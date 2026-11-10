import { prisma } from "@/lib/prisma"
import { parseEventId } from "@/lib/events/input"
import { receptionInput } from "@/lib/reception/input"
import { receptionAccess, receptionFailure, receptionJson, receptionResponse } from "@/lib/reception/http"
import { deliverConfirmation } from "@/lib/families/confirmation"
export async function POST(request: Request) {
  const access = await receptionAccess(); if (access.response) return access.response
  try {
    const { data, eventoId } = receptionInput(await receptionJson(request))
    const row = await prisma.inscripcion.findFirst({ where: { id: parseEventId(data.inscripcionId), eventoId }, select: { id: true, cancelacion: { select: { id: true } } } })
    if (!row) return receptionResponse({ error: "Inscripción no disponible en este evento." }, 404)
    if (row.cancelacion) return receptionResponse({ error: "La inscripción está cancelada. No se envían confirmaciones de una reserva cancelada." }, 409)
    await deliverConfirmation(row.id)
    const mail = await prisma.correoInscripcion.findUnique({ where: { inscripcionId: row.id }, select: { estado: true } })
    return receptionResponse({ correo: mail?.estado ?? "SIN_CORREO" })
  } catch (error) { return receptionFailure(error) }
}
