import Link from "next/link"
export default function Home() {
  return <main className="mx-auto max-w-4xl px-6 py-20">
    <p className="text-3xl font-semibold text-teal-700">casku</p>
    <p className="mt-8 text-sm uppercase tracking-widest text-gray-500">Atención y eventos</p>
    <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight">Las familias y el equipo, conectados.</h1>
    <p className="mt-5 max-w-xl text-gray-500">Inscribe a tu bebé en un evento de Casku y conserva su número y QR para la atención.</p>
    <div className="mt-8 flex flex-wrap gap-4"><Link href="/inscripcion" className="inline-block rounded-lg bg-teal-700 px-6 py-3 text-white">Inscribir a mi bebé</Link><Link href="/login?portal=familias" className="inline-block rounded-lg border px-6 py-3">Mi espacio familiar</Link><Link href="/login" className="inline-block px-6 py-3 text-teal-700 dark:text-teal-300">Acceso del equipo</Link></div>
  </main>
}
