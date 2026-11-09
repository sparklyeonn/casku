import Link from "next/link"
import type { ReactNode } from "react"
import { signOut } from "@/lib/auth"
import { roleLabels, roleHomes, type Role } from "@/lib/roles"
export function TeamShell({ user, children }: { user: { name: string; role: Role }; children: ReactNode }) {
  return <div className="min-h-screen">
    <header className="border-b px-5 py-4"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
      <Link href={roleHomes[user.role]} className="text-2xl font-semibold text-teal-700">casku</Link>
      <div className="flex flex-wrap items-center gap-5"><p className="text-sm">{user.name} · {roleLabels[user.role]}</p><form action={async () => { "use server"; await signOut({ redirectTo: "/login" }) }}><button className="rounded-lg border px-3 py-2 text-sm">Cerrar sesión</button></form></div>
    </div></header>
    <nav className="mx-auto flex max-w-5xl gap-4 px-5 py-4" aria-label="Menú de equipo"><Link href={roleHomes[user.role]}>{user.role === "ADMIN" ? "Eventos" : "Mi espacio"}</Link>{user.role === "KINESIOLOGO" && <Link href="/evaluacion">Nueva evaluación</Link>}</nav>
    {children}
  </div>
}
