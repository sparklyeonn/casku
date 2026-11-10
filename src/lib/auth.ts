import { Prisma } from "@prisma/client"
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { teamAccount, teamRevision } from "./team/store"
import { verifyPassword } from "./passwords.mjs"
import { isRole } from "./roles"
import { consumeFamilyCode } from "./families/otp"
import { prisma } from "./prisma"

import { reserveTeamLogin } from "./team-auth/limits"
import { DUMMY_PASSWORD_HASH, openTeamSession, validateTeamSession, closeTeamSession } from "./team-auth/sessions"
export const { handlers, signIn, signOut, auth } = NextAuth({
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [Credentials({
    id: "equipo", name: "Equipo Casku",
    credentials: { email: { type: "email" }, password: { type: "password" } },
    async authorize(credentials) {
      if (typeof credentials.email !== "string" || typeof credentials.password !== "string" || credentials.email.length > 254 || credentials.password.length < 1 || credentials.password.length > 128) return null
      const email = credentials.email.toLowerCase().trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
      try {
        const reservation = await reserveTeamLogin(email)
        if (!reservation) return null
        const account = await teamAccount({ email })
        const correct = await verifyPassword(credentials.password, account?.active ? account.passwordHash : DUMMY_PASSWORD_HASH)
        if (!account?.active || !correct) return null
        const session = await openTeamSession(account, reservation)
        if (!session) return null
        return { id: account.id, email: account.email, name: account.name, role: account.role, teamVersion: account.version, teamSessionToken: session.secret }
      } catch (error) {
        console.error("Acceso del equipo temporalmente no disponible", error instanceof Error ? error.name : "Error", error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "")
        return null
      }
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
  events: {
    async signOut(message) { if ("token" in message) await closeTeamSession(message.token?.teamSessionToken) },
  },
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
      const activeSession = await validateTeamSession(user?.teamSessionToken ?? token.teamSessionToken, account.id, account.version)
      if (!activeSession) return null
      if (user) token.teamSessionToken = user.teamSessionToken
      token.teamSessionId = activeSession.id
      token.teamExpiresAt = activeSession.expiraAt.toISOString()
      token.id = account.id; token.role = account.role; token.revision = teamRevision(account)
      token.name = account.name; token.email = account.email; token.teamVersion = account.version
      return token
    },
    async session({ session, token }) {
      session.user.teamSessionId = typeof token.teamSessionId === "string" ? token.teamSessionId : undefined
      if (typeof token.teamExpiresAt === "string") session.expires = new Date(Math.min(new Date(session.expires).getTime(), new Date(token.teamExpiresAt).getTime())).toISOString() as typeof session.expires
      session.user.teamVersion = typeof token.teamVersion === "number" ? token.teamVersion : undefined
      session.user.id = typeof token.id === "string" ? token.id : ""
      session.user.role = isRole(token.role) || token.role === "APODERADO" ? token.role : undefined
      return session
    },
  },
})
