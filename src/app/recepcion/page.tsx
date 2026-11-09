import { Suspense } from "react"
import { requireTeamRole } from "@/lib/access"
import { TeamShell } from "@/components/TeamShell"
import { ReceptionDesk } from "@/components/ReceptionDesk"
async function Reception() {
  const user = await requireTeamRole(["RECEPCION"])
  return <TeamShell user={user}><ReceptionDesk key={user.id} /></TeamShell>
}
export default function Page() {
  return <Suspense fallback={<p role="status" className="p-8">Cargando recepción…</p>}><Reception /></Suspense>
}
