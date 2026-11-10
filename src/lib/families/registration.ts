import { cancellationSelect, cancellationSummary } from "@/lib/cancellations/store"
import { mailFamily } from "./identity-snapshot"
import { rutVariants } from "@/lib/data-corrections/input"
import { createHash, randomBytes } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { chileToday, type RegistrationInput } from "./input"
import { RegistrationConflict } from "./http"
import { takeLimit } from "./security"
import { mailEvent } from "@/lib/events/mail-snapshot"

export const registrationInclude = { evento: true, paciente: true, correo: true, cancelacion: { select: cancellationSelect } } satisfies Prisma.InscripcionInclude
type RegistrationRow = Prisma.InscripcionGetPayload<{ include: typeof registrationInclude }>
export function summarizeRegistration(row: RegistrationRow) {
  return { cancelacion: row.cancelacion ? cancellationSummary(row.cancelacion) : null, id: row.id, numero: row.numero, origen: row.origen, evento: { id: row.evento.id, nombre: row.evento.nombre, fecha: row.evento.fecha.toISOString().slice(0, 10), lugar: row.evento.lugar }, bebe: { id: row.paciente.id, nombre: row.paciente.nombre }, correo: { estado: row.correo?.estado ?? "PENDIENTE", reintentarDesde: row.correo?.disponibleAt.toISOString() ?? null } }
}
export async function createRegistration(familyId: string, input: RegistrationInput) {
  const hash = createHash("sha256").update(JSON.stringify({ familyId, ...input })).digest("hex")
  const save = () => prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Evento" WHERE "id" = ${input.eventoId}::uuid FOR UPDATE`
    const existingId = await tx.inscripcion.findUnique({ where: { id: input.id }, include: registrationInclude })
    if (existingId) {
      if (existingId.apoderadoId !== familyId || existingId.solicitudHash !== hash) throw new RegistrationConflict("Este envío ya corresponde a otra inscripción. Actualiza la página.")
      if (existingId.cancelacion) throw new RegistrationConflict("Esta inscripción está cancelada. No se reactiva ni reserva otro cupo al reenviar el formulario.")
      return existingId
    }
    const event = await tx.evento.findUnique({ where: { id: input.eventoId } })
    if (!event) throw new RegistrationConflict("El evento no está disponible.")
    const today = chileToday()
    let baby = input.bebeId
      ? await tx.paciente.findFirst({ where: { id: input.bebeId, apoderadoId: familyId } })
      : await tx.paciente.findFirst({ where: { apoderadoId: familyId, nombreNormalizado: input.nuevoBebe!.nombreNormalizado, fechaNacimiento: input.nuevoBebe!.fechaNacimiento } })
    if (input.bebeId && !baby) throw new RegistrationConflict("Selecciona un bebé vinculado a tu cuenta.")
    if (baby) {
      const existing = await tx.inscripcion.findUnique({ where: { eventoId_pacienteId: { eventoId: event.id, pacienteId: baby.id } }, include: registrationInclude })
      if (existing?.cancelacion) throw new RegistrationConflict("El bebé ya tiene una inscripción cancelada en este evento. Solicita revisión a Casku; no se creó otra ficha ni se reactivó la reserva.")
      if (existing) return existing
    }
    if (!event.inscripcionesAbiertas || event.fecha.toISOString().slice(0, 10) < today) throw new RegistrationConflict("Las inscripciones de este evento están cerradas.")
    if (event.inscritos >= event.cupos) throw new RegistrationConflict("Este evento ya no tiene cupos disponibles.")
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
    const updated = await tx.evento.update({ where: { id: event.id }, data: { inscritos: { increment: 1 }, ultimoNumero: { increment: 1 } } })
    return tx.inscripcion.create({ data: { id: input.id, solicitudHash: hash, eventoId: event.id, pacienteId: baby.id, apoderadoId: familyId, origen: event.fecha.toISOString().slice(0, 10) === today ? "PRESENCIAL" : "PREVIA", numero: updated.ultimoNumero, qrToken: randomBytes(24).toString("base64url"), correo: { create: { datosEvento: mailEvent(event), datosFamilia: mailFamily(baby.nombre, family.correo, true) } } }, include: registrationInclude })
  }, { timeout: 15000 })
  for (let attempt = 0; ; attempt++) {
    try { return await save() } catch (error) {
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) continue
      throw error
    }
  }
}
