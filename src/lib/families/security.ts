import { createHmac, timingSafeEqual } from "node:crypto"
import type { Prisma } from "@prisma/client"

export class RequestLimited extends Error {}
export function privateHash(value: string) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("Falta el secreto de autenticación.")
  return createHmac("sha256", secret).update(value).digest("hex")
}
export function hashMatches(value: string, expected: string) {
  return /^[a-f0-9]{64}$/.test(expected) && timingSafeEqual(Buffer.from(privateHash(value), "hex"), Buffer.from(expected, "hex"))
}
export async function takeLimit(tx: Prisma.TransactionClient, key: string, limit: number, milliseconds: number) {
  const now = new Date(), expires = new Date(now.getTime() + milliseconds), hashedKey = privateHash(`limit:${key}`)
  const result = await tx.$queryRaw<Array<{ cantidad: number }>>`
    INSERT INTO "LimiteSolicitud" ("clave", "cantidad", "expiraAt") VALUES (${hashedKey}, 1, ${expires})
    ON CONFLICT ("clave") DO UPDATE SET
      "cantidad" = CASE WHEN "LimiteSolicitud"."expiraAt" <= ${now} THEN 1 ELSE "LimiteSolicitud"."cantidad" + 1 END,
      "expiraAt" = CASE WHEN "LimiteSolicitud"."expiraAt" <= ${now} THEN ${expires} ELSE "LimiteSolicitud"."expiraAt" END
    RETURNING "cantidad"`
  if (result[0].cantidad > limit) throw new RequestLimited()
}
