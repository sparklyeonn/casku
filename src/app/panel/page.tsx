import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getTeamUser } from "@/lib/access"
import { roleHomes } from "@/lib/roles"
async function Destination() { const user = await getTeamUser(); return redirect(user ? roleHomes[user.role] : "/login") }
export default function Page() { return <Suspense fallback={<p>Cargando…</p>}><Destination /></Suspense> }
