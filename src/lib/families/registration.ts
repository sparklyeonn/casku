import { createHash, randomBytes } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { chileToday, type RegistrationInput } from "./input"
import { RegistrationConflict } from "./http"
import { takeLimit } from "./security"

export const registrationInclude = { evento: true, paciente: true, correo: true } satisfies Prisma.InscripcionInclude
type RegistrationRow = Prisma.InscripcionGetPayload<{ include: typeof registrationInclude }>
export function summarizeRegistration(row: RegistrationRow) {
  return { id: row.id, numero: row.numero, evento: { id: row.evento.id, nombre: row.evento.nombre, fecha: row.evento.fecha.toISOString().slice(0, 10), lugar: row.evento.lugar }, bebe: { id: row.paciente.id, nombre: row.paciente.nombre }, correo: { estado: row.correo?.estado ?? "PENDIENTE", reintentarDesde: row.correo?.disponibleAt.toISOString() ?? null } }
}
export async function createRegistration(familyId: string, input: RegistrationInput) {
  const hash = createHash("sha256").update(JSON.stringify({ familyId, ...input })).digest("hex")
  const save = () => prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Evento" WHERE "id" = ${input.eventoId}::uuid FOR UPDATE`
    const existingId = await tx.inscripcion.findUnique({ where: { id: input.id }, include: registrationInclude })
    if (existingId) {
      if (existingId.apoderadoId !== familyId || existingId.solicitudHash !== hash) throw new RegistrationConflict("Este envío ya corresponde a otra inscripción. Actualiza la página.")
      return existingId
    }
    const event = await tx.evento.findUnique({ where: { id: input.eventoId } })
    if (!event) throw new RegistrationConflict("El evento no está disponible.")
    let baby = input.bebeId
      ? await tx.paciente.findFirst({ where: { id: input.bebeId, apoderadoId: familyId } })
      : await tx.paciente.findFirst({ where: { apoderadoId: familyId, nombreNormalizado: input.nuevoBebe!.nombreNormalizado, fechaNacimiento: input.nuevoBebe!.fechaNacimiento } })
    if (input.bebeId && !baby) throw new RegistrationConflict("Selecciona un bebé vinculado a tu cuenta.")
    if (baby) {
      const existing = await tx.inscripcion.findUnique({ where: { eventoId_pacienteId: { eventoId: event.id, pacienteId: baby.id } }, include: registrationInclude })
      if (existing) return existing
    }
    if (!event.inscripcionesAbiertas || event.fecha.toISOString().slice(0, 10) < chileToday()) throw new RegistrationConflict("Las inscripciones de este evento están cerradas.")
    if (event.inscritos >= event.cupos) throw new RegistrationConflict("Este evento ya no tiene cupos disponibles.")
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
    await tx.apoderado.update({ where: { id: familyId }, data: { nombre: input.nombreApoderado, telefono: input.telefono || null, rut: input.rutApoderado } })
    const updated = await tx.evento.update({ where: { id: event.id }, data: { inscritos: { increment: 1 }, ultimoNumero: { increment: 1 } } })
    return tx.inscripcion.create({ data: { id: input.id, solicitudHash: hash, eventoId: event.id, pacienteId: baby.id, apoderadoId: familyId, numero: updated.ultimoNumero, qrToken: randomBytes(24).toString("base64url"), correo: { create: {} } }, include: registrationInclude })
  }, { timeout: 15000 })
  for (let attempt = 0; ; attempt++) {
    try { return await save() } catch (error) {
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) continue
      throw error
    }
  }
}
