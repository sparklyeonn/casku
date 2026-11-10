"use client"
import { Suspense, useState } from "react"
import { signIn, getSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { isRole, roleHomes } from "@/lib/roles"
import { familyResultPath } from "@/lib/results/input"
import { FamilyAccess } from "@/components/FamilyAccess"

function LoginContent() {
  const search = useSearchParams()
  const [portal, setPortal] = useState<"equipo" | "familias">(search.get("portal") === "familias" ? "familias" : "equipo")
  const [email, setEmail] = useState(""), [password, setPassword] = useState("")
  const [error, setError] = useState(""), [loading, setLoading] = useState(false)
  const router = useRouter()
  const requestedEvent = search.get("evento")
  const requestedResult = search.get("resultado")
  function familyDestination() {
    const resultPath = familyResultPath(requestedResult)
    if (resultPath) { router.replace(resultPath); router.refresh(); return }
    const suffix = requestedEvent && /^[a-f0-9-]{36}$/i.test(requestedEvent) ? `?evento=${encodeURIComponent(requestedEvent)}` : ""
    router.replace(`/familias${suffix}`); router.refresh()
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("")
    try {
      const result = await signIn("equipo", { email, password, redirect: false })
      if (result?.error || !result?.ok) { setError("No pudimos iniciar sesión. Revisa los datos. Si hubo varios intentos fallidos, espera quince minutos antes de reintentar."); return }
      const session = await getSession()
      if (!isRole(session?.user.role)) { setError("No hay un perfil habilitado para esta cuenta."); return }
      setPassword(""); router.replace(roleHomes[session.user.role]); router.refresh()
    } catch { setError("No pudimos conectar. Intenta nuevamente.") }
    finally { setLoading(false) }
  }
  return <main className="mx-auto max-w-md px-5 py-16">
    <Link href="/" className="text-2xl font-semibold text-teal-700">casku</Link>
    <div className="mt-8 flex gap-3" aria-label="Tipo de acceso">
      {(["equipo", "familias"] as const).map(value => <button key={value} type="button" aria-pressed={portal === value} className={`rounded-lg px-4 py-2 ${portal === value ? "bg-teal-700 text-white" : "border"}`} onClick={() => { setPortal(value); setError(""); setPassword("") }}>{value === "equipo" ? "Equipo Casku" : "Familias"}</button>)}
    </div>
    <h1 className="mt-7 text-2xl font-semibold">{portal === "equipo" ? "Acceso del equipo" : "Espacio de las familias"}</h1>
    {portal === "familias" ? <FamilyAccess onAuthenticated={familyDestination} /> : <form onSubmit={submit} className="mt-5 space-y-5">
      <p className="text-sm text-gray-500">Tu cuenta determina el perfil y los permisos. Administración debe habilitar tu acceso.</p>
      <label className="block">Correo<input className="mt-2 w-full rounded-lg border p-3" type="email" autoComplete="username" value={email} maxLength={254} onChange={e => setEmail(e.target.value)} required /></label>
      <label className="block">Contraseña<input className="mt-2 w-full rounded-lg border p-3" type="password" autoComplete="current-password" value={password} maxLength={128} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={loading} className="w-full rounded-lg bg-teal-700 p-3 font-medium text-white disabled:opacity-50">{loading ? "Ingresando…" : "Ingresar"}</button>
    </form>}
  </main>
}
export default function Login() { return <Suspense fallback={<p className="p-8">Cargando acceso…</p>}><LoginContent /></Suspense> }
