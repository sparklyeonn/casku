import { PRIVACY_VERSION } from "@/lib/privacy/policy"
import { randomBytes } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { chileToday } from "@/lib/families/input"
import { mailEvent } from "@/lib/events/mail-snapshot"
import { mailFamily } from "@/lib/families/identity-snapshot"

// El llamador mantiene FOR UPDATE sobre Evento. No se asigna desde una lectura GET.
export async function promoteLocked(tx: Prisma.TransactionClient, eventoId: string, origen: string, limit = 20) {
  let event = await tx.evento.findUniqueOrThrow({ where: { id: eventoId } })
  const ids: string[] = []
  if (event.fecha.toISOString().slice(0, 10) < chileToday()) return ids
  for (let reviewed = 0; reviewed < limit && event.inscritos < event.cupos; reviewed++) {
    const head = await tx.listaEspera.findFirst({ where: { eventoId, estado: "PENDIENTE" }, orderBy: { orden: "asc" } })
    if (!head) break
    const existing = await tx.inscripcion.findUnique({ where: { eventoId_pacienteId: { eventoId, pacienteId: head.pacienteId } }, select: { id: true } })
    // Se comprueba antes de bloquear al paciente: nunca se reactiva una reserva cancelada.
    if (existing) {
      await tx.listaEspera.update({ where: { id: head.id }, data: { estado: "NO_ELEGIBLE", resueltaAt: new Date(), motivoResolucion: "Ya existe una inscripción de este bebé en el evento. Requiere revisión.", origenResolucion: origen } })
      continue
    }
    await tx.$queryRaw`SELECT id FROM "Paciente" WHERE id=${head.pacienteId} FOR UPDATE`
    const authorization = head.autorizacionId ? await tx.autorizacionPrivacidad.findUnique({ where: { id: head.autorizacionId } }) : null
    const [baby, family] = await Promise.all([tx.paciente.findUnique({ where: { id: head.pacienteId } }), tx.apoderado.findUnique({ where: { id: head.apoderadoId } })])
    if (!baby || !family?.activo || baby.apoderadoId !== family.id || !authorization?.datos || authorization.versionTexto !== PRIVACY_VERSION || authorization.eventoId !== eventoId || authorization.apoderadoId !== family.id || authorization.pacienteId !== baby.id) {
      await tx.listaEspera.update({ where: { id: head.id }, data: { estado: "NO_ELEGIBLE", resueltaAt: new Date(), motivoResolucion: "La cuenta, autorización o vinculación del bebé requiere revisión.", origenResolucion: origen } })
      continue
    }
    event = await tx.evento.update({ where: { id: eventoId }, data: { inscritos: { increment: 1 }, ultimoNumero: { increment: 1 } } })
    const registration = await tx.inscripcion.create({ data: { id: head.id, autorizacionId: head.autorizacionId, eventoId, pacienteId: baby.id, apoderadoId: family.id, solicitudHash: head.solicitudHash, origen: event.fecha.toISOString().slice(0, 10) === chileToday() ? "PRESENCIAL" : "PREVIA", numero: event.ultimoNumero, qrToken: randomBytes(24).toString("base64url"), correo: { create: { datosEvento: mailEvent(event), datosFamilia: mailFamily(baby.nombre, family.correo, true) } } } })
    await tx.listaEspera.update({ where: { id: head.id }, data: { estado: "ASIGNADA", inscripcionId: registration.id, resueltaAt: new Date(), motivoResolucion: "Cupo confirmado automáticamente por orden de lista.", origenResolucion: origen } })
    ids.push(registration.id)
  }
  return ids
}
