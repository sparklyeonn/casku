import { adminAccess, teamFailure, teamJson, teamResponse } from "@/lib/team/http"
import { accountId, accountInput } from "@/lib/team/input"
import { saveAccount } from "@/lib/team/store"
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await adminAccess(); if (access.response) return access.response
  try {
    const result = await saveAccount(access.user, accountId((await params).id), accountInput(await teamJson(request), false))
    return result ? teamResponse(result) : teamResponse({ error: "Cuenta no disponible." }, 404)
  } catch (error) { return teamFailure(error) }
}
