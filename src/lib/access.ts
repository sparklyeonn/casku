import { redirect } from "next/navigation"
import { auth } from "./auth"
import { getTeamAccounts } from "./team-accounts"
import type { Role } from "./roles"
export async function getTeamUser() {
  const session = await auth()
  if (!session?.user?.id || !session.user.role) return null
  const account = getTeamAccounts().find(a => a.id === session.user.id && a.active && a.role === session.user.role)
  return account ? { id: account.id, name: account.name, email: account.email, role: account.role } : null
}
export async function requireTeamRole(roles: readonly Role[]) {
  const user = await getTeamUser()
  if (!user) redirect("/login")
  if (!roles.includes(user.role)) redirect("/sin-acceso")
  return user
}
