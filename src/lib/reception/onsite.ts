import { mailEvent } from "@/lib/events/mail-snapshot"
import { createHash, randomBytes } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { chileToday } from "@/lib/families/input"
import { ensureArrival, receptionSelect } from "./store"
import { ReceptionConflict } from "./http"
import type { OnsiteInput } from "./onsite-input"

export async function registerOnsite(staffId: string, input: OnsiteInput) {
  const hash = createHash("sha256").update(JSON.stringify({ staffId, ...input })).digest("hex")
  const save = () => prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Evento" WHERE "id" = ${input.eventoId}::uuid FOR UPDATE`
    const replay = await tx.inscripcion.findUnique({ where: { id: input.id }, select: { ...receptionSelect, registradoPorId: true, solicitudHash: true } })
    if (replay) {
      if (replay.registradoPorId !== staffId || replay.solicitudHash !== hash) throw new ReceptionConflict("Este envío ya corresponde a otro registro. Busca la inscripción antes de continuar.")
      return { ...await ensureArrival(tx, replay, staffId), nuevaInscripcion: false }
    }
    const event = await tx.evento.findUnique({ where: { id: input.eventoId } })
    if (!event) throw new ReceptionConflict("El evento no está disponible.")
    if (event.fecha.toISOString().slice(0, 10) !== chileToday()) throw new ReceptionConflict("La inscripción presencial se habilita el día del evento, según la fecha de Chile.")
    const matches = await tx.inscripcion.findMany({ where: { eventoId: event.id, paciente: { nombreNormalizado: input.bebe.nombreNormalizado, fechaNacimiento: input.bebe.fechaNacimiento }, OR: [{ contactoNombre: { equals: input.nombreApoderado, mode: "insensitive" } }, { apoderado: { is: { nombre: { equals: input.nombreApoderado, mode: "insensitive" } } } }] }, take: 2, select: { ...receptionSelect, paciente: { select: { nombre: true, rut: true } } } })
    if (matches.length > 1) throw new ReceptionConflict("Hay más de una inscripción con estos datos. Revisa los comprobantes antes de continuar.")
    if (matches[0]) {
      const known = matches[0]
      if (input.bebe.rut && known.paciente.rut && known.paciente.rut.replace(/\./g, "").toUpperCase() !== input.bebe.rut) throw new ReceptionConflict("El RUT no coincide con la inscripción existente. Revisa los datos antes de continuar.")
      return { ...await ensureArrival(tx, known, staffId), nuevaInscripcion: false }
    }
    if (event.inscritos >= event.cupos) throw new ReceptionConflict("No quedan cupos. Las inscripciones previas conservan su reserva aunque aún no hayan llegado.")
    if (input.bebe.rut) {
      const [body, digit] = input.bebe.rut.split("-"), formatted = `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${digit}`
      if (await tx.paciente.findFirst({ where: { rut: { in: [input.bebe.rut, formatted] } }, select: { id: true } })) throw new ReceptionConflict("El RUT ya está registrado. Busca su inscripción o solicita revisión a Casku; no se vinculó otro paciente.")
    }
    const baby = await tx.paciente.create({ data: input.bebe })
    const updated = await tx.evento.update({ where: { id: event.id }, data: { inscritos: { increment: 1 }, ultimoNumero: { increment: 1 } } })
    const row = await tx.inscripcion.create({ data: { id: input.id, solicitudHash: hash, eventoId: event.id, pacienteId: baby.id, numero: updated.ultimoNumero, qrToken: randomBytes(24).toString("base64url"), origen: "PRESENCIAL", registradoPorId: staffId, contactoNombre: input.nombreApoderado, contactoCorreo: input.correo, contactoTelefono: input.telefono || null, ...(input.correo ? { correo: { create: { datosEvento: mailEvent(event) } } } : {}) }, select: receptionSelect })
    return { ...await ensureArrival(tx, row, staffId), nuevaInscripcion: true }
  }, { timeout: 15000 })
  for (let attempt = 0; ; attempt++) {
    try { return await save() } catch (error) {
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) continue
      throw error
    }
  }
}
