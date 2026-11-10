import Link from "next/link"
export default function Page() {
  return <main className="mx-auto max-w-xl space-y-5 p-10"><h1 className="text-2xl font-semibold">Resultados familiares</h1><p>Los resultados publicados por la profesional están disponibles en tu cuenta familiar verificada. Las evaluaciones anteriores sin vinculación se conservan y requieren revisión antes de incorporarse.</p><Link href="/familias/resultados">Ver mis resultados publicados</Link></main>
}
