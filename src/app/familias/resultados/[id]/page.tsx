import { Suspense } from "react"
import { connection } from "next/server"
import Link from "next/link"
import { requireFamilyUser } from "@/lib/families/access"
import { FamilyResultFrame } from "@/components/FamilyResultFrame"
import { ResultCard } from "@/components/ResultCard"
import { ResultMailPanel } from "@/components/ResultMailPanel"
import { familyPublishedResult } from "@/lib/results/store"
import { parseEventId } from "@/lib/events/input"
async function Result({ params }: { params: Promise<{ id: string }> }) {
  // La sesión y los datos clínicos se resuelven solo al recibir la petición.
  await connection()
  const { id } = await params, family = await requireFamilyUser(id)
  let result = null
  try { result = await familyPublishedResult(family.id, parseEventId(id)) } catch { /* El detalle solo se obtiene dentro del ámbito familiar. */ }
  return <FamilyResultFrame correo={family.correo}><main className="mx-auto max-w-3xl space-y-6 px-5 py-8"><Link href="/familias/resultados" className="underline">Volver a mis resultados</Link><h1 className="text-3xl font-semibold">{result ? result.estado==="RETIRADO"?"Resultado retirado":"Resultado publicado" : "Resultado no disponible"}</h1>{result?.datos ? <>{result.version>1&&<p role="status" className="rounded border p-4">Resultado actualizado · Versión {result.version}. Esta versión reemplaza las anteriores.</p>}<ResultCard data={result.datos} publicadoAt={result.publicadoAt} /><ResultMailPanel key={`${family.id}:${result.id}:${result.correo.estado}`} initial={result.correo} endpoint={`/api/familias/resultados/${result.id}/correo`} /></> : result?.estado==="RETIRADO"?<p role="status" className="rounded border p-4">La profesional retiró este resultado para revisión. Sus medidas e indicaciones no están disponibles como resultado vigente. Comunícate con Casku si necesitas ayuda.</p>:<p>El resultado puede no estar publicado o no corresponder a tu cuenta. Consulta con Casku si necesitas ayuda.</p>}</main></FamilyResultFrame>
}
export default function Page({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<p role="status" className="p-8">Cargando resultado…</p>}><Result params={params} /></Suspense> }
