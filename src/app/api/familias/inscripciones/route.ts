import { prisma } from "@/lib/prisma"
import { getFamilyUser } from "@/lib/families/access"
import { parseRegistration } from "@/lib/families/input"
import { createRegistration, registrationInclude, summarizeRegistration } from "@/lib/families/registration"
import { deliverConfirmation } from "@/lib/families/confirmation"
import { familyFailure, familyJson, familyResponse } from "@/lib/families/http"
export async function GET() {
  const family = await getFamilyUser()
  if (!family) return familyResponse({ error: "Ingresa con tu cuenta familiar verificada." }, 401)
  try {
    const [inscripciones, bebes] = await prisma.$transaction([
      prisma.inscripcion.findMany({ where: { apoderadoId: family.id }, include: registrationInclude, orderBy: { createdAt: "desc" } }),
      prisma.paciente.findMany({ where: { apoderadoId: family.id }, select: { id: true, nombre: true, fechaNacimiento: true }, orderBy: { createdAt: "asc" } }),
    ])
    return familyResponse({ perfil: { nombre: family.nombre || "", telefono: family.telefono || "", rut: family.rut || "", correo: family.correo, revisionDatos: family.revisionDatos }, inscripciones: inscripciones.map(summarizeRegistration), bebes: bebes.map(baby => ({ ...baby, fechaNacimiento: baby.fechaNacimiento.toISOString().slice(0, 10) })) })
  } catch (error) { return familyFailure(error) }
}
export async function POST(request: Request) {
  const family = await getFamilyUser()
  if (!family) return familyResponse({ error: "Verifica tu correo antes de inscribir al bebé." }, 401)
  try {
    const input = parseRegistration(await familyJson(request))
    const created = await createRegistration(family.id, input)
    await deliverConfirmation(created.id)
    const row = await prisma.inscripcion.findUniqueOrThrow({ where: { id: created.id }, include: registrationInclude })
    return familyResponse({ inscripcion: summarizeRegistration(row) }, 201)
  } catch (error) { return familyFailure(error) }
}
