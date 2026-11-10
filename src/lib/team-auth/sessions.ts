import { randomBytes, randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { releaseSuccessfulLogin } from "./limits"
import { privateHash } from "@/lib/families/security"
import { TEAM_ACTIVE_SESSIONS, TEAM_SESSION_HOURS, TEAM_SESSION_IDLE_MINUTES } from "./policy"
// Solo se usa para igualar el trabajo de scrypt de cuentas inexistentes o inactivas.
export const DUMMY_PASSWORD_HASH = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`
export async function openTeamSession(account: { id: string; version: number; passwordHash: string }, reservation: { clave: string; expiraAt: Date; cantidad: number }) {
  const secret = randomBytes(32).toString("base64url"), id = randomUUID()
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "CuentaEquipo" WHERE id=${account.id} FOR UPDATE`
    const current = await tx.cuentaEquipo.findUnique({ where: { id: account.id } })
    if (!current?.active || current.version !== account.version || current.passwordHash !== account.passwordHash) return null
    await tx.$executeRaw`UPDATE "SesionEquipo" SET "revocadaAt"=CURRENT_TIMESTAMP,motivo='LIMITE_SESIONES' WHERE id IN (
      SELECT id FROM "SesionEquipo" WHERE "cuentaId"=${account.id} AND "revocadaAt" IS NULL AND "expiraAt">CURRENT_TIMESTAMP AND "actividadAt">CURRENT_TIMESTAMP-${TEAM_SESSION_IDLE_MINUTES}*interval '1 minute'
      ORDER BY "createdAt" DESC,id DESC OFFSET ${TEAM_ACTIVE_SESSIONS - 1})`
    await tx.$executeRaw`INSERT INTO "SesionEquipo" (id,"cuentaId","secretoHash",version,"expiraAt") VALUES (${id}::uuid,${account.id},${privateHash(`team-session:${secret}`)},${current.version},CURRENT_TIMESTAMP+${TEAM_SESSION_HOURS}*interval '1 hour')`
    // Retención acotada: una muestra histórica de siete días, sin IP ni navegador.
    await tx.$executeRaw`DELETE FROM "SesionEquipo" WHERE id IN (SELECT id FROM "SesionEquipo" WHERE "expiraAt"<CURRENT_TIMESTAMP-interval '7 days' ORDER BY "expiraAt" LIMIT 100)`
    await releaseSuccessfulLogin(tx, reservation)
    return { secret, id }
  })
}
export async function validateTeamSession(secret: unknown, cuentaId: string, version: number) {
  if (typeof secret !== "string" || !/^[\w-]{43}$/.test(secret)) return null
  const [row] = await prisma.$queryRaw<Array<{ id: string; expiraAt: Date }>>`
    UPDATE "SesionEquipo" SET "actividadAt"=GREATEST("actividadAt",CURRENT_TIMESTAMP)
    WHERE "secretoHash"=${privateHash(`team-session:${secret}`)} AND "cuentaId"=${cuentaId} AND version=${version}
      AND "revocadaAt" IS NULL AND "expiraAt">CURRENT_TIMESTAMP
      AND "actividadAt">CURRENT_TIMESTAMP-${TEAM_SESSION_IDLE_MINUTES}*interval '1 minute'
      AND EXISTS(SELECT 1 FROM "CuentaEquipo" WHERE id=${cuentaId} AND active=true AND version=${version})
    RETURNING id,"expiraAt"`
  return row ?? null
}
export async function closeTeamSession(secret: unknown) {
  if (typeof secret !== "string" || !/^[\w-]{43}$/.test(secret)) return
  await prisma.$executeRaw`UPDATE "SesionEquipo" SET "revocadaAt"=CURRENT_TIMESTAMP,motivo='CIERRE_SESION' WHERE "secretoHash"=${privateHash(`team-session:${secret}`)} AND "revocadaAt" IS NULL`
}
export async function ownTeamSessions(cuentaId: string, currentId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; createdAt: Date; actividadAt: Date; expiraAt: Date }>>`
    SELECT id,"createdAt","actividadAt","expiraAt" FROM "SesionEquipo"
    WHERE "cuentaId"=${cuentaId} AND "revocadaAt" IS NULL AND "expiraAt">CURRENT_TIMESTAMP
      AND "actividadAt">CURRENT_TIMESTAMP-${TEAM_SESSION_IDLE_MINUTES}*interval '1 minute'
    ORDER BY "createdAt" DESC,id DESC LIMIT ${TEAM_ACTIVE_SESSIONS}`
  return { sesiones: rows.map(row => ({ id: row.id, actual: row.id === currentId, inicio: row.createdAt.toISOString(), actividad: row.actividadAt.toISOString(), vence: row.expiraAt.toISOString() })) }
}
export async function revokeOwnSessions(actor: { id: string; version: number; sessionId: string }, target: string | null) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "CuentaEquipo" WHERE id=${actor.id} FOR UPDATE`
    const [valid] = await tx.$queryRaw<Array<{ id: string }>>`SELECT s.id FROM "SesionEquipo" s JOIN "CuentaEquipo" c ON c.id=s."cuentaId"
      WHERE s.id=${actor.sessionId}::uuid AND c.id=${actor.id} AND c.active=true AND c.version=${actor.version} AND s.version=c.version
      AND s."revocadaAt" IS NULL AND s."expiraAt">CURRENT_TIMESTAMP AND s."actividadAt">CURRENT_TIMESTAMP-${TEAM_SESSION_IDLE_MINUTES}*interval '1 minute'`
    if (!valid) return null
    const rows = await tx.$queryRaw<Array<{ id: string }>>`UPDATE "SesionEquipo" SET "revocadaAt"=CURRENT_TIMESTAMP,motivo='CIERRE_REMOTO'
      WHERE "cuentaId"=${actor.id} AND (${target}::uuid IS NULL OR id=${target}::uuid) AND "revocadaAt" IS NULL RETURNING id`
    return { cerradas: rows.length, cerrarActual: target === null || target === actor.sessionId }
  })
}
