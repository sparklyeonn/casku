import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { privateHash } from "@/lib/families/security"
import { TEAM_GLOBAL_LOGIN_LIMIT, TEAM_LOGIN_LIMIT, TEAM_LOGIN_WINDOW_MINUTES } from "./policy"
type Reservation = { clave: string; expiraAt: Date; cantidad: number }
export async function reserveAuthLimit(key: string, maximum: number, minutes: number) {
  const clave = privateHash(`team-auth:${key}`)
  // Una sentencia atómica, confirmada incluso si luego falla la contraseña.
  // El reloj y la ventana pertenecen a PostgreSQL, no al proceso que recibe el intento.
  const [row] = await prisma.$queryRaw<Reservation[]>`
    INSERT INTO "LimiteSolicitud" (clave,cantidad,"expiraAt")
    VALUES (${clave},1,CURRENT_TIMESTAMP + ${minutes} * interval '1 minute')
    ON CONFLICT (clave) DO UPDATE SET
      cantidad=CASE WHEN "LimiteSolicitud"."expiraAt"<=CURRENT_TIMESTAMP THEN 1 ELSE LEAST("LimiteSolicitud".cantidad+1,${maximum + 1}) END,
      "expiraAt"=CASE WHEN "LimiteSolicitud"."expiraAt"<=CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + ${minutes} * interval '1 minute' ELSE "LimiteSolicitud"."expiraAt" END
    RETURNING clave,cantidad,"expiraAt"`
  return row.cantidad <= maximum ? row : null
}
export async function reserveTeamLogin(email: string) {
  const global = await reserveAuthLimit("global", TEAM_GLOBAL_LOGIN_LIMIT, 1)
  if (!global) return null
  if (global.cantidad === 1) {
    await prisma.$executeRaw`DELETE FROM "LimiteSolicitud" WHERE "expiraAt"<CURRENT_TIMESTAMP AND clave IN (SELECT clave FROM "LimiteSolicitud" WHERE "expiraAt"<CURRENT_TIMESTAMP ORDER BY "expiraAt" LIMIT 100)`
  }
  return reserveAuthLimit(`account:${email}`, TEAM_LOGIN_LIMIT, TEAM_LOGIN_WINDOW_MINUTES)
}
export async function releaseSuccessfulLogin(tx: Prisma.TransactionClient, reservation: Reservation) {
  // Libera únicamente el intento correcto en la misma ventana; nunca borra fallos simultáneos.
  await tx.limiteSolicitud.updateMany({ where: { clave: reservation.clave, expiraAt: reservation.expiraAt, cantidad: { gt: 0 } }, data: { cantidad: { decrement: 1 } } })
}
