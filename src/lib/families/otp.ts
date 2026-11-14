import { randomBytes, randomInt, randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { normalizeEmail } from "./input"
import { privateHash, hashMatches, takeLimit } from "./security"
import { mailConfig, sendMail, escapeHtml } from "./mail"

export async function requestFamilyCode(emailValue: unknown, clientAddress: string) {
  const correo = normalizeEmail(emailValue)
  mailConfig()
  const desafioId = randomUUID(), navegador = randomBytes(32).toString("base64url"), code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const expiraAt = new Date(Date.now() + 10 * 60_000)
  await prisma.$transaction(async tx => {
    await takeLimit(tx, `code-minute:${correo}`, 1, 60_000)
    await takeLimit(tx, `code-hour:${correo}`, 5, 60 * 60_000)
    await takeLimit(tx, `code-address:${clientAddress}`, 20, 60 * 60_000)
    const values = { desafioId, codigoHash: privateHash(`otp:${desafioId}:${correo}:${code}`), navegadorHash: privateHash(`browser:${navegador}`), expiraAt, intentos: 0, consumidoAt: null }
    await tx.codigoAccesoFamilia.upsert({ where: { correo }, create: { correo, ...values }, update: values })
  })
  try {
    await sendMail({ to: correo, subject: "Tu código de acceso a Casku", text: `Tu código de acceso a Casku es ${code}. Vence en 10 minutos y se utiliza una sola vez. Si no lo solicitaste, ignora este correo.`, html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px"><h1>Ingresa a Casku</h1><p>Tu código de acceso es:</p><p style="font-size:32px;letter-spacing:6px">${escapeHtml(code)}</p><p>Vence en 10 minutos y se utiliza una sola vez. Si no lo solicitaste, ignora este mensaje.</p></div>` }, `access-${desafioId}`, "ACCESO")
  } catch (error) {
    await prisma.codigoAccesoFamilia.updateMany({ where: { correo, desafioId }, data: { consumidoAt: new Date() } })
    throw error
  }
  return { desafioId, navegador, expiraEnSegundos: 600 }
}

export async function consumeFamilyCode(credentials: Partial<Record<"desafioId" | "navegador" | "codigo", unknown>>) {
  const { desafioId, navegador, codigo } = credentials
  if (typeof desafioId !== "string" || !/^[a-f0-9-]{36}$/i.test(desafioId) || typeof navegador !== "string" || !/^[\w-]{43}$/.test(navegador) || typeof codigo !== "string" || !/^\d{6}$/.test(codigo)) return null
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{ correo: string }>>`SELECT "correo" FROM "CodigoAccesoFamilia" WHERE "desafioId" = ${desafioId}::uuid FOR UPDATE`
    if (!locked.length) return null
    const row = await tx.codigoAccesoFamilia.findUnique({ where: { correo: locked[0].correo } })
    if (!row || row.desafioId !== desafioId || row.consumidoAt || row.intentos >= 5 || row.expiraAt <= new Date()) return null
    await tx.codigoAccesoFamilia.update({ where: { correo: row.correo }, data: { intentos: { increment: 1 } } })
    if (!hashMatches(`browser:${navegador}`, row.navegadorHash) || !hashMatches(`otp:${desafioId}:${row.correo}:${codigo}`, row.codigoHash)) return null
    await tx.codigoAccesoFamilia.update({ where: { correo: row.correo }, data: { consumidoAt: new Date() } })
    const apoderado = await tx.apoderado.upsert({ where: { correo: row.correo }, create: { correo: row.correo }, update: {} })
    return apoderado.activo ? apoderado : null
  })
}
