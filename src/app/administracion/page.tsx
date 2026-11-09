import { Suspense } from "react"
import { RoleWorkspace } from "@/components/RoleWorkspace"
export default function Page() {
  return <Suspense fallback={<p role="status" className="p-8">Cargando tu espacio…</p>}><RoleWorkspace role="ADMIN" /></Suspense>
}
