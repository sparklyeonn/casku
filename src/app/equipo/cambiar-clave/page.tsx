import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getTeamUser } from "@/lib/access"
import { TeamPasswordForm } from "@/components/TeamPasswordForm"
import { TeamShell } from "@/components/TeamShell"
import { TeamLogout } from "@/components/TeamLogout"
async function ChangePassword() {
 const user=await getTeamUser({allowPasswordChange:true});if(!user)redirect("/login")
 const form=<TeamPasswordForm email={user.email} temporary={user.mustChangePassword}/>
 return user.mustChangePassword?<div><header className="flex justify-between border-b p-5"><span>casku · {user.name}</span><TeamLogout/></header>{form}</div>:<TeamShell user={user}>{form}</TeamShell>
}
export default function Page(){return <Suspense fallback={<p role="status" className="p-8">Cargando seguridad…</p>}><ChangePassword/></Suspense>}
