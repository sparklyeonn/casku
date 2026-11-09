import Link from "next/link"
export default function Page() {
  return <main className="mx-auto max-w-lg space-y-5 p-10"><h1 className="text-2xl font-semibold">Tu perfil no tiene acceso a esta sección</h1><p>Si necesitas otro permiso, consulta a administración de Casku.</p><Link href="/panel" className="inline-block rounded-lg border px-4 py-2">Volver a mi espacio</Link></main>
}
