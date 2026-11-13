import { redirect } from "next/navigation"
import { auth } from "./auth"
import { teamAccount } from "./team/store"
import { isRole, type Role } from "./roles"
export async function getTeamUser(options:{allowPasswordChange?:boolean}={}) {
  const session = await auth()
  if (!session?.user?.id || !session.user.teamSessionId || !isRole(session.user.role)) return null
  const account = await teamAccount({ id: session.user.id })
  if(!account||typeof account.mustChangePassword!=="boolean")return null
  if(account.mustChangePassword && !options.allowPasswordChange)return null
  return account?.active && account.role === session.user.role && account.version === session.user.teamVersion ? { id: account.id, name: account.name, email: account.email, role: account.role, version: account.version, sessionId: session.user.teamSessionId, mustChangePassword: account.mustChangePassword } : null
}
export async function requireTeamRole(roles: readonly Role[]) {
  const user = await getTeamUser({allowPasswordChange:true})
  if (!user) redirect("/login")
  if(user.mustChangePassword)redirect("/equipo/cambiar-clave")
  if (!roles.includes(user.role)) redirect("/sin-acceso")
  return user
}
