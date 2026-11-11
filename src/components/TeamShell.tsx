import Link from "next/link"
import type { ReactNode } from "react"
import { TeamLogout } from "./TeamLogout"
import { roleLabels, roleHomes, type Role } from "@/lib/roles"
export function TeamShell({ user, children }: { user: { name: string; role: Role }; children: ReactNode }) {
  return <div className="min-h-screen">
    <header className="border-b px-5 py-4"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
      <Link href={roleHomes[user.role]} className="text-2xl font-semibold text-teal-700">casku</Link>
      <div className="flex flex-wrap items-center gap-5"><p className="text-sm">{user.name} · {roleLabels[user.role]}</p><TeamLogout /></div>
    </div></header>
    <nav className="mx-auto flex max-w-5xl flex-wrap gap-4 px-5 py-4" aria-label="Menú de equipo"><Link href={roleHomes[user.role]}>{user.role === "ADMIN" ? "Eventos" : user.role === "KINESIOLOGO" ? "Mi atención" : "Mi espacio"}</Link>{user.role === "ADMIN" && <Link href="/administracion/cuentas">Cuentas del equipo</Link>}{(user.role === "ADMIN" || user.role === "RECEPCION") && <Link href="/datos-familias">Datos de familias</Link>}{user.role === "KINESIOLOGO" && <><Link href="/kinesiologia/resultados">Mis resultados</Link><Link href="/evaluacion">Evaluación sin inscripción</Link></>}{user.role === "ADMIN" && <Link href="/administracion/privacidad">Trazabilidad</Link>}<Link href="/seguridad">Seguridad y sesiones</Link></nav>
    {children}
  </div>
}
