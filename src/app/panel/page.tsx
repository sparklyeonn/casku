import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getTeamUser } from "@/lib/access"
import { getFamilyUser } from "@/lib/families/access"
import { roleHomes } from "@/lib/roles"
async function Destination() { const user = await getTeamUser({allowPasswordChange:true}); if (user) return redirect(user.mustChangePassword?"/equipo/cambiar-clave":roleHomes[user.role]); return redirect(await getFamilyUser() ? "/familias" : "/login") }
export default function Page() { return <Suspense fallback={<p>Cargando…</p>}><Destination /></Suspense> }
