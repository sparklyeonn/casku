import { Suspense } from "react"
import { requireTeamRole } from "@/lib/access"
import { TeamShell } from "@/components/TeamShell"
import { CalendlyAgenda } from "@/components/CalendlyAgenda"
import { calendlyLocalDate } from "@/lib/calendly/agenda"
async function Agenda() {
  const user = await requireTeamRole(["ADMIN", "RECEPCION", "KINESIOLOGO"])
  return <TeamShell user={user}><CalendlyAgenda initialDate={calendlyLocalDate(new Date())} /></TeamShell>
}
export default function Page() {
  return <Suspense fallback={<p role="status" className="p-8">Cargando agenda…</p>}><Agenda /></Suspense>
}
