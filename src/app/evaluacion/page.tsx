import { Suspense } from "react"
import FormularioEvaluacion from "@/components/FormularioEvaluacion"
import { TeamShell } from "@/components/TeamShell"
import { requireTeamRole } from "@/lib/access"
import { assignedAttention } from "@/lib/kinesiology/store"
import { parseEventId } from "@/lib/events/input"
import Link from "next/link"
async function Evaluation({ searchParams }: { searchParams: Promise<{ atencion?: string; reserva?: string }> }) {
  const user = await requireTeamRole(["KINESIOLOGO"])
  const query = await searchParams
  if (query.atencion !== undefined || query.reserva !== undefined) {
    let atencion = null
    try { atencion = await assignedAttention(user.id, parseEventId(query.atencion), parseEventId(query.reserva)) } catch { /* No revelar datos de otra reserva ni errores internos. */ }
    return <TeamShell user={user}>{atencion ? <FormularioEvaluacion key={`${user.id}:${atencion.id}:${atencion.reservaId}`} profesional={user.name} atencion={atencion} /> : <main className="mx-auto max-w-xl space-y-5 p-8"><h1 className="text-2xl font-semibold">Atención no disponible</h1><p>La atención puede haber finalizado, vuelto a la fila o estar asignada a otra profesional.</p><Link href="/kinesiologia" className="inline-block rounded-lg bg-teal-700 px-5 py-3 text-white">Volver a mi atención</Link></main>}</TeamShell>
  }
  return <TeamShell user={user}><FormularioEvaluacion key={user.id} profesional={user.name} /></TeamShell>
}
export default function Page({ searchParams }: { searchParams: Promise<{ atencion?: string; reserva?: string }> }) { return <Suspense fallback={<p role="status" className="p-8">Cargando evaluación…</p>}><Evaluation searchParams={searchParams} /></Suspense> }
