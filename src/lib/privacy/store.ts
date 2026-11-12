import { Prisma, type AutorizacionPrivacidad } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { PRIVACY_TEXT, PRIVACY_VERSION, PrivacyInputError, parsePrivacy, type PrivacyChoice } from "./policy"
export class PrivacyConflict extends Error {}
export type PrivacyActor = { id: string; role: string }
export async function trace(tx: Prisma.TransactionClient, actor: PrivacyActor, accion: string, recurso: string, recursoId: string) {
  await tx.accesoPrivado.create({ data: { actorId: actor.id, perfilActor: actor.role, accion, recurso, recursoId } })
}
function publicChoice(value: unknown) {
  const row = value && typeof value==="object" ? value as Record<string,unknown> : {}
  return { datos: row.datos===true, correoResultados: row.correoResultados===true, seguimiento: row.seguimiento===true }
}
const state = (row: AutorizacionPrivacidad) => ({ datos: row.datos, correoResultados: row.correoResultados, seguimiento: row.seguimiento, apoderadoId: row.apoderadoId, versionTexto: row.versionTexto })
export async function recordConsent(tx: Prisma.TransactionClient, context: { pacienteId: string; eventoId: string | null; ambito?: string; apoderadoId: string | null }, choice: PrivacyChoice, actor: PrivacyActor, declaration: { declarante: string; referencia?: string }, revision?: number) {
  const ambito = context.ambito ?? `evento:${context.eventoId}:bebe:${context.pacienteId}`
  const previous = await tx.autorizacionPrivacidad.findUnique({ where: { ambito } })
  // La persona y el evento/paciente se bloquean por el llamador. Nunca adoptar una aceptación antigua por coincidencia de correo.
  if (previous && revision !== undefined && previous.revision !== revision) throw new PrivacyConflict("Las autorizaciones cambiaron en otra pantalla. Actualiza antes de guardar.")
  if (!previous && revision !== undefined && revision !== 0) throw new PrivacyConflict("Actualiza las autorizaciones antes de continuar.")
  const next = { datos: choice.datos, correoResultados: choice.correoResultados, seguimiento: choice.seguimiento, apoderadoId: context.apoderadoId, versionTexto: PRIVACY_VERSION }
  if (previous && JSON.stringify(state(previous)) === JSON.stringify(next)) return previous
  const row = previous ? await tx.autorizacionPrivacidad.update({ where: { id: previous.id }, data: { ...next, revision: { increment: 1 } } }) : await tx.autorizacionPrivacidad.create({ data: { ambito, pacienteId: context.pacienteId, eventoId: context.eventoId, ...next } })
  await tx.cambioPrivacidad.create({ data: { autorizacionId: row.id, revision: row.revision, actorId: actor.id, perfilActor: actor.role, declarante: declaration.declarante, referencia: declaration.referencia ?? null, canal: actor.role === "APODERADO" ? "CUENTA_VERIFICADA" : "DOCUMENTO_REVISADO", versionTexto: PRIVACY_VERSION, textos: PRIVACY_TEXT, anterior: previous ? state(previous) : Prisma.DbNull, nueva: state(row) } })
  if (context.eventoId && context.apoderadoId) {
    if (!choice.datos || !choice.correoResultados) {
      await tx.$executeRaw`UPDATE "CorreoResultado" m SET estado='CANCELADO',"ultimoError"='PRIVACIDAD',"updatedAt"=CURRENT_TIMESTAMP FROM "ResultadoPublicado" p JOIN "Evaluacion" e ON e.id=p."evaluacionId" JOIN "EntradaFila" f ON f.id=e."filaId" JOIN "Inscripcion" i ON i.id=f."inscripcionId" WHERE m."publicacionId"=p.id AND i."pacienteId"=${context.pacienteId} AND i."eventoId"=${context.eventoId}::uuid AND p."apoderadoId"=${context.apoderadoId}::uuid AND m.estado IN ('PENDIENTE','FALLIDO')`
    } else {
      await tx.$executeRaw`UPDATE "CorreoResultado" m SET estado='PENDIENTE',"ultimoError"=NULL,"disponibleAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP FROM "ResultadoPublicado" p JOIN "Evaluacion" e ON e.id=p."evaluacionId" JOIN "EntradaFila" f ON f.id=e."filaId" JOIN "Inscripcion" i ON i.id=f."inscripcionId" WHERE m."publicacionId"=p.id AND i."pacienteId"=${context.pacienteId} AND i."eventoId"=${context.eventoId}::uuid AND p."apoderadoId"=${context.apoderadoId}::uuid AND m.estado='CANCELADO' AND m."ultimoError"='PRIVACIDAD' AND m."enviadoAt" IS NULL`
    }
  }
  if (context.eventoId && context.apoderadoId && (!choice.datos || !choice.correoResultados || !choice.seguimiento)) {
    await tx.ordenCorreo.updateMany({where:{estado:"PENDIENTE",...((choice.datos&&choice.correoResultados)?{etapa:{in:["SEMANA","MES"]}}:{}),publicacion:{apoderadoId:context.apoderadoId,evaluacion:{fila:{is:{inscripcion:{pacienteId:context.pacienteId,eventoId:context.eventoId}}}}}},data:{estado:"CANCELADO",motivo:"PRIVACIDAD"}})
  }
  await trace(tx, actor, "CAMBIAR_AUTORIZACION", "AUTORIZACION", row.id)
  return row
}
export async function requireDataConsent(tx: Prisma.TransactionClient, id: string | null | undefined, pacienteId: string, apoderadoId?: string | null) {
  if (id) await tx.$queryRaw`SELECT id FROM "AutorizacionPrivacidad" WHERE id=${id}::uuid FOR UPDATE`
  const row = id ? await tx.autorizacionPrivacidad.findUnique({ where: { id } }) : null
  if (!row?.datos || row.versionTexto !== PRIVACY_VERSION || row.pacienteId !== pacienteId || (apoderadoId !== undefined && row.apoderadoId !== apoderadoId)) throw new PrivacyConflict("La autorización de datos está pendiente o retirada. Solicita su registro antes de continuar con la evaluación.")
  return row
}
export async function familyPermissions(familyId: string, page = 1) {
  return prisma.$transaction(async tx => {
    const scopes = await tx.$queryRaw<Array<{ pacienteId: string; eventoId: string }>>`
      SELECT r."pacienteId",r."eventoId" FROM (
        SELECT i."pacienteId",i."eventoId",i."createdAt" FROM "Inscripcion" i JOIN "Paciente" p ON p.id=i."pacienteId"
          WHERE i."apoderadoId"=${familyId}::uuid AND p."apoderadoId"=${familyId}::uuid
        UNION ALL
        SELECT w."pacienteId",w."eventoId",w."createdAt" FROM "ListaEspera" w JOIN "Paciente" p ON p.id=w."pacienteId"
          WHERE w."apoderadoId"=${familyId}::uuid AND p."apoderadoId"=${familyId}::uuid AND w."inscripcionId" IS NULL
      ) r GROUP BY r."pacienteId",r."eventoId" ORDER BY MAX(r."createdAt") DESC,r."eventoId",r."pacienteId"
      OFFSET ${(page-1)*20} LIMIT 21`
    const autorizaciones = await Promise.all(scopes.slice(0,20).map(async scope => {
      const [baby,event,permission] = await Promise.all([
        tx.paciente.findUniqueOrThrow({where:{id:scope.pacienteId},select:{nombre:true}}),
        tx.evento.findUniqueOrThrow({where:{id:scope.eventoId},select:{nombre:true}}),
        tx.autorizacionPrivacidad.findFirst({where:{ambito:`evento:${scope.eventoId}:bebe:${scope.pacienteId}`,apoderadoId:familyId}}),
      ])
      return {...scope,bebe:baby.nombre,evento:event.nombre,autorizacion:permission?{id:permission.id,revision:permission.revision,version:permission.versionTexto,datos:permission.datos,correoResultados:permission.correoResultados,seguimiento:permission.seguimiento}:null}
    }))
    return {autorizaciones,pagina:page,hayMas:scopes.length>20}
  },{isolationLevel:"RepeatableRead"})
}
export async function familyConsentHistory(familyId: string, id: string, page: number) {
  return prisma.$transaction(async tx=>{
    const own=await tx.autorizacionPrivacidad.findFirst({where:{id,apoderadoId:familyId,paciente:{apoderadoId:familyId}},select:{id:true}})
    if(!own)return null
    const rows=await tx.cambioPrivacidad.findMany({where:{autorizacionId:id},orderBy:{revision:"desc"},skip:(page-1)*10,take:11,select:{revision:true,createdAt:true,canal:true,versionTexto:true,nueva:true}})
    return {pagina:page,hayMas:rows.length>10,cambios:rows.slice(0,10).map(row=>({...row,createdAt:row.createdAt.toISOString(),nueva:publicChoice(row.nueva)}))}
  },{isolationLevel:"RepeatableRead"})
}
export async function updateFamilyPermissions(familyId: string, raw: unknown) {
  const data = raw as Record<string, unknown>, choice = parsePrivacy(data?.privacidad, false)
  if (!Number.isSafeInteger(data?.revision) || Number(data.revision) < 0 || typeof data.eventoId !== "string" || typeof data.pacienteId !== "string" || data.pacienteId.length > 100) throw new PrivacyInputError("Actualiza la autorización antes de guardar.")
  return prisma.$transaction(async tx => {
    const patient = await tx.paciente.findFirst({ where: { id: String(data.pacienteId), apoderadoId: familyId } })
    if (!patient) return null
    // Evento antes de paciente: compartido con inscripción, vinculación y guardado clínico.
    const known = await tx.inscripcion.findFirst({ where: { pacienteId: patient.id, eventoId: String(data.eventoId), apoderadoId: familyId } }) || await tx.listaEspera.findFirst({ where: { pacienteId: patient.id, eventoId: String(data.eventoId), apoderadoId: familyId } })
    if (!known) return null
    await tx.$queryRaw`SELECT id FROM "Evento" WHERE id=${known.eventoId}::uuid FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM "Paciente" WHERE id=${patient.id} FOR UPDATE`
    if (!await tx.paciente.findFirst({ where: { id: patient.id, apoderadoId: familyId } })) return null
    const family = await tx.apoderado.findUniqueOrThrow({ where: { id: familyId } })
    if (!family.activo) return null
    const row = await recordConsent(tx, { pacienteId: patient.id, eventoId: known.eventoId, apoderadoId: familyId }, choice, { id: `familia:${familyId}`, role: "APODERADO" }, { declarante: family.nombre || "Apoderado verificado" }, Number(data.revision))
    await tx.inscripcion.updateMany({ where: { pacienteId: patient.id, eventoId: known.eventoId, apoderadoId: familyId }, data: { autorizacionId: row.id } })
    await tx.listaEspera.updateMany({ where: { pacienteId: patient.id, eventoId: known.eventoId, apoderadoId: familyId }, data: { autorizacionId: row.id } })
    return { revision: row.revision }
  })
}

export async function staffPermission(actor: { id: string; role: string; version: number }, eventoId: string, inscripcionId: string, declaration?: { declarante: string; referencia: string }, expectedRevision?: number) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Evento" WHERE id=${eventoId}::uuid FOR UPDATE`
    const inscription = await tx.inscripcion.findFirst({ where: { id: inscripcionId, eventoId }, include: { autorizacion: true } })
    if (!inscription) return null
    await tx.$queryRaw`SELECT id FROM "Paciente" WHERE id=${inscription.pacienteId} FOR UPDATE`
    const staff = await tx.cuentaEquipo.findUnique({ where: { id: actor.id } })
    if (!staff?.active || staff.version !== actor.version || staff.role !== actor.role || !["ADMIN","RECEPCION"].includes(actor.role)) throw new PrivacyConflict("Tu acceso cambió. Vuelve a ingresar.")
    let authorization = inscription.autorizacion
    if (declaration) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision! < 0) throw new PrivacyInputError("Actualiza la autorización antes de registrar el documento.")
      if ((authorization?.revision ?? 0) !== expectedRevision) throw new PrivacyConflict("La autorización cambió. Actualiza la pantalla y revisa la nueva declaración del apoderado.")
      if (authorization && !authorization.datos && await tx.cambioPrivacidad.findFirst({where:{autorizacionId:authorization.id,referencia:declaration.referencia},select:{id:true}})) throw new PrivacyConflict("Ese documento ya fue registrado antes de la retirada. Se requiere una nueva autorización del apoderado.")
      const paciente = await tx.paciente.findUniqueOrThrow({ where: { id: inscription.pacienteId } })
      if (paciente.apoderadoId !== inscription.apoderadoId) throw new PrivacyConflict("La vinculación requiere revisión antes de registrar la autorización.")
      const current = authorization?.apoderadoId === inscription.apoderadoId && authorization.versionTexto === PRIVACY_VERSION ? authorization : null
      // El equipo registra evidencia de datos; solo la cuenta verificada puede habilitar correo.
      authorization = await recordConsent(tx, { pacienteId: inscription.pacienteId, eventoId, apoderadoId: inscription.apoderadoId }, { version: PRIVACY_VERSION, datos: true, correoResultados: current?.correoResultados ?? false, seguimiento: current?.seguimiento ?? false }, actor, declaration)
      await tx.inscripcion.update({ where: { id: inscription.id }, data: { autorizacionId: authorization.id } })
    }
    await trace(tx, actor, "CONSULTAR", "AUTORIZACION_INSCRIPCION", inscription.id)
    return { datos: !!authorization?.datos && authorization.versionTexto === PRIVACY_VERSION, estado: authorization ? authorization.versionTexto !== PRIVACY_VERSION ? "PENDIENTE_RENOVACION" : authorization.datos ? "AUTORIZADO" : "RETIRADO" : "PENDIENTE", version: authorization?.versionTexto ?? null, revision: authorization?.revision ?? 0 }
  })
}
export async function privacyAudit(page: number, actor: PrivacyActor) {
  return prisma.$transaction(async tx => {
    await trace(tx, actor, "CONSULTAR", "AUDITORIA_PRIVACIDAD", `pagina:${page}`)
    const rows = await tx.accesoPrivado.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page-1)*50, take: 51 })
    const staff = await tx.cuentaEquipo.findMany({ where: { id: { in: [...new Set(rows.map(row => row.actorId))] } }, select: { id: true, name: true } })
    return { pagina: page, hayMas: rows.length>50, accesos: rows.slice(0,50).map(row => ({ ...row, createdAt: row.createdAt.toISOString(), actorNombre: staff.find(person => person.id===row.actorId)?.name ?? (row.perfilActor==="APODERADO" ? "Cuenta familiar" : "Sistema") })) }
  })
}
