import Link from "next/link"
import type { ReactNode } from "react"
import { FamilyLogout } from "./FamilyLogout"
export function FamilyResultFrame({ correo, children }: { correo: string; children: ReactNode }) {
  return <div className="min-h-screen"><header className="border-b px-5 py-4"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4"><Link href="/familias" className="text-2xl font-semibold text-teal-700 dark:text-teal-300">casku</Link><div className="flex flex-wrap items-center gap-4"><p className="break-all text-sm">{correo}</p><FamilyLogout /></div></div></header><nav aria-label="Espacio familiar" className="mx-auto flex max-w-4xl gap-4 px-5 py-4"><Link href="/familias">Mis inscripciones</Link><Link href="/familias/resultados">Resultados publicados</Link></nav>{children}</div>
}
