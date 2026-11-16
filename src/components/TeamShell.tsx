import type { ReactNode } from "react"
import type { Role } from "@/lib/roles"
import { TeamFrame } from "./TeamFrame"
// El marco cliente recibe solo la identidad visible, sin serializar la sesión del servidor.
export function TeamShell({ user, children, assignedForm = false }: { user: { name: string; role: Role }; children: ReactNode; assignedForm?: boolean }) {
  return <TeamFrame name={user.name} role={user.role} assignedForm={assignedForm}>{children}</TeamFrame>
}
