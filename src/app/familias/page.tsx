import { Suspense } from "react"
import Link from "next/link"
import { FamilyLogout } from "@/components/FamilyLogout"
import { requireFamilyUser } from "@/lib/families/access"
import { FamilyPortal } from "@/components/FamilyPortal"
async function FamilySpace() {
  const family = await requireFamilyUser()
  return <div className="min-h-screen"><header className="border-b px-5 py-4"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4"><Link href="/familias" className="text-2xl font-semibold text-teal-700 dark:text-teal-300">casku</Link><div className="flex flex-wrap items-center gap-4"><p className="break-all text-sm">{family.correo}</p><FamilyLogout /></div></div></header><nav aria-label="Espacio familiar" className="mx-auto flex max-w-5xl gap-4 px-5 pt-5"><Link href="/familias">Mis inscripciones</Link><Link href="/familias/resultados">Resultados publicados</Link></nav><FamilyPortal key={family.id} /></div>
}
export default function Page() { return <Suspense fallback={<p role="status" className="p-8">Cargando tu espacio familiar…</p>}><FamilySpace /></Suspense> }
