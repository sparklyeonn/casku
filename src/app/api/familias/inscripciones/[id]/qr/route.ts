import { prisma } from "@/lib/prisma"
import { getFamilyUser } from "@/lib/families/access"
import { parseEventId } from "@/lib/events/input"
import { registrationQr } from "@/lib/families/confirmation"
import { familyFailure, familyResponse } from "@/lib/families/http"
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const family = await getFamilyUser()
  if (!family) return familyResponse({ error: "Inicia sesión con tu cuenta familiar." }, 401)
  try {
    const row = await prisma.inscripcion.findFirst({ where: { id: parseEventId((await params).id), apoderadoId: family.id } })
    if (!row) return familyResponse({ error: "Comprobante no disponible." }, 404)
    if (await prisma.cancelacionInscripcion.findUnique({ where: { inscripcionId: row.id } })) return familyResponse({ error: "La inscripción está cancelada. El comprobante se conserva en el historial y no permite ingresar a la fila." }, 409)
    return new Response(new Uint8Array(await registrationQr(row.qrToken)), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
  } catch (error) { return familyFailure(error) }
}
