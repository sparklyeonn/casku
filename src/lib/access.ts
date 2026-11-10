import { redirect } from "next/navigation"
import { auth } from "./auth"
import { teamAccount } from "./team/store"
import { isRole, type Role } from "./roles"
export async function getTeamUser() {
  const session = await auth()
  if (!session?.user?.id || !isRole(session.user.role)) return null
  const account = await teamAccount({ id: session.user.id })
  return account?.active && account.role === session.user.role && account.version === session.user.teamVersion ? { id: account.id, name: account.name, email: account.email, role: account.role, version: account.version } : null
}
export async function requireTeamRole(roles: readonly Role[]) {
  const user = await getTeamUser()
  if (!user) redirect("/login")
  if (!roles.includes(user.role)) redirect("/sin-acceso")
  return user
}
