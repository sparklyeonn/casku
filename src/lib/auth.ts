import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { teamAccount, teamRevision } from "./team/store"
import { verifyPassword } from "./passwords.mjs"
import { isRole } from "./roles"
import { consumeFamilyCode } from "./families/otp"
import { prisma } from "./prisma"

// Límite por proceso: sustituir por almacén compartido antes de escalar.
const attempts = new Map<string, { count: number; until: number }>()
export const { handlers, signIn, signOut, auth } = NextAuth({
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [Credentials({
    id: "equipo", name: "Equipo Casku",
    credentials: { email: { type: "email" }, password: { type: "password" } },
    async authorize(credentials) {
      if (typeof credentials.email !== "string" || typeof credentials.password !== "string" || credentials.email.length > 254) return null
      const email = credentials.email.toLowerCase().trim(), now = Date.now()
      for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key)
      const entry = attempts.get(email) ?? { count: 0, until: now + 15 * 60_000 }
      if (entry.count >= 5 || attempts.size > 10_000) return null
      entry.count++; attempts.set(email, entry)
      const account = await teamAccount({ email })
      if (!account?.active || !await verifyPassword(credentials.password, account.passwordHash)) return null
      attempts.delete(email)
      return { id: account.id, email: account.email, name: account.name, role: account.role, teamVersion: account.version }
    },
  }), Credentials({
    id: "familias", name: "Familias Casku",
    credentials: { desafioId: { type: "text" }, navegador: { type: "text" }, codigo: { type: "text" } },
    async authorize(credentials) {
      try {
        const family = await consumeFamilyCode(credentials)
        return family ? { id: `familia:${family.id}`, email: family.correo, name: family.nombre || "Apoderado", role: "APODERADO" as const } : null
      } catch { return null }
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.role === "APODERADO" || (!user && token.role === "APODERADO")) {
        const id = user?.id ?? token.id
        if (typeof id !== "string" || !/^familia:[a-f0-9-]{36}$/i.test(id)) return null
        const family = await prisma.apoderado.findUnique({ where: { id: id.slice(8) } })
        if (!family?.activo || (!user && token.revision !== `familia:${family.versionSesion}`)) return null
        token.id = id; token.role = "APODERADO"; token.revision = `familia:${family.versionSesion}`
        token.name = family.nombre || "Apoderado"; token.email = family.correo
        return token
      }
      const id = user?.id ?? token.id
      if (typeof id !== "string") return null
      const account = await teamAccount({ id })
      if (!account?.active || (user && user.teamVersion !== account.version) || (!user && token.revision !== teamRevision(account))) return null
      token.id = account.id; token.role = account.role; token.revision = teamRevision(account)
      token.name = account.name; token.email = account.email; token.teamVersion = account.version
      return token
    },
    async session({ session, token }) {
      session.user.teamVersion = typeof token.teamVersion === "number" ? token.teamVersion : undefined
      session.user.id = typeof token.id === "string" ? token.id : ""
      session.user.role = isRole(token.role) || token.role === "APODERADO" ? token.role : undefined
      return session
    },
  },
})
