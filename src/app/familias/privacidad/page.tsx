import { Suspense } from "react"
import Link from "next/link"
import { requireFamilyUser } from "@/lib/families/access"
import { FamilyPrivacy } from "@/components/FamilyPrivacy"
async function Space(){await requireFamilyUser();return <><nav className="mx-auto flex max-w-4xl gap-4 p-5"><Link href="/familias">Mis inscripciones</Link><Link href="/familias/resultados">Resultados</Link></nav><FamilyPrivacy/></>}
export default function Page(){return <Suspense fallback={<p>Cargando…</p>}><Space/></Suspense>}
