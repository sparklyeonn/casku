import { randomBytes, createHash } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { ConfirmedBooking } from "@/lib/calendly/booking"
import { chileToday } from "@/lib/families/input"
import { recordConsent, requireDataConsent, trace } from "@/lib/privacy/store"
import { ensureArrival, receptionSelect } from "./store"
import { ReceptionConflict } from "./http"
import type { CalendlyArrivalInput } from "./calendly-input"

// Calendly is read BEFORE this transaction. No HTTP requests or email calls under DB locks.
export async function registerCalendlyArrival(actor: { id: string; version: number }, input: CalendlyArrivalInput, booking: ConfirmedBooking) {
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex")
  const save = () => prisma.$transaction(async tx => {
    // Same lock order as reception, cancellations and queue reservations.
    await tx.$queryRaw`SELECT id FROM "Evento" WHERE id=${input.eventoId}::uuid FOR UPDATE`
    const staff = await tx.cuentaEquipo.findUnique({ where: { id: actor.id } })
    if (!staff?.active || staff.role !== "RECEPCION" || staff.version !== actor.version) throw new ReceptionConflict("Tu acceso cambió. Vuelve a iniciar sesión.")
    const event = await tx.evento.findUnique({ where: { id: input.eventoId } })
    if (!event || event.fecha.toISOString().slice(0, 10) !== booking.fecha) throw new ReceptionConflict("El evento debe tener la misma fecha de la cita en Santiago. Selecciona el evento correcto.")
    if (booking.fecha !== chileToday()) throw new ReceptionConflict("La llegada se confirma el día de la cita, según la fecha de Santiago.")
    if (booking.reservaId !== input.reservaId || booking.invitadoId !== input.invitadoId) throw new ReceptionConflict("La referencia de la cita cambió. Actualiza la agenda.")
    const linked = await tx.inscripcion.findUnique({ where: { calendlyInvitadoId: booking.invitadoId }, include: { paciente: true } })
    const retry = await tx.inscripcion.findUnique({ where: { id: input.id } })
    if (retry && retry.solicitudHash !== hash && retry.id !== linked?.id) throw new ReceptionConflict("Este envío corresponde a otro registro. Busca su inscripción.")
    let row = linked ?? (input.numero ? await tx.inscripcion.findUnique({ where: { eventoId_numero: { eventoId: event.id, numero: input.numero } }, include: { paciente: true } }) : null)
    if (input.numero && !row) throw new ReceptionConflict("No existe ese número en el evento. Revisa su comprobante.")
    if (row && (row.eventoId !== event.id || (input.numero && input.numero !== row.numero) || row.paciente.nombreNormalizado !== input.bebe.nombreNormalizado || row.paciente.fechaNacimiento.getTime() !== input.bebe.fechaNacimiento.getTime() || (input.bebe.rut && row.paciente.rut?.replace(/[.\s]/g, "").toUpperCase() !== input.bebe.rut))) throw new ReceptionConflict("La inscripción no coincide con el bebé confirmado. No se modificó ni se creó otra ficha.")
    if (row) {
      if ((row.calendlyInvitadoId && row.calendlyInvitadoId !== booking.invitadoId) || (row.calendlyReservaId && row.calendlyReservaId !== booking.reservaId)) throw new ReceptionConflict("La inscripción ya tiene otra cita vinculada. Solicita revisión de la reprogramación; no se reemplazó su historial.")
      if (linked && (linked.citaInicio?.getTime() !== booking.inicio.getTime() || linked.citaFin?.getTime() !== booking.fin.getTime())) throw new ReceptionConflict("El horario cambió después de confirmar la llegada. Solicita revisión antes de volver a llamar.")
      const guardian = row.contactoNombre || (row.apoderadoId ? (await tx.apoderado.findUnique({ where: { id: row.apoderadoId }, select: { nombre: true } }))?.nombre : null)
      if (guardian?.trim().toLocaleLowerCase("es-CL") !== input.nombreApoderado.toLocaleLowerCase("es-CL")) throw new ReceptionConflict("El apoderado no coincide. Corrige o revisa los datos por el procedimiento de Casku antes de vincular.")
      if (await tx.cancelacionInscripcion.findUnique({ where: { inscripcionId: row.id } })) throw new ReceptionConflict("La inscripción está cancelada; conserva su historial y requiere revisión.")
      // Existing consents (including withdrawals and optional email choices) are never overwritten.
      await tx.$queryRaw`SELECT id FROM "Paciente" WHERE id=${row.pacienteId} FOR UPDATE`
      await requireDataConsent(tx, row.autorizacionId, row.pacienteId, row.apoderadoId)
    } else {
      // An existing identity requires explicit selection, never an email-based merge.
      const candidates = await tx.paciente.findMany({ where: { OR: [
        { nombreNormalizado: input.bebe.nombreNormalizado, fechaNacimiento: input.bebe.fechaNacimiento },
        ...(input.bebe.rut ? [{ rut: { in: [input.bebe.rut, input.bebe.rut.replace(/(\d)(?=(\d{3})+-)/g, "$1.")] } }] : []),
      ] }, take: 2 })
      if (candidates.length) throw new ReceptionConflict("Ya existe una ficha con estos datos. Busca su inscripción y usa su número; si pertenece a otro evento, solicita revisión a Casku. No se duplicó el bebé.")
      if (event.inscritos >= event.cupos) throw new ReceptionConflict("El evento no tiene cupos locales disponibles. Administración debe revisar los cupos y las reservas de Calendly; no se aumentaron automáticamente.")
      if (await tx.listaEspera.findFirst({ where: { eventoId: event.id, estado: "PENDIENTE" }, select: { id: true } })) throw new ReceptionConflict("Hay una lista de espera pendiente. Administración debe revisar los cupos reservados para Calendly antes de incorporar otra inscripción.")
      // Serializes identical confirmed babies across different events as well.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${input.bebe.nombreNormalizado + ":" + input.bebe.fechaNacimiento.toISOString()}, 0))`
      if (await tx.paciente.findFirst({ where: { nombreNormalizado: input.bebe.nombreNormalizado, fechaNacimiento: input.bebe.fechaNacimiento }, select: { id: true } })) throw new ReceptionConflict("Otra recepción acaba de registrar esta ficha. Busca su inscripción antes de continuar.")
      const baby = await tx.paciente.create({ data: input.bebe })
      const authorization = await recordConsent(tx, { pacienteId: baby.id, eventoId: event.id, apoderadoId: null }, input.privacidad, { id: actor.id, role: "RECEPCION" }, { declarante: input.nombreApoderado, canal: "CASILLA_PRESENCIAL" })
      const updated = await tx.evento.update({ where: { id: event.id }, data: { inscritos: { increment: 1 }, ultimoNumero: { increment: 1 } } })
      row = await tx.inscripcion.create({ data: { id: input.id, solicitudHash: hash, calendlyReservaId: booking.reservaId, calendlyInvitadoId: booking.invitadoId, citaInicio: booking.inicio, citaFin: booking.fin, citaConfirmadaAt: new Date(), autorizacionId: authorization.id, eventoId: event.id, pacienteId: baby.id, numero: updated.ultimoNumero, qrToken: randomBytes(24).toString("base64url"), origen: "PREVIA", registradoPorId: actor.id, contactoNombre: input.nombreApoderado, contactoCorreo: input.correo, contactoTelefono: input.telefono || null }, include: { paciente: true } })
    }
    if (!linked) {
      await tx.inscripcion.update({ where: { id: row.id }, data: { calendlyReservaId: booking.reservaId, calendlyInvitadoId: booking.invitadoId, citaInicio: booking.inicio, citaFin: booking.fin, citaConfirmadaAt: new Date() } })
      await trace(tx, { id: actor.id, role: "RECEPCION" }, "VINCULAR_CITA_CALENDLY", "INSCRIPCION", row.id)
    }
    const result = await ensureArrival(tx, await tx.inscripcion.findUniqueOrThrow({ where: { id: row.id }, select: receptionSelect }), actor.id)
    if (result.nueva) await trace(tx, { id: actor.id, role: "RECEPCION" }, "CONFIRMAR_LLEGADA_CALENDLY", "INSCRIPCION", row.id)
    return { ...result, correo: "NO_PROGRAMADO" as const }
  }, { timeout: 15000 })
  for (let attempt = 0; ; attempt++) {
    try { return await save() } catch (error) {
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) continue
      throw error
    }
  }
}
