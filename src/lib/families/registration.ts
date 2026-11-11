import { cancellationSelect, cancellationSummary } from "@/lib/cancellations/store"
import { mailFamily } from "./identity-snapshot"
import { prepareRegistrationFamily } from "./registration-data"
import { createHash, randomBytes } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { chileToday, type RegistrationInput } from "./input"
import { RegistrationConflict } from "./http"
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
    if (await tx.listaEspera.findUnique({ where: { id: input.id } })) throw new RegistrationConflict("Este envío corresponde a una lista de espera. Consulta su estado en tu cuenta.")
    if (await tx.listaEspera.findFirst({ where: { eventoId: event.id, estado: "PENDIENTE" }, select: { id: true } })) throw new RegistrationConflict("Los cupos disponibles corresponden primero a la lista de espera. No se adelantó esta inscripción.")
    if (event.inscritos >= event.cupos) throw new RegistrationConflict("Este evento ya no tiene cupos disponibles.")
    const prepared = await prepareRegistrationFamily(tx, familyId, input, baby)
    baby = prepared.baby
    const family = prepared.family
    const updated = await tx.evento.update({ where: { id: event.id }, data: { inscritos: { increment: 1 }, ultimoNumero: { increment: 1 } } })
    return tx.inscripcion.create({ data: { id: input.id, autorizacionId: prepared.autorizacion.id, solicitudHash: hash, eventoId: event.id, pacienteId: baby.id, apoderadoId: familyId, origen: event.fecha.toISOString().slice(0, 10) === today ? "PRESENCIAL" : "PREVIA", numero: updated.ultimoNumero, qrToken: randomBytes(24).toString("base64url"), correo: { create: { datosEvento: mailEvent(event), datosFamilia: mailFamily(baby.nombre, family.correo, true) } } }, include: registrationInclude })
  }, { timeout: 15000 })
  for (let attempt = 0; ; attempt++) {
    try { return await save() } catch (error) {
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) continue
      throw error
    }
  }
}
