import { prisma } from "@/lib/prisma"
import { parseOnsiteInput } from "@/lib/reception/onsite-input"
import { registerOnsite } from "@/lib/reception/onsite"
import { receptionAccess, receptionFailure, receptionJson, receptionResponse } from "@/lib/reception/http"
import { deliverConfirmation } from "@/lib/families/confirmation"
export async function POST(request: Request) {
  const access = await receptionAccess(); if (access.response) return access.response
  try {
    const result = await registerOnsite(access.user.id, parseOnsiteInput(await receptionJson(request)))
    await deliverConfirmation(result.inscripcion.id)
    const mail = await prisma.correoInscripcion.findUnique({ where: { inscripcionId: result.inscripcion.id }, select: { estado: true } })
    return receptionResponse({ ...result, correo: mail?.estado ?? "SIN_CORREO" }, result.nuevaInscripcion ? 201 : 200)
  } catch (error) { return receptionFailure(error) }
}
