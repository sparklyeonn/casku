import { createHmac, randomUUID } from "node:crypto"
import type { PrismaClient } from "@prisma/client"
import { brevoPayload, postBrevo, MailUnavailable, type BrevoConfig, type MailMessage, type MailPurpose } from "./brevo.ts"

// Solo metadatos: nunca se persisten código, enlace, destinatario ni cuerpo.
export async function deliverOnce(db: PrismaClient, message: MailMessage, key: string, purpose: MailPurpose, config: BrevoConfig) {
  const payload = brevoPayload(message,config,key)
  const hash = createHmac("sha256",config.secret).update(JSON.stringify({purpose,payload})).digest("hex")
  const lock = randomUUID()
  const decision = await db.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "EnvioTransaccional" (clave,finalidad,"hashMensaje") VALUES (${key},${purpose},${hash}) ON CONFLICT (clave) DO NOTHING`
    await tx.$queryRaw`SELECT clave FROM "EnvioTransaccional" WHERE clave=${key} FOR UPDATE`
    let row = await tx.envioTransaccional.findUniqueOrThrow({where:{clave:key}})
    if (row.estado === "REVISION" && row.hashMensaje === null) return {error:"INCIERTO" as const}
    if (row.hashMensaje !== hash || row.finalidad !== purpose) return {error:"PERMANENTE" as const}
    if (row.estado === "ACEPTADO" && row.proveedorId) return {id:row.proveedorId}
    if (row.estado === "ENVIANDO") {
      const expired = await tx.$queryRaw<Array<{clave:string}>>`SELECT clave FROM "EnvioTransaccional" WHERE clave=${key} AND "bloqueoHasta"<CURRENT_TIMESTAMP::timestamptz(3)`
      if (!expired.length) return {error:"TRANSITORIO" as const}
      row = await tx.envioTransaccional.update({where:{clave:key},data:{estado:"REVISION",motivo:"INTERRUMPIDO",bloqueoToken:null,bloqueoHasta:null}})
    }
    if (["REVISION","RECHAZADO"].includes(row.estado)) return {error:row.estado === "REVISION" ? "INCIERTO" as const : "PERMANENTE" as const}
    if (row.intentos >= 5) {
      await tx.envioTransaccional.update({where:{clave:key},data:{estado:"RECHAZADO",motivo:"LIMITE_REINTENTOS"}})
      return {error:"PERMANENTE" as const}
    }
    const ready = await tx.$queryRaw<Array<{clave:string}>>`SELECT clave FROM "EnvioTransaccional" WHERE clave=${key} AND "disponibleAt"<=CURRENT_TIMESTAMP::timestamptz(3)`
    if (!ready.length) return {error:"TRANSITORIO" as const}
    await tx.$executeRaw`UPDATE "EnvioTransaccional" SET estado='ENVIANDO',intentos=intentos+1,"bloqueoToken"=${lock}::uuid,"bloqueoHasta"=CURRENT_TIMESTAMP+interval '2 minutes',"updatedAt"=CURRENT_TIMESTAMP WHERE clave=${key}`
    return {send:true}
  })
  if (decision.id) return decision.id
  if (decision.error) throw new MailUnavailable(decision.error)
  let providerId: string
  try { providerId = await postBrevo(config,payload) }
  catch(error) {
    const failure = error instanceof MailUnavailable ? error : new MailUnavailable("INCIERTO")
    const state = failure.kind === "TRANSITORIO" ? "REINTENTABLE" : failure.kind === "PERMANENTE" ? "RECHAZADO" : "REVISION"
    await db.$executeRaw`UPDATE "EnvioTransaccional" SET estado=${state},motivo=${failure.kind},"disponibleAt"=CURRENT_TIMESTAMP+${failure.retryAfterMs}*interval '1 millisecond',"bloqueoToken"=NULL,"bloqueoHasta"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE clave=${key} AND "bloqueoToken"=${lock}::uuid AND estado='ENVIANDO'`
    throw failure
  }
  // Si falla este guardado, el bloqueo vencido pasa a revisión y no repite el POST.
  const saved = await db.$executeRaw`UPDATE "EnvioTransaccional" SET estado='ACEPTADO',"proveedorId"=${providerId},motivo=NULL,"aceptadoAt"=CURRENT_TIMESTAMP,"bloqueoToken"=NULL,"bloqueoHasta"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE clave=${key} AND "bloqueoToken"=${lock}::uuid AND estado='ENVIANDO'`
  if (!saved) throw new MailUnavailable("INCIERTO")
  return providerId
}
