import { Prisma } from "@prisma/client"
import { getTeamUser } from "@/lib/access"
import { getFamilyUser } from "@/lib/families/access"
import { familyFailure, familyJson, familyResponse } from "@/lib/families/http"
import { parseEventId } from "@/lib/events/input"
import { receptionInput, ReceptionInputError } from "@/lib/reception/input"
import { cancellationReason } from "@/lib/cancellations/input"
import { cancelRegistration, cancellationStatus, CancellationConflict, type CancellationActor } from "@/lib/cancellations/store"
async function access(): Promise<{ actor: CancellationActor; response?: never } | { response: Response; actor?: never }> {
  const staff = await getTeamUser()
  if (staff) return staff.role === "ADMIN" || staff.role === "RECEPCION" ? { actor: { id: staff.id, role: staff.role, version: staff.version } } : { response: familyResponse({ error: "Kinesiología debe devolver la atención a la fila; no puede cancelar inscripciones." }, 403) }
  const family = await getFamilyUser()
  return family ? { actor: { id: family.id, role: "APODERADO" } } : { response: familyResponse({ error: "Inicia sesión para continuar." }, 401) }
}
function failure(error: unknown) {
  if (error instanceof ReceptionInputError) return familyResponse({ error: error.message }, 400)
  if (error instanceof CancellationConflict) return familyResponse({ error: error.message }, 409)
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return familyResponse({ error: "La inscripción cambió durante el envío. Consulta su estado antes de reintentar." }, 409)
  return familyFailure(error)
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await access(); if (current.response) return current.response
  try {
    const result = await cancellationStatus(current.actor, parseEventId(new URL(request.url).searchParams.get("eventoId")), parseEventId((await params).id))
    return result ? familyResponse(result) : familyResponse({ error: "Inscripción no disponible." }, 404)
  } catch (error) { return failure(error) }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await access(); if (current.response) return current.response
  try {
    const { data, eventoId } = receptionInput(await familyJson(request))
    const result = await cancelRegistration(current.actor, eventoId, parseEventId((await params).id), cancellationReason(data.motivo))
    return result ? familyResponse(result) : familyResponse({ error: "Inscripción no disponible." }, 404)
  } catch (error) { return failure(error) }
}
