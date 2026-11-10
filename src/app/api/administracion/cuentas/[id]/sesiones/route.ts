import { adminAccess, teamFailure, teamJson, teamResponse } from "@/lib/team/http"
import { accountId, TeamInputError } from "@/lib/team/input"
import { revokeAccountSessions } from "@/lib/team/store"
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await adminAccess(); if (access.response) return access.response
  try {
    const body = await teamJson(request)
    if (!Number.isSafeInteger(body?.version) || body.version < 1) throw new TeamInputError("Actualiza la lista de cuentas antes de continuar.")
    const result = await revokeAccountSessions(access.user, accountId((await params).id), body.version)
    return result ? teamResponse(result) : teamResponse({ error: "Cuenta no disponible." }, 404)
  } catch (error) { return teamFailure(error) }
}
