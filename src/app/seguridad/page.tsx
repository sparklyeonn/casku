import { Suspense } from "react"
import { requireTeamRole } from "@/lib/access"
import { TeamShell } from "@/components/TeamShell"
import { TeamSessions } from "@/components/TeamSessions"
async function Security() {
  const user = await requireTeamRole(["ADMIN", "RECEPCION", "KINESIOLOGO"])
  return <TeamShell user={user}><TeamSessions /></TeamShell>
}
export default function Page() { return <Suspense fallback={<p className="p-8" role="status">Cargando seguridad…</p>}><Security /></Suspense> }
