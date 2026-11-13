import type { DefaultSession } from "next-auth"
import type { AuthRole } from "@/lib/roles"
declare module "next-auth" {
  interface User { teamSessionToken?: string; role?: AuthRole; teamVersion?: number; mustChangePassword?:boolean }
  interface Session { user: DefaultSession["user"] & { id: string; teamSessionId?: string; role?: AuthRole; teamVersion?: number; mustChangePassword?:boolean } }
}
declare module "next-auth/jwt" { interface JWT { teamSessionToken?: string; teamSessionId?: string; teamExpiresAt?: string; id?: string; role?: AuthRole; revision?: string; teamVersion?: number; mustChangePassword?:boolean } }
