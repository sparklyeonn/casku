"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
const links = [["/familias", "Mis inscripciones"], ["/familias/resultados", "Resultados publicados"], ["/familias/privacidad", "Mis autorizaciones"]] as const
export function FamilyNavigation() {
  const pathname = usePathname()
  return <nav className="family-navigation" aria-label="Espacio familiar">{links.map(([href, label]) => {
    const active = href === "/familias" ? pathname === href : pathname.startsWith(href)
    return <Link key={href} href={href} aria-current={active ? "page" : undefined}>{label}</Link>
  })}</nav>
}
