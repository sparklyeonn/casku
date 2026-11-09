import { Suspense } from "react"
import FormularioEvaluacion from "@/components/FormularioEvaluacion"
import { TeamShell } from "@/components/TeamShell"
import { requireTeamRole } from "@/lib/access"
async function Evaluation() {
  const user = await requireTeamRole(["KINESIOLOGO"])
  return <TeamShell user={user}><FormularioEvaluacion profesional={user.name} /></TeamShell>
}
export default function Page() { return <Suspense fallback={<p role="status" className="p-8">Cargando evaluación…</p>}><Evaluation /></Suspense> }
