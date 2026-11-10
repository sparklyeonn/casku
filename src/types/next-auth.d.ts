import type { DefaultSession } from "next-auth"
import type { AuthRole } from "@/lib/roles"
declare module "next-auth" {
  interface User { role?: AuthRole; teamVersion?: number }
  interface Session { user: DefaultSession["user"] & { id: string; role?: AuthRole; teamVersion?: number } }
}
declare module "next-auth/jwt" { interface JWT { id?: string; role?: AuthRole; revision?: string; teamVersion?: number } }
