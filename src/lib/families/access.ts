import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function getFamilyUser() {
  const session = await auth()
  if (session?.user?.role !== "APODERADO" || !session.user.id.startsWith("familia:")) return null
  const family = await prisma.apoderado.findUnique({ where: { id: session.user.id.slice(8) } })
  return family?.activo ? family : null
}
export async function requireFamilyUser() {
  const family = await getFamilyUser()
  if (!family) redirect("/login?portal=familias")
  return family
}
