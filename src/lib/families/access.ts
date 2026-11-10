import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { familyResultPath } from "@/lib/results/input"

export async function getFamilyUser() {
  const session = await auth()
  if (session?.user?.role !== "APODERADO" || !session.user.id.startsWith("familia:")) return null
  const family = await prisma.apoderado.findUnique({ where: { id: session.user.id.slice(8) } })
  return family?.activo ? family : null
}
export async function requireFamilyUser(resultId?: string) {
  const family = await getFamilyUser()
  const destination = familyResultPath(resultId) ? `&resultado=${encodeURIComponent(resultId!)}` : ""
  if (!family) redirect(`/login?portal=familias${destination}`)
  return family
}
