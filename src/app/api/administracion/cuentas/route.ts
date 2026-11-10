import { adminAccess, teamFailure, teamJson, teamResponse } from "@/lib/team/http"
import { accountInput, TeamInputError } from "@/lib/team/input"
import { listTeam, saveAccount } from "@/lib/team/store"
export async function GET(request: Request) {
  const access = await adminAccess(); if (access.response) return access.response
  try {
    const query = new URL(request.url).searchParams, page = Number(query.get("pagina") || 1), term = (query.get("buscar") || "").trim()
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || term.length > 120) throw new TeamInputError("Revisa la búsqueda o página.")
    return teamResponse({ ...await listTeam(page, term), miId: access.user.id })
  } catch (error) { return teamFailure(error) }
}
export async function POST(request: Request) {
  const access = await adminAccess(); if (access.response) return access.response
  try {
    const result = await saveAccount(access.user, null, accountInput(await teamJson(request), true))
    return teamResponse(result, result?.creada ? 201 : 200)
  } catch (error) { return teamFailure(error) }
}
