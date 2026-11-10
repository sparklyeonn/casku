import { Prisma, type CuentaEquipo } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getTeamAccounts, accountRevision } from "@/lib/team-accounts"
import { isRole } from "@/lib/roles"
import { hashPassword } from "@/lib/passwords.mjs"
import { privateHash } from "@/lib/families/security"
import type { accountInput } from "./input"
export class TeamConflict extends Error {}
export class TeamForbidden extends Error {}
// Una sola importación. Después, la configuración antigua nunca restaura claves o estados.
export async function initializeTeam() {
  if ((await prisma.registroEquipo.findUnique({ where: { id: 1 } }))?.importadoAt) return
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "RegistroEquipo" (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
    await lockRegistry(tx)
    if ((await tx.registroEquipo.findUniqueOrThrow({ where: { id: 1 } })).importadoAt) return
    const accounts = getTeamAccounts()
    if (accounts.some(account => account.id.startsWith("familia:") || account.id.length > 128)) throw new Error("Identificador del equipo inválido.")
    for (const account of accounts) await tx.cuentaEquipo.upsert({ where: { id: account.id }, create: account, update: {} })
    if (!await tx.cuentaEquipo.count({ where: { active: true, role: "ADMIN" } })) throw new Error("Se necesita una cuenta administradora inicial.")
    await tx.registroEquipo.update({ where: { id: 1 }, data: { importadoAt: new Date() } })
  }, { timeout: 15000 })
}
async function lockRegistry(tx: Prisma.TransactionClient) { await tx.$queryRaw`SELECT id FROM "RegistroEquipo" WHERE id=1 FOR UPDATE` }
export async function teamAccount(where: { id: string } | { email: string }) {
  await initializeTeam()
  const row = await prisma.cuentaEquipo.findUnique({ where })
  return row && isRole(row.role) ? { ...row, role: row.role } : null
}
export const teamRevision = (row: NonNullable<Awaited<ReturnType<typeof teamAccount>>>) => `${accountRevision(row)}:${row.version}`
export const safeAccount = (row: CuentaEquipo) => ({ id: row.id, email: row.email, name: row.name, role: row.role, active: row.active, version: row.version })
export async function listTeam(page: number, query: string) {
  const where = query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { email: { contains: query, mode: "insensitive" as const } }] } : {}
  const [rows, total] = await prisma.$transaction([prisma.cuentaEquipo.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 }), prisma.cuentaEquipo.count({ where })])
  return { cuentas: rows.map(safeAccount), total, pagina: page, hayMas: page * 20 < total }
}
export async function saveAccount(actor: { id: string; version: number }, id: string | null, input: ReturnType<typeof accountInput>) {
  const passwordHash = input.password ? await hashPassword(input.password) : undefined
  const solicitudHash = !id ? privateHash(`team-create:${JSON.stringify({ ...input, actorId: actor.id })}`) : null
  return prisma.$transaction(async tx => {
    await lockRegistry(tx)
    const admin = await tx.cuentaEquipo.findUnique({ where: { id: actor.id } })
    if (!admin?.active || admin.role !== "ADMIN" || admin.version !== actor.version) throw new TeamForbidden()
    if (!id) {
      const existing = await tx.cuentaEquipo.findUnique({ where: { id: input.id! } })
      if (existing) {
        if (existing.creadoPorId !== actor.id || existing.solicitudHash !== solicitudHash) throw new TeamConflict("Este envío ya corresponde a otra cuenta. Actualiza la lista.")
        return { cuenta: safeAccount(existing), creada: false }
      }
      const row = await tx.cuentaEquipo.create({ data: { id: input.id!, email: input.email, name: input.name, role: input.role, active: true, passwordHash: passwordHash!, creadoPorId: actor.id, solicitudHash } })
      await tx.cambioCuentaEquipo.create({ data: { cuentaId: row.id, actorId: actor.id, accion: "CREAR", nueva: safeAccount(row) } })
      return { cuenta: safeAccount(row), creada: true }
    }
    await tx.$queryRaw`SELECT id FROM "CuentaEquipo" WHERE id=${id} FOR UPDATE`
    const previous = await tx.cuentaEquipo.findUnique({ where: { id } })
    if (!previous) return null
    if (previous.version !== input.version) throw new TeamConflict("La cuenta cambió en otra pantalla. Actualiza la lista antes de guardar.")
    if (id === actor.id && (!input.active || input.role !== "ADMIN")) throw new TeamConflict("No puedes desactivar tu propia cuenta ni quitarte el perfil de administración.")
    const losesRole = previous.role !== input.role || !input.active
    if (previous.active && previous.role === "ADMIN" && losesRole && await tx.cuentaEquipo.count({ where: { active: true, role: "ADMIN" } }) <= 1) throw new TeamConflict("Debe quedar al menos una cuenta administradora activa.")
    if (losesRole && await tx.entradaFila.findFirst({ where: { profesionalId: id, estado: "EN_ATENCION" }, select: { id: true } })) throw new TeamConflict("Esta profesional tiene una atención activa. Debe finalizarla o devolverla a la fila antes de cambiar su perfil o desactivarla.")
    if (previous.email === input.email && previous.name === input.name && previous.role === input.role && previous.active === input.active && !passwordHash) return { cuenta: safeAccount(previous), creada: false }
    const row = await tx.cuentaEquipo.update({ where: { id }, data: { email: input.email, name: input.name, role: input.role, active: input.active, ...(passwordHash && { passwordHash }), version: { increment: 1 } } })
    await tx.sesionEquipo.updateMany({ where: { cuentaId: id, revocadaAt: null }, data: { revocadaAt: new Date(), motivo: "CAMBIO_CUENTA" } })
    await tx.cambioCuentaEquipo.create({ data: { cuentaId: id, actorId: actor.id, accion: "EDITAR", anterior: safeAccount(previous), nueva: { ...safeAccount(row), cambioContrasena: !!passwordHash } } })
    return { cuenta: safeAccount(row), creada: false }
  }, { timeout: 15000 })
}

export async function revokeAccountSessions(actor: { id: string; version: number }, id: string, version: number) {
  return prisma.$transaction(async tx => {
    await lockRegistry(tx)
    const admin = await tx.cuentaEquipo.findUnique({ where: { id: actor.id } })
    if (!admin?.active || admin.role !== "ADMIN" || admin.version !== actor.version) throw new TeamForbidden()
    if (id === actor.id) throw new TeamConflict("Cierra tus propias sesiones desde Seguridad y sesiones.")
    await tx.$queryRaw`SELECT id FROM "CuentaEquipo" WHERE id=${id} FOR UPDATE`
    const previous = await tx.cuentaEquipo.findUnique({ where: { id } })
    if (!previous) return null
    if (previous.version !== version) throw new TeamConflict("La cuenta cambió. Actualiza la lista antes de cerrar sus sesiones.")
    const row = await tx.cuentaEquipo.update({ where: { id }, data: { version: { increment: 1 } } })
    await tx.sesionEquipo.updateMany({ where: { cuentaId: id, revocadaAt: null }, data: { revocadaAt: new Date(), motivo: "CIERRE_ADMINISTRACION" } })
    await tx.cambioCuentaEquipo.create({ data: { cuentaId: id, actorId: actor.id, accion: "CERRAR_SESIONES", anterior: safeAccount(previous), nueva: safeAccount(row) } })
    return { cuenta: safeAccount(row) }
  })
}
