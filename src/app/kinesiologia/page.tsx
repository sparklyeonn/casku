import { Suspense } from "react"
import { requireTeamRole } from "@/lib/access"
import { TeamShell } from "@/components/TeamShell"
import { KinesiologyDesk } from "@/components/KinesiologyDesk"
async function Kinesiology() {
  const user = await requireTeamRole(["KINESIOLOGO"])
  return <TeamShell user={user}><KinesiologyDesk key={user.id} /></TeamShell>
}
export default function Page() {
  return <Suspense fallback={<p role="status" className="p-8">Cargando kinesiología…</p>}><Kinesiology /></Suspense>
}
