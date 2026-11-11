import { parsePrivacy } from "@/lib/privacy/policy"
import { recordConsent } from "@/lib/privacy/store"
import { mailFamily } from "@/lib/families/identity-snapshot"
import { mailEvent } from "@/lib/events/mail-snapshot"
import type { Prisma, VinculacionPresencial } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { privateHash, takeLimit } from "@/lib/families/security"
import { ReceptionConflict } from "@/lib/reception/http"
import { LINK_HOURS } from "./input"
import type { invitationInput } from "./input"

function secretFor(id: string) { return Buffer.from(privateHash(`link-secret:${id}`), "hex").subarray(0, 16).toString("base64url") }
const codeHash = (code: string) => privateHash(`link-code:${code}`)
function state(row: VinculacionPresencial) { return row.consumidaAt ? "VINCULADA" : row.revocadaAt ? "REVOCADA" : row.expiraAt <= new Date() ? "VENCIDA" : "PENDIENTE" }
function invitationSummary(row: VinculacionPresencial, staffId: string) { return { id: row.id, correo: row.correo, expiraAt: row.expiraAt.toISOString(), estado: state(row), propia: row.creadoPorId === staffId } }
async function source(tx: Prisma.TransactionClient, eventoId: string, inscripcionId: string) {
  const known = await tx.inscripcion.findFirst({ where: { id: inscripcionId, eventoId }, select: { pacienteId: true } })
  if (!known) return null
  // Orden compartido: evento, paciente y después invitación; nunca se bloquea por correo.
  await tx.$queryRaw`SELECT "id" FROM "Evento" WHERE "id" = ${eventoId}::uuid FOR UPDATE`
  await tx.$queryRaw`SELECT "id" FROM "Paciente" WHERE "id" = ${known.pacienteId} FOR UPDATE`
  return tx.inscripcion.findFirst({ where: { id: inscripcionId, eventoId }, include: { paciente: true, cancelacion: true } })
}
export async function linkStatus(staffId: string, eventoId: string, inscripcionId: string) {
  const row = await prisma.inscripcion.findFirst({ where: { id: inscripcionId, eventoId }, select: { cancelacion: { select: { id: true } }, apoderadoId: true, registradoPorId: true, origen: true, contactoCorreo: true, paciente: { select: { apoderadoId: true } } } })
  if (!row) return null
  const invitation = await prisma.vinculacionPresencial.findFirst({ where: { inscripcionId, revocadaAt: null, consumidaAt: null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    || await prisma.vinculacionPresencial.findFirst({ where: { inscripcionId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
  return { cancelada: !!row.cancelacion, vinculada: !!row.apoderadoId && row.apoderadoId === row.paciente.apoderadoId, disponible: !row.cancelacion && row.origen === "PRESENCIAL" && !!row.registradoPorId && !row.apoderadoId && !row.paciente.apoderadoId, correoSugerido: row.contactoCorreo || "", vinculacion: invitation ? invitationSummary(invitation, staffId) : null }
}
export async function createInvitation(staffId: string, input: ReturnType<typeof invitationInput>) {
  return prisma.$transaction(async tx => {
    const row = await source(tx, input.eventoId, input.inscripcionId)
    if (!row) return null
    if (row.cancelacion) throw new ReceptionConflict("La inscripción está cancelada. No se puede emitir una vinculación nueva.")
    const existing = await tx.vinculacionPresencial.findUnique({ where: { id: input.id } })
    if (existing) {
      if (existing.creadoPorId !== staffId || existing.inscripcionId !== row.id || existing.pacienteId !== row.pacienteId || existing.correo !== input.correo) throw new ReceptionConflict("Este envío ya corresponde a otra invitación. Actualiza antes de continuar.")
      if (state(existing) !== "PENDIENTE" || row.apoderadoId || row.paciente.apoderadoId) return { vinculacion: invitationSummary(existing, staffId), codigo: null }
      const code = secretFor(existing.id)
      if (codeHash(code) !== existing.codigoHash) throw new ReceptionConflict("El código requiere renovación. Genera una invitación nueva.")
      return { vinculacion: invitationSummary(existing, staffId), codigo: code }
    }
    if (row.origen !== "PRESENCIAL" || !row.registradoPorId) throw new ReceptionConflict("Esta operación corresponde a inscripciones creadas en recepción.")
    if (row.apoderadoId || row.paciente.apoderadoId) throw new ReceptionConflict("La inscripción o la ficha ya tiene una cuenta asignada. No se cambió su propietario.")
    const now = new Date(), code = secretFor(input.id)
    await tx.vinculacionPresencial.updateMany({ where: { inscripcionId: row.id, revocadaAt: null, consumidaAt: null }, data: { revocadaAt: now, revocadaPorId: staffId } })
    const invitation = await tx.vinculacionPresencial.create({ data: { id: input.id, inscripcionId: row.id, pacienteId: row.pacienteId, correo: input.correo, codigoHash: codeHash(code), creadoPorId: staffId, expiraAt: new Date(now.getTime() + LINK_HOURS * 3600000) } })
    return { vinculacion: invitationSummary(invitation, staffId), codigo: code }
  }, { timeout: 15000 })
}
export async function revokeInvitation(staffId: string, eventoId: string, inscripcionId: string, id: string) {
  return prisma.$transaction(async tx => {
    if (!await source(tx, eventoId, inscripcionId)) return false
    const row = await tx.vinculacionPresencial.findFirst({ where: { id, inscripcionId } })
    if (!row) return false
    if (row.consumidaAt) throw new ReceptionConflict("La familia ya aceptó la vinculación. Revocar el código no puede quitarle el acceso.")
    if (!row.revocadaAt) await tx.vinculacionPresencial.update({ where: { id }, data: { revocadaAt: new Date(), revocadaPorId: staffId } })
    return true
  }, { timeout: 15000 })
}
export async function familyLink(familyId: string, code: string, accept: boolean, privacy?: unknown) {
  // Los intentos fallidos se devuelven como resultado para que el límite quede confirmado.
  return prisma.$transaction(async tx => {
    await takeLimit(tx, `family-link:${familyId}`, 10, 15 * 60000)
    const known = await tx.vinculacionPresencial.findUnique({ where: { codigoHash: codeHash(code) }, include: { inscripcion: { select: { eventoId: true } } } })
    const family = await tx.apoderado.findUnique({ where: { id: familyId } })
    if (!known || !family?.activo || known.correo !== family.correo) return { estado: "NO_DISPONIBLE" as const }
    const row = await source(tx, known.inscripcion.eventoId, known.inscripcionId)
    await tx.$queryRaw`SELECT "id" FROM "VinculacionPresencial" WHERE "id" = ${known.id}::uuid FOR UPDATE`
    const invite = await tx.vinculacionPresencial.findUniqueOrThrow({ where: { id: known.id } })
    if (!row || row.cancelacion || row.pacienteId !== invite.pacienteId || invite.revocadaAt || invite.correo !== family.correo) return { estado: "NO_DISPONIBLE" as const }
    const already = !!invite.consumidaAt && invite.apoderadoId === family.id && row.apoderadoId === family.id && row.paciente.apoderadoId === family.id
    if (invite.consumidaAt && !already) return { estado: "NO_DISPONIBLE" as const }
    if (!already && invite.expiraAt <= new Date()) return { estado: "NO_DISPONIBLE" as const }
    if ((row.apoderadoId && row.apoderadoId !== family.id) || (row.paciente.apoderadoId && row.paciente.apoderadoId !== family.id)) return { estado: "CONFLICTO" as const }
    const preview = { id: invite.id, inscripcionId: row.id, nombreBebe: row.paciente.nombre, fechaNacimiento: row.paciente.fechaNacimiento.toISOString().slice(0, 10), numero: row.numero, evento: (await tx.evento.findUniqueOrThrow({ where: { id: row.eventoId }, select: { nombre: true } })).nombre, expiraAt: invite.expiraAt.toISOString() }
    if (!accept || already) return { estado: "OK" as const, vinculada: already, vinculacion: preview }
    const normalized = row.paciente.nombreNormalizado || row.paciente.nombre.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es-CL")
    const collision = await tx.paciente.findFirst({ where: { id: { not: row.pacienteId }, apoderadoId: family.id, nombreNormalizado: normalized, fechaNacimiento: row.paciente.fechaNacimiento }, select: { id: true } })
    const otherOwner = await tx.inscripcion.findFirst({ where: { pacienteId: row.pacienteId, apoderadoId: { not: family.id } }, select: { id: true } })
    if (collision || otherOwner) return { estado: "CONFLICTO" as const }
    await tx.$queryRaw`SELECT id FROM "CorreoInscripcion" WHERE "inscripcionId"=${row.id}::uuid FOR UPDATE`
    const confirmation = await tx.correoInscripcion.findUnique({ where: { inscripcionId: row.id } })
    if (confirmation?.estado === "ENVIANDO") return { estado: "ENVIO_EN_CURSO" as const }
    const authorization = await recordConsent(tx, { pacienteId: row.pacienteId, eventoId: row.eventoId, apoderadoId: family.id }, parsePrivacy(privacy), { id: `familia:${family.id}`, role: "APODERADO" }, { declarante: family.nombre || "Apoderado verificado" })
    await tx.paciente.update({ where: { id: row.pacienteId }, data: { apoderadoId: family.id, revisionDatos: { increment: 1 } } })
    await tx.inscripcion.update({ where: { id: row.id }, data: { autorizacionId: authorization.id, apoderadoId: family.id, revisionContacto: { increment: 1 } } })
    await tx.vinculacionPresencial.update({ where: { id: invite.id }, data: { consumidaAt: new Date(), apoderadoId: family.id } })
    // La cuenta verificada obtiene una copia recuperable con su propio destinatario.
    // No se reutiliza la clave de un comprobante enviado al contacto presencial.
    await tx.correoInscripcion.upsert({ where: { inscripcionId: row.id }, create: { inscripcionId: row.id, datosFamilia: mailFamily(row.paciente.nombre, family.correo, true), datosEvento: mailEvent(await tx.evento.findUniqueOrThrow({ where: { id: row.eventoId } })) }, update: { datosFamilia: mailFamily(row.paciente.nombre, family.correo, true), revisionContenido: { increment: 1 }, estado: "PENDIENTE", disponibleAt: new Date(), bloqueoToken: null, bloqueoHasta: null, ultimoError: null, enviadoAt: null, proveedorId: null } })
    return { estado: "OK" as const, vinculada: true, vinculacion: preview }
  }, { timeout: 15000 })
}
