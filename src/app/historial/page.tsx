import Link from "next/link"
export default function Page() {
  return <main className="mx-auto max-w-xl space-y-5 p-10"><h1 className="text-2xl font-semibold">Historial familiar</h1><p>Tus inscripciones y comprobantes están disponibles en tu espacio familiar. El historial clínico se incorporará con la publicación de resultados. Las evaluaciones anteriores se conservan.</p><Link href="/familias">Ir a mi espacio familiar</Link></main>
}
