import { Suspense } from "react"
import { TeamAccounts } from "@/components/TeamAccounts"
import { TeamShell } from "@/components/TeamShell"
import { requireTeamRole } from "@/lib/access"
async function Accounts() {
  const user = await requireTeamRole(["ADMIN"])
  return <TeamShell user={user}><TeamAccounts /></TeamShell>
}
export default function Page() { return <Suspense fallback={<p role="status" className="p-8">Cargando cuentas…</p>}><Accounts /></Suspense> }
