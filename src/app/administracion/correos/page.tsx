import { Suspense } from "react"
import { requireTeamRole } from "@/lib/access"
import { TeamShell } from "@/components/TeamShell"
import { AdminMailDesk } from "@/components/AdminMailDesk"
async function Space(){const user=await requireTeamRole(["ADMIN"]);return <TeamShell user={user}><AdminMailDesk/></TeamShell>}
export default function Page(){return <Suspense fallback={<p role="status" className="p-8">Cargando gestión de correos…</p>}><Space/></Suspense>}
