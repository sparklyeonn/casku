import { Suspense } from "react"
import { requireFamilyUser } from "@/lib/families/access"
import { FamilyResultFrame } from "@/components/FamilyResultFrame"
import { ResultsList } from "@/components/ResultsList"
async function Results() { const family = await requireFamilyUser("lista"); return <FamilyResultFrame correo={family.correo}><ResultsList family key={family.id} /></FamilyResultFrame> }
export default function Page() { return <Suspense fallback={<p role="status" className="p-8">Cargando tus resultados…</p>}><Results /></Suspense> }
