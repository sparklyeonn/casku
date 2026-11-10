import { Suspense } from "react"
import { requireTeamRole } from "@/lib/access"
import { TeamShell } from "@/components/TeamShell"
import { ResultsList } from "@/components/ResultsList"
async function Results() { const user = await requireTeamRole(["KINESIOLOGO"]); return <TeamShell user={user}><ResultsList key={user.id} /></TeamShell> }
export default function Page() { return <Suspense fallback={<p role="status" className="p-8">Cargando resultados…</p>}><Results /></Suspense> }
