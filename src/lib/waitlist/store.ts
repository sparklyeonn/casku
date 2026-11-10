import { createHash } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { chileToday, type RegistrationInput } from "@/lib/families/input"
import { RegistrationConflict } from "@/lib/families/http"
import { prepareRegistrationFamily } from "@/lib/families/registration-data"
const include = { evento: { select: { nombre: true, fecha: true } }, paciente: { select: { nombre: true, apoderadoId: true } }, inscripcion: { select: { numero: true } } } satisfies Prisma.ListaEsperaInclude
type Entry = Prisma.ListaEsperaGetPayload<{ include: typeof include }>
async function entrySummary(tx: Prisma.TransactionClient, row: Entry) {
  const posicion = row.estado === "PENDIENTE" ? 1 + await tx.listaEspera.count({ where: { eventoId: row.eventoId, estado: "PENDIENTE", orden: { lt: row.orden } } }) : null
  return { id: row.id, eventoId: row.eventoId, evento: row.evento.nombre, fechaEvento: row.evento.fecha.toISOString().slice(0, 10), nombreBebe: row.paciente.apoderadoId === row.apoderadoId ? row.paciente.nombre : row.nombreBebe, orden: row.orden, posicion, estado: row.estado, createdAt: row.createdAt.toISOString(), resueltaAt: row.resueltaAt?.toISOString() ?? null, motivo: row.motivoResolucion, numero: row.inscripcion?.numero ?? null }
}
export async function familyWaitlist(familyId: string, page: number) {
  return prisma.$transaction(async tx => {
    const rows = await tx.listaEspera.findMany({ where: { apoderadoId: familyId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 20, take: 21, include })
    return { solicitudes: await Promise.all(rows.slice(0, 20).map(row => entrySummary(tx, row))), pagina: page, hayMas: rows.length > 20 }
  }, { isolationLevel: "RepeatableRead" })
}
export type FamilyWaitlist = Awaited<ReturnType<typeof familyWaitlist>>
export async function joinWaitlist(familyId: string, input: RegistrationInput) {
  const hash = createHash("sha256").update(JSON.stringify({ tipo: "LISTA_ESPERA", familyId, ...input })).digest("hex")
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Evento" WHERE id=${input.eventoId}::uuid FOR UPDATE`
    const replay = await tx.listaEspera.findUnique({ where: { id: input.id }, include })
    if (replay) {
      if (replay.apoderadoId !== familyId || replay.solicitudHash !== hash) throw new RegistrationConflict("Este envío corresponde a otra solicitud. Actualiza tu cuenta.")
      return entrySummary(tx, replay)
    }
    if (await tx.inscripcion.findUnique({ where: { id: input.id }, select: { id: true } })) throw new RegistrationConflict("Este envío ya corresponde a una inscripción.")
    const event = await tx.evento.findUnique({ where: { id: input.eventoId } })
    if (!event || !event.inscripcionesAbiertas || event.fecha.toISOString().slice(0, 10) < chileToday()) throw new RegistrationConflict("El evento no admite nuevas solicitudes de lista de espera.")
    const baby = input.bebeId ? await tx.paciente.findFirst({ where: { id: input.bebeId, apoderadoId: familyId } }) : await tx.paciente.findFirst({ where: { apoderadoId: familyId, nombreNormalizado: input.nuevoBebe!.nombreNormalizado, fechaNacimiento: input.nuevoBebe!.fechaNacimiento } })
    if (input.bebeId && !baby) throw new RegistrationConflict("Selecciona un bebé vinculado a tu cuenta.")
    if (baby) {
      if (await tx.inscripcion.findUnique({ where: { eventoId_pacienteId: { eventoId: event.id, pacienteId: baby.id } }, select: { id: true } })) throw new RegistrationConflict("El bebé ya tiene una inscripción en este evento, vigente o cancelada. No se crea otra reserva desde la lista de espera.")
      const pending = await tx.listaEspera.findFirst({ where: { eventoId: event.id, pacienteId: baby.id, estado: "PENDIENTE" }, include })
      if (pending) return entrySummary(tx, pending)
    }
    const waiting = await tx.listaEspera.count({ where: { eventoId: event.id, estado: "PENDIENTE" } })
    if (event.inscritos < event.cupos && waiting === 0) throw new RegistrationConflict("Hay cupos disponibles. Confirma una inscripción en lugar de entrar a la lista de espera.")
    const prepared = await prepareRegistrationFamily(tx, familyId, input, baby)
    if (!prepared.family.activo) throw new RegistrationConflict("La cuenta familiar no está disponible.")
    const updated = await tx.evento.update({ where: { id: event.id }, data: { ultimoOrdenEspera: { increment: 1 } } })
    const row = await tx.listaEspera.create({ data: { id: input.id, eventoId: event.id, pacienteId: prepared.baby.id, apoderadoId: familyId, nombreBebe: prepared.baby.nombre, orden: updated.ultimoOrdenEspera, solicitudHash: hash }, include })
    return entrySummary(tx, row)
  }, { timeout: 15000 })
}
export async function withdrawWaitlist(familyId: string, id: string) {
  return prisma.$transaction(async tx => {
    const known = await tx.listaEspera.findFirst({ where: { id, apoderadoId: familyId }, select: { eventoId: true } })
    if (!known) return null
    await tx.$queryRaw`SELECT id FROM "Evento" WHERE id=${known.eventoId}::uuid FOR UPDATE`
    const row = await tx.listaEspera.findFirst({ where: { id, apoderadoId: familyId }, include })
    if (!row) return null
    if (row.estado === "ASIGNADA") throw new RegistrationConflict("El cupo ya está confirmado. Si no asistirás, cancela la inscripción desde su comprobante.")
    if (row.estado !== "PENDIENTE") return entrySummary(tx, row)
    const updated = await tx.listaEspera.update({ where: { id }, data: { estado: "RETIRADA", resueltaAt: new Date(), motivoResolucion: "La familia retiró su solicitud.", origenResolucion: `familia:${familyId}` }, include })
    return entrySummary(tx, updated)
  })
}
export async function staffWaitlist(eventoId: string, page: number) {
  return prisma.$transaction(async tx => {
    const event = await tx.evento.findUnique({ where: { id: eventoId }, select: { id: true, nombre: true, cupos: true, inscritos: true } })
    if (!event) return null
    const [pending, rows] = await Promise.all([tx.listaEspera.count({ where: { eventoId, estado: "PENDIENTE" } }), tx.listaEspera.findMany({ where: { eventoId }, orderBy: { orden: "asc" }, skip: (page - 1) * 20, take: 21, include: { ...include, apoderado: { select: { nombre: true, correo: true } } } })])
    return { evento: event, pendientes: pending, pagina: page, hayMas: rows.length > 20, solicitudes: await Promise.all(rows.slice(0, 20).map(async row => ({ ...await entrySummary(tx, row), apoderado: row.apoderado.nombre || "Familia", correo: row.apoderado.correo }))) }
  }, { isolationLevel: "RepeatableRead" })
}
export type StaffWaitlist = NonNullable<Awaited<ReturnType<typeof staffWaitlist>>>

export async function ownWaitlistEntry(familyId: string, id: string) {
  return prisma.$transaction(async tx => {
    const row = await tx.listaEspera.findFirst({ where: { id, apoderadoId: familyId }, include })
    return row ? entrySummary(tx, row) : null
  }, { isolationLevel: "RepeatableRead" })
}
