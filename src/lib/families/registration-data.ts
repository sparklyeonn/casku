import { Prisma, type Paciente } from "@prisma/client"
import { type RegistrationInput } from "./input"
import { RegistrationConflict } from "./http"
import { takeLimit } from "./security"
import { rutVariants } from "@/lib/data-corrections/input"
export async function prepareRegistrationFamily(tx: Prisma.TransactionClient, familyId: string, input: RegistrationInput, found: Paciente | null) {
  let baby = found
  if (baby) {
    await tx.$queryRaw`SELECT id FROM "Paciente" WHERE id=${baby.id} FOR UPDATE`
    baby = await tx.paciente.findFirst({ where: { id: baby.id, apoderadoId: familyId } })
    if (!baby) throw new RegistrationConflict("La ficha cambió. Actualiza tus datos.")
  }
  await tx.$queryRaw`SELECT id FROM "Apoderado" WHERE id=${familyId}::uuid FOR UPDATE`
  const family = await tx.apoderado.findUniqueOrThrow({ where: { id: familyId } })
  if ((input.revisionApoderado !== undefined && input.revisionApoderado !== family.revisionDatos) || (input.revisionApoderado === undefined && await tx.cambioDatos.findFirst({ where: { apoderadoId: familyId, perfilActor: { in: ["ADMIN", "RECEPCION"] } }, select: { id: true } }))) throw new RegistrationConflict("Se corrigieron datos de tu familia. Actualiza el formulario antes de inscribir para conservar la ficha correcta.")
  await takeLimit(tx, `registration:${familyId}`, 30, 60 * 60_000)
  if (!baby) {
    const details = input.nuevoBebe!
    if (details.rut) {
      const body = details.rut.slice(0, -2), digit = details.rut.slice(-1)
      const formatted = `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${digit}`
      if (await tx.paciente.findFirst({ where: { rut: { in: [details.rut, formatted] } } })) throw new RegistrationConflict("Estos datos necesitan revisión por Casku antes de vincular el bebé a tu cuenta.")
    }
    baby = await tx.paciente.create({ data: { ...details, apoderadoId: familyId } })
  }
  const perfil = { nombre: input.nombreApoderado, telefono: input.telefono || null, rut: input.rutApoderado }
  const previous = { nombre: family.nombre, telefono: family.telefono, rut: family.rut }
  if (JSON.stringify(perfil) !== JSON.stringify(previous)) {
    if (family.nombre && input.revisionApoderado !== family.revisionDatos) throw new RegistrationConflict("Los datos del apoderado cambiaron. Actualiza el formulario antes de inscribir.")
    if (perfil.rut && await tx.apoderado.findFirst({ where: { id: { not: familyId }, rut: { in: rutVariants(perfil.rut) } }, select: { id: true } })) throw new RegistrationConflict("El RUT del apoderado necesita revisión; no se combinaron cuentas.")
    const updatedFamily = await tx.apoderado.update({ where: { id: familyId }, data: { ...perfil, revisionDatos: { increment: 1 } } })
    await tx.cambioDatos.create({ data: { entidad: "APODERADO", registroId: familyId, apoderadoId: familyId, revision: updatedFamily.revisionDatos, actorId: `familia:${familyId}`, perfilActor: "APODERADO", motivo: "Datos confirmados al realizar la inscripción", anterior: previous, nueva: perfil } })
  }
  return { baby, family }
}
