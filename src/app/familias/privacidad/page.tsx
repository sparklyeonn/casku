import { Suspense } from "react"
import { requireFamilyUser } from "@/lib/families/access"
import { FamilyPrivacy } from "@/components/FamilyPrivacy"
import { FamilyResultFrame } from "@/components/FamilyResultFrame"
async function Space() {
  const family = await requireFamilyUser()
  return <FamilyResultFrame correo={family.correo}><FamilyPrivacy /></FamilyResultFrame>
}
export default function Page() { return <Suspense fallback={<p role="status" className="p-8">Cargando tus autorizaciones…</p>}><Space /></Suspense> }
