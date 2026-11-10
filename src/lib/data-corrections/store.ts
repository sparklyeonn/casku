import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { correctionInput } from "./input"
import { rutVariants } from "./input"
import type { Role } from "@/lib/roles"
export class DataConflict extends Error {}
export const dataSelect = {
  id: true, numero: true, eventoId: true, apoderadoId: true, contactoNombre: true, contactoCorreo: true, contactoTelefono: true, revisionContacto: true,
  evento: { select: { nombre: true } },
  paciente: { select: { id: true, nombre: true, fechaNacimiento: true, rut: true, nombreNormalizado: true, apoderadoId: true, revisionDatos: true } },
  apoderado: { select: { id: true, nombre: true, rut: true, telefono: true, correo: true, revisionDatos: true } },
} satisfies Prisma.InscripcionSelect
type Record = Prisma.InscripcionGetPayload<{ select: typeof dataSelect }>
export const babyData = (row: Record["paciente"]) => ({ nombre: row.nombre, rut: row.rut, fechaNacimiento: row.fechaNacimiento.toISOString().slice(0, 10) })
export const guardianData = (row: { nombre: string | null; rut: string | null; telefono: string | null }) => ({ nombre: row.nombre, rut: row.rut, telefono: row.telefono })
const contactData = (row: Record) => ({ nombre: row.contactoNombre || "", correo: row.contactoCorreo, telefono: row.contactoTelefono })
function consistent(row: Record) {
  if (row.apoderadoId !== row.paciente.apoderadoId) throw new DataConflict("La vinculación de esta ficha requiere revisión antes de corregir datos.")
}
function summary(row: Record) {
  consistent(row)
  return { id: row.id, numero: row.numero, evento: row.evento.nombre, bebe: { id: row.paciente.id, revision: row.paciente.revisionDatos, ...babyData(row.paciente) }, apoderado: row.apoderado ? { tipo: "CUENTA" as const, id: row.apoderado.id, revision: row.apoderado.revisionDatos, correo: row.apoderado.correo, ...guardianData(row.apoderado) } : { tipo: "CONTACTO" as const, id: row.id, revision: row.revisionContacto, ...contactData(row) } }
}
async function history(tx: Prisma.TransactionClient, row: Record, page: number) {
  const where = { OR: [{ entidad: "BEBE", registroId: row.paciente.id }, { entidad: "CONTACTO", registroId: row.id }, ...(row.apoderadoId ? [{ entidad: "APODERADO", registroId: row.apoderadoId }] : [])] }
  const changes = await tx.cambioDatos.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 21, select: { id: true, entidad: true, revision: true, actorId: true, perfilActor: true, motivo: true, anterior: true, nueva: true, createdAt: true } })
  const staff = await tx.cuentaEquipo.findMany({ where: { id: { in: changes.slice(0, 20).filter(change => change.perfilActor !== "APODERADO").map(change => change.actorId) } }, select: { id: true, name: true } })
  return { cambios: changes.slice(0, 20).map(change => ({ ...change, actorName: change.perfilActor === "APODERADO" ? "Cuenta familiar" : staff.find(account => account.id === change.actorId)?.name || "Cuenta del equipo", createdAt: change.createdAt.toISOString() })), pagina: page, hayMas: changes.length > 20 }
}
export async function recordDetail(eventoId: string, where: { id: string } | { numero: number } | { qrToken: string }, page = 1) {
  return prisma.$transaction(async tx => {
    const row = await tx.inscripcion.findFirst({ where: { eventoId, ...where }, select: dataSelect })
    if (!row) return null
    const ficha = summary(row)
    return { ficha, historial: await history(tx, row, page) }
  }, { isolationLevel: "RepeatableRead" })
}
export type DataDetail = NonNullable<Awaited<ReturnType<typeof recordDetail>>>
export async function correctRecord(actor: { id: string; role: Role; version: number }, eventoId: string, id: string, input: ReturnType<typeof correctionInput>) {
  return prisma.$transaction(async tx => {
    const known = await tx.inscripcion.findFirst({ where: { id, eventoId }, select: { pacienteId: true } })
    if (!known) return null
    // No se bloquean eventos: todas las reservas de atención toman después el mismo paciente.
    await tx.$queryRaw`SELECT id FROM "Paciente" WHERE id=${known.pacienteId} FOR UPDATE`
    let row = await tx.inscripcion.findFirstOrThrow({ where: { id, eventoId }, select: dataSelect })
    if (row.apoderadoId) await tx.$queryRaw`SELECT id FROM "Apoderado" WHERE id=${row.apoderadoId}::uuid FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM "Inscripcion" WHERE id=${id}::uuid FOR UPDATE`
    row = await tx.inscripcion.findFirstOrThrow({ where: { id, eventoId }, select: dataSelect })
    consistent(row)
    const staff = await tx.cuentaEquipo.findUnique({ where: { id: actor.id } })
    if (!staff?.active || staff.role !== actor.role || staff.version !== actor.version || !["ADMIN", "RECEPCION"].includes(staff.role)) throw new DataConflict("Tu acceso cambió. Vuelve a iniciar sesión.")
    const audit = { actorId: actor.id, perfilActor: actor.role, motivo: input.motivo, apoderadoId: row.apoderadoId }
    if (input.seccion === "BEBE") {
      const previous = babyData(row.paciente), next = { nombre: input.datos.nombre, rut: input.datos.rut, fechaNacimiento: input.datos.fechaNacimiento.toISOString().slice(0, 10) }
      if (JSON.stringify(previous) === JSON.stringify(next)) return { actualizado: false }
      if (row.paciente.revisionDatos !== input.revision) throw new DataConflict("Los datos del bebé cambiaron. Recarga antes de guardar.")
      if (await tx.entradaFila.findFirst({ where: { estado: "EN_ATENCION", inscripcion: { pacienteId: known.pacienteId } }, select: { id: true } })) throw new DataConflict("El bebé está en atención. Primero debe finalizarse o devolverse a la fila.")
      if (input.datos.rut && await tx.paciente.findFirst({ where: { id: { not: known.pacienteId }, rut: { in: rutVariants(input.datos.rut) } }, select: { id: true } })) throw new DataConflict("Ese RUT ya está en otra ficha. No se combinaron registros.")
      const events = await tx.inscripcion.findMany({ where: { pacienteId: known.pacienteId }, select: { eventoId: true } })
      const collision = await tx.paciente.findFirst({ where: { id: { not: known.pacienteId }, fechaNacimiento: input.datos.fechaNacimiento, AND: [{ OR: [{ nombreNormalizado: input.datos.nombreNormalizado }, { nombre: { equals: input.datos.nombre, mode: "insensitive" } }] }, { OR: [...(row.apoderadoId ? [{ apoderadoId: row.apoderadoId }] : []), { inscripciones: { some: { eventoId: { in: events.map(event => event.eventoId) } } } }] }] }, select: { id: true } })
      if (collision) throw new DataConflict("Los datos coinciden con otra ficha de la cuenta o del evento. Solicita revisión; no se duplicaron ni combinaron bebés.")
      const updated = await tx.paciente.update({ where: { id: known.pacienteId }, data: { ...input.datos, revisionDatos: { increment: 1 } } })
      if (row.apoderadoId) await tx.apoderado.update({ where: { id: row.apoderadoId }, data: { revisionDatos: { increment: 1 } } })
      await tx.cambioDatos.create({ data: { ...audit, entidad: "BEBE", registroId: updated.id, revision: updated.revisionDatos, anterior: previous, nueva: next } })
      await tx.vinculacionPresencial.updateMany({ where: { pacienteId: known.pacienteId, consumidaAt: null, revocadaAt: null }, data: { revocadaAt: new Date(), revocadaPorId: actor.id } })
    } else if (input.seccion === "APODERADO") {
      if (!row.apoderado) throw new DataConflict("Esta inscripción no tiene una cuenta familiar vinculada.")
      const previous = guardianData(row.apoderado)
      if (JSON.stringify(previous) === JSON.stringify(input.datos)) return { actualizado: false }
      if (row.apoderado.revisionDatos !== input.revision) throw new DataConflict("Los datos del apoderado cambiaron. Recarga antes de guardar.")
      if (input.datos.rut && await tx.apoderado.findFirst({ where: { id: { not: row.apoderado.id }, rut: { in: rutVariants(input.datos.rut) } }, select: { id: true } })) throw new DataConflict("Ese RUT figura en otra cuenta. Solicita revisión; no se cambió la vinculación.")
      const updated = await tx.apoderado.update({ where: { id: row.apoderado.id }, data: { ...input.datos, revisionDatos: { increment: 1 } } })
      await tx.cambioDatos.create({ data: { ...audit, entidad: "APODERADO", registroId: updated.id, revision: updated.revisionDatos, anterior: previous, nueva: input.datos } })
    } else {
      if (row.apoderadoId) throw new DataConflict("La inscripción ya tiene una cuenta verificada. Corrige su perfil familiar, no el contacto presencial.")
      const previous = contactData(row)
      if (JSON.stringify(previous) === JSON.stringify(input.datos)) return { actualizado: false }
      if (row.revisionContacto !== input.revision) throw new DataConflict("El contacto cambió. Recarga antes de guardar.")
      await tx.$queryRaw`SELECT id FROM "CorreoInscripcion" WHERE "inscripcionId"=${id}::uuid FOR UPDATE`
      const mail = await tx.correoInscripcion.findUnique({ where: { inscripcionId: id } })
      if (previous.correo !== input.datos.correo && mail?.estado === "ENVIANDO") throw new DataConflict("Hay un envío de confirmación en curso. Espera a que termine antes de corregir el correo.")
      const updated = await tx.inscripcion.update({ where: { id }, data: { contactoNombre: input.datos.nombre, contactoCorreo: input.datos.correo, contactoTelefono: input.datos.telefono, revisionContacto: { increment: 1 } } })
      if (previous.correo !== input.datos.correo) {
        await tx.correoInscripcion.upsert({ where: { inscripcionId: id }, create: { inscripcionId: id, datosFamilia: { nombreBebe: row.paciente.nombre, correo: input.datos.correo, conCuenta: false } }, update: { datosFamilia: { nombreBebe: row.paciente.nombre, correo: input.datos.correo, conCuenta: false }, revisionContenido: { increment: 1 }, estado: "PENDIENTE", disponibleAt: new Date(), bloqueoToken: null, bloqueoHasta: null, ultimoError: null, proveedorId: null, enviadoAt: null } })
      }
      await tx.cambioDatos.create({ data: { ...audit, entidad: "CONTACTO", registroId: updated.id, revision: updated.revisionContacto, anterior: previous, nueva: input.datos } })
      await tx.vinculacionPresencial.updateMany({ where: { inscripcionId: id, consumidaAt: null, revocadaAt: null }, data: { revocadaAt: new Date(), revocadaPorId: actor.id } })
    }
    return { actualizado: true }
  }, { timeout: 15000 })
}
