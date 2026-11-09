"use client"
import { signOut } from "next-auth/react"
import { useState } from "react"
export function FamilyLogout() {
  const [busy, setBusy] = useState(false)
  return <button type="button" disabled={busy} className="rounded-lg border px-3 py-2 disabled:opacity-50" onClick={async () => { setBusy(true); try { await signOut({ redirectTo: "/login?portal=familias" }) } finally { setBusy(false) } }}>{busy ? "Cerrando…" : "Cerrar sesión"}</button>
}
