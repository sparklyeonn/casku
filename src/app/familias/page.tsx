import { Suspense } from "react"
import { requireFamilyUser } from "@/lib/families/access"
import { FamilyPortal } from "@/components/FamilyPortal"
import { FamilyResultFrame } from "@/components/FamilyResultFrame"
async function FamilySpace() {
  const family = await requireFamilyUser()
  return <FamilyResultFrame correo={family.correo}><FamilyPortal key={family.id} /></FamilyResultFrame>
}
export default function Page() { return <Suspense fallback={<p role="status" className="p-8">Cargando tu espacio familiar…</p>}><FamilySpace /></Suspense> }
