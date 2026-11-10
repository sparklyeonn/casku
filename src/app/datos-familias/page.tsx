import { Suspense } from "react"
import { requireTeamRole } from "@/lib/access"
import { TeamShell } from "@/components/TeamShell"
import { FamilyDataDesk } from "@/components/FamilyDataDesk"
async function DataPage() { const user = await requireTeamRole(["ADMIN", "RECEPCION"]); return <TeamShell user={user}><FamilyDataDesk canRetry={user.role === "RECEPCION"} /></TeamShell> }
export default function Page() { return <Suspense fallback={<p role="status" className="p-8">Cargando datos familiares…</p>}><DataPage /></Suspense> }
