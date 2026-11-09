import { Suspense } from "react"
import { EventManager } from "@/components/EventManager"
import { TeamShell } from "@/components/TeamShell"
import { requireTeamRole } from "@/lib/access"
async function Administration() {
  const user = await requireTeamRole(["ADMIN"])
  return <TeamShell user={user}><EventManager /></TeamShell>
}
export default function Page() {
  return <Suspense fallback={<p role="status" className="p-8">Cargando tus eventos…</p>}><Administration /></Suspense>
}
