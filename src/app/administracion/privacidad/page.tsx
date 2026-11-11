import { Suspense } from "react"
import { requireTeamRole } from "@/lib/access"
import { TeamShell } from "@/components/TeamShell"
import { PrivacyAudit } from "@/components/PrivacyAudit"
async function Space(){const user=await requireTeamRole(["ADMIN"]);return <TeamShell user={user}><PrivacyAudit/></TeamShell>}
export default function Page(){return <Suspense fallback={<p>Cargando…</p>}><Space/></Suspense>}
