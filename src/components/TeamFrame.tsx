"use client"
import { useId } from "react"
import type { ReactNode } from "react"
import { CaskuBrand } from "./CaskuBrand"
import { TeamLogout } from "./TeamLogout"
import { TeamNavigation } from "./TeamNavigation"
import { roleLabels, roleHomes, type Role } from "@/lib/roles"
export function TeamFrame({ name, role, children, assignedForm = false }: { name: string; role: Role; children: ReactNode; assignedForm?: boolean }) {
  const contentId = useId()
  return <div className="casku-ui team-space">
    <a className="skip-link" href={`#${contentId}`}>Saltar al contenido</a>
    <header className="team-header"><div className="team-header-inner">
      <div className="team-identity"><CaskuBrand href={roleHomes[role]} /><span>Espacio del equipo</span></div>
      <div className="team-account"><div><p className="team-user-name">{name}</p><p className="team-role">{roleLabels[role]}</p></div><TeamLogout /></div>
    </div></header>
    <div className="team-layout"><aside className="team-sidebar"><TeamNavigation role={role} assignedForm={assignedForm} /></aside>
      <div id={contentId} tabIndex={-1} className="team-content">{children}</div>
    </div>
  </div>
}
