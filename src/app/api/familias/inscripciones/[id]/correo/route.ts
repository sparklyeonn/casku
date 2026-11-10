import { prisma } from "@/lib/prisma"
import { getFamilyUser } from "@/lib/families/access"
import { parseEventId } from "@/lib/events/input"
import { deliverConfirmation } from "@/lib/families/confirmation"
import { familyFailure, familyJson, familyResponse } from "@/lib/families/http"
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const family = await getFamilyUser()
  if (!family) return familyResponse({ error: "Inicia sesión con tu cuenta familiar." }, 401)
  try {
    await familyJson(request)
    const row = await prisma.inscripcion.findFirst({ where: { id: parseEventId((await params).id), apoderadoId: family.id }, select: { id: true, cancelacion: { select: { id: true } } } })
    if (!row) return familyResponse({ error: "Comprobante no disponible." }, 404)
    if (row.cancelacion) return familyResponse({ error: "La inscripción está cancelada. Su confirmación no se reenvía." }, 409)
    await deliverConfirmation(row.id)
    const mail = await prisma.correoInscripcion.findUniqueOrThrow({ where: { inscripcionId: row.id } })
    return familyResponse({ estado: mail.estado, reintentarDesde: mail.disponibleAt.toISOString() })
  } catch (error) { return familyFailure(error) }
}
