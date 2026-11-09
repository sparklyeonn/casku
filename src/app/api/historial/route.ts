import { NextResponse } from "next/server"
export async function GET() {
  return NextResponse.json({ error: "El historial requiere verificación del apoderado. Disponible en la siguiente etapa." }, { status: 403 })
}
