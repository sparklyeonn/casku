import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { getTeamUser } from "@/lib/access"
import { canEvaluate } from "@/lib/roles"
import { parseEvaluation, parseMeasurements, InvalidEvaluation } from "@/lib/evaluation-input"
import { parseEventId } from "@/lib/events/input"
import { clinicalFailure, clinicalResponse } from "@/lib/kinesiology/http"
import { saveAssignedEvaluation } from "@/lib/kinesiology/store"
import { prisma } from "@/lib/prisma"

class PatientConflict extends Error {}
export async function POST(req: Request) {
  const user = await getTeamUser()
  if (!user) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 })
  if (!canEvaluate(user.role)) return NextResponse.json({ error: "Tu perfil no puede registrar evaluaciones." }, { status: 403 })
  if (req.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return NextResponse.json({ error: "Envía los datos en formato JSON." }, { status: 400 })
  let input: unknown
  try { input = await req.json() } catch { return NextResponse.json({ error: "El formulario no es válido." }, { status: 400 }) }
  try {
    if (input && typeof input === "object" && Object.hasOwn(input, "atencionId")) {
      const body = input as Record<string, unknown>
      try {
        const saved = await saveAssignedEvaluation(user, parseEventId(body.atencionId), parseEventId(body.reservaId), parseMeasurements(body))
        return clinicalResponse({ ok: true, evaluacionId: saved.evaluacionId, correo: "no_enviado", mensaje: "Evaluación guardada y atención finalizada." }, saved.nueva ? 201 : 200)
      } catch (error) { return clinicalFailure(error) }
    }
    const data = parseEvaluation(input)
    const evaluacion = await prisma.$transaction(async tx => {
      const matches = await tx.paciente.findMany({ where: { rut: { in: data.rutVariants } }, take: 2 })
      if (matches.length > 1) throw new PatientConflict()
      let paciente = matches[0]
      if (paciente?.apoderadoId) throw new PatientConflict("Este bebé tiene una inscripción. Abre su atención desde la fila de kinesiología.")
      if (paciente && (paciente.nombre.trim().toLocaleLowerCase() !== data.nombre.toLocaleLowerCase() || paciente.fechaNacimiento.toISOString().slice(0, 10) !== data.fecha.toISOString().slice(0, 10))) throw new PatientConflict()
      if (!paciente) paciente = await tx.paciente.create({ data: { rut: data.rut, nombre: data.nombre, fechaNacimiento: data.fecha } })
      return tx.evaluacion.create({ data: {
        pacienteId: paciente.id, correoPadre: data.correo, anteroposterior: data.ap, biparietal: data.bp,
        diagonalIzq: data.di, diagonalDer: data.dd, indiceCraneal: data.indiceCraneal, indiceAsimetria: data.indiceAsimetria,
        diagnostico: data.diagnostico, recomendacion: data.recomendacion, kinesiologa: user.name,
      } })
    })
    // La publicación y la entrega de resultados se integran en la etapa 4.
    // Guardar nunca se presenta como confirmación de un correo enviado.
    return NextResponse.json({ ok: true, evaluacionId: evaluacion.id, correo: "no_enviado", mensaje: "Evaluación guardada. El envío de resultados se habilitará con la publicación." }, { status: 201 })
  } catch (error) {
    if (error instanceof InvalidEvaluation) return NextResponse.json({ error: error.message }, { status: 400 })
    if (error instanceof PatientConflict || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) return NextResponse.json({ error: error instanceof PatientConflict && error.message ? error.message : "El RUT ya está registrado con otros datos o se está registrando. Revisa la identidad antes de continuar." }, { status: 409 })
    console.error("No se pudo guardar la evaluación", error instanceof Error ? error.name : "Error")
    return NextResponse.json({ error: "No pudimos guardar la evaluación. Intenta nuevamente." }, { status: 500 })
  }
}
