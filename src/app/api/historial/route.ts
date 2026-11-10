import { NextResponse } from "next/server"
export async function GET() {
  return NextResponse.json({ error: "Consulta los resultados publicados desde tu cuenta familiar verificada." }, { status: 403 })
}
