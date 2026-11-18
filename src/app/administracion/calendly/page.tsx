import { Suspense } from "react"
import { requireTeamRole } from "@/lib/access"
import { TeamShell } from "@/components/TeamShell"
import { CalendlyConnection } from "@/components/CalendlyConnection"
async function Connection() {
  const user = await requireTeamRole(["ADMIN"])
  return <TeamShell user={user}><CalendlyConnection /></TeamShell>
}
export default function Page() {
  return <Suspense fallback={<p role="status" className="p-8">Cargando la conexión…</p>}><Connection /></Suspense>
}
