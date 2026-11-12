import { Suspense } from "react"
import Link from "next/link"
import { requireTeamRole } from "@/lib/access"
import { TeamShell } from "@/components/TeamShell"
import { ResultEditor } from "@/components/ResultEditor"
import { ownedReview } from "@/lib/results/store"
import { evaluationId } from "@/lib/results/input"
async function Review({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireTeamRole(["KINESIOLOGO"])
  let result = null
  try { result = await ownedReview(user.id, evaluationId((await params).id)) } catch { /* No exponer otros resultados ni errores internos. */ }
  return <TeamShell user={user}>{result ? <ResultEditor key={`${user.id}:${result.id}:${result.revision}:${`${result.publicacion?.id??"draft"}:${result.publicacion?.revisionControl??0}`}`} initial={result} /> : <main className="mx-auto max-w-3xl space-y-4 p-8"><h1 className="text-2xl font-semibold">Resultado no disponible</h1><p>Comprueba tu sesión y que la evaluación corresponda a tu autoría.</p><Link href="/kinesiologia/resultados" className="underline">Volver a mis resultados</Link></main>}</TeamShell>
}
export default function Page({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<p role="status" className="p-8">Cargando revisión…</p>}><Review params={params} /></Suspense> }
