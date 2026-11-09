import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { getTeamAccounts, accountRevision } from "./team-accounts"
import { verifyPassword } from "./passwords.mjs"
import { isRole } from "./roles"

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
      const account = getTeamAccounts().find(a => a.email === email && a.active)
      if (!account || !await verifyPassword(credentials.password, account.passwordHash)) return null
      attempts.delete(email)
      return { id: account.id, email: account.email, name: account.name, role: account.role }
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      const account = getTeamAccounts().find(a => a.active && a.id === (user?.id ?? token.id))
      if (!account || (!user && token.revision !== accountRevision(account))) return null
      token.id = account.id; token.role = account.role; token.revision = accountRevision(account)
      token.name = account.name; token.email = account.email
      return token
    },
    async session({ session, token }) {
      session.user.id = typeof token.id === "string" ? token.id : ""
      session.user.role = isRole(token.role) ? token.role : undefined
      return session
    },
  },
})
