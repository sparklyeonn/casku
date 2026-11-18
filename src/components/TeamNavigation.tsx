"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useId, useState } from "react"
import { roleHomes, type Role } from "@/lib/roles"
export function TeamNavigation({ role, assignedForm = false }: { role: Role; assignedForm?: boolean }) {
  const menuId = useId()
  const pathname = usePathname(), [open, setOpen] = useState(false)
  const work = [
    { href: roleHomes[role], label: role === "ADMIN" ? "Eventos" : role === "KINESIOLOGO" ? "Mi atención" : "Mi espacio" },
    ...(role === "ADMIN" ? [{ href: "/administracion/cuentas", label: "Cuentas del equipo" }, { href: "/administracion/calendly", label: "Calendly" }] : []),
    ...(role === "ADMIN" || role === "RECEPCION" ? [{ href: "/datos-familias", label: "Datos de familias" }] : []),
    ...(role === "KINESIOLOGO" ? [{ href: "/kinesiologia/resultados", label: "Mis resultados" }, { href: "/evaluacion", label: "Evaluación sin inscripción" }] : []),
    ...(role === "ADMIN" ? [{ href: "/administracion/correos", label: "Correos" }, { href: "/administracion/privacidad", label: "Trazabilidad" }] : []),
  ]
  const account = [{ href: "/seguridad", label: "Seguridad y sesiones" }, { href: "/equipo/cambiar-clave", label: "Cambiar contraseña" }]
  function links(items: typeof account) {
    return items.map(({ href, label }) => {
      const active = (pathname === href && !(href === "/evaluacion" && assignedForm)) || (href === "/kinesiologia" && pathname === "/evaluacion" && assignedForm) || (href === "/kinesiologia/resultados" && pathname.startsWith(href + "/"))
      return <Link key={href} href={href} prefetch={false} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}><span aria-hidden="true" className="team-nav-mark" />{label}</Link>
    })
  }
  return <nav className="team-navigation" aria-label="Menú de equipo">
    <button type="button" className="team-menu-toggle" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(value => !value)}>Menú del equipo <span aria-hidden="true">{open ? "−" : "+"}</span></button>
    <div id={menuId} className="team-menu-links" data-open={open}>
      <p className="team-nav-heading">Espacio de trabajo</p><div className="team-nav-group">{links(work)}</div>
      <p className="team-nav-heading">Mi cuenta</p><div className="team-nav-group">{links(account)}</div>
      <p className="team-nav-note">Tu sesión es individual. Al terminar, recuerda cerrarla.</p>
    </div>
  </nav>
}
