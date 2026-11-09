import { requestFamilyCode } from "@/lib/families/otp"
import { familyJson, familyFailure, familyResponse } from "@/lib/families/http"
export async function POST(request: Request) {
  try {
    const input = await familyJson(request)
    const address = (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "local").trim().slice(0, 100)
    return familyResponse(await requestFamilyCode(input?.correo, address))
  } catch (error) { return familyFailure(error) }
}
