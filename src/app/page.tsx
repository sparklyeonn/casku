import Link from "next/link"
export default function Home() {
  return <main className="mx-auto max-w-4xl px-6 py-20">
    <p className="text-3xl font-semibold text-teal-700">casku</p>
    <p className="mt-8 text-sm uppercase tracking-widest text-gray-500">Atención y eventos</p>
    <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight">Las familias y el equipo, conectados.</h1>
    <p className="mt-5 max-w-xl text-gray-500">Estamos integrando la inscripción, la atención y los resultados en un solo lugar. El equipo ya puede acceder al formulario de evaluación.</p>
    <Link href="/login" className="mt-8 inline-block rounded-lg bg-teal-700 px-6 py-3 text-white">Ingresar a Casku</Link>
    <p className="mt-8 text-sm text-gray-500">Primera etapa: acceso del equipo y evaluación craneométrica. Inscripción familiar y fila de atención: próximas etapas.</p>
  </main>
}
