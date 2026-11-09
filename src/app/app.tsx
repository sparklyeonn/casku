import Link from "next/link"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Casku Craneometría</h1>
        <p className="text-gray-500 mb-6">Sistema de evaluación craneal</p>
        <div className="flex flex-col gap-3">
          <Link
            href="/evaluacion"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Nueva evaluación
          </Link>
          <Link
            href="/login"
            className="border border-gray-200 px-6 py-3 rounded-lg font-medium hover:border-gray-400 transition text-gray-700"
          >
            Ver mis resultados
          </Link>
        </div>
      </div>
    </main>
  )
}