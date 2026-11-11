import { PrivacyInputError } from "@/lib/privacy/policy"
import { PrivacyConflict } from "@/lib/privacy/store"
import { Prisma } from "@prisma/client"
import { FamilyInputError } from "@/lib/families/input"
import { familyFailure, familyResponse } from "@/lib/families/http"
import type { familyLink } from "./store"
export function linkOutcome(result: Awaited<ReturnType<typeof familyLink>>) {
  if (result.estado === "ENVIO_EN_CURSO") return familyResponse({ error: "El comprobante se está enviando. Espera a que termine y vuelve a confirmar el mismo código." }, 409)
  if (result.estado === "NO_DISPONIBLE") return familyResponse({ error: "No hay una vinculación disponible con ese código para tu cuenta. Revisa el código y el correo con recepción." }, 404)
  if (result.estado === "CONFLICTO") return familyResponse({ error: "La ficha requiere revisión por Casku antes de vincularse. No se crearon ni combinaron registros del bebé." }, 409)
  return familyResponse({ vinculada: result.vinculada, vinculacion: result.vinculacion })
}
export function linkFailure(error: unknown) {
  if (error instanceof PrivacyInputError) return familyResponse({ error: error.message },400)
  if (error instanceof PrivacyConflict) return familyResponse({ error: error.message },409)
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return familyResponse({ error: "La ficha cambió o coincide con otro registro. Actualiza o solicita revisión a Casku." }, 409)
  return familyFailure(error)
}
export function codeFromBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FamilyInputError("Ingresa el código de vinculación.")
  return (value as Record<string, unknown>).codigo
}
