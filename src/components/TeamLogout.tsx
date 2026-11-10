"use client"
import { useRef, useState } from "react"
import { signOut } from "next-auth/react"
export function TeamLogout() {
  const [busy, setBusy] = useState(false), [error, setError] = useState("")
  const working = useRef(false)
  async function close() {
    if (working.current) return
    working.current = true; setBusy(true); setError("")
    try {
      const response = await fetch("/api/equipo/sesiones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "CERRAR_ACTUAL" }) })
      if (!response.ok) throw new Error("No pudimos confirmar el cierre. Reintenta; si tu sesión venció, vuelve a ingresar.")
      await signOut({ callbackUrl: "/login" })
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos confirmar el cierre. Reintenta.") }
    finally { working.current = false; setBusy(false) }
  }
  return <div><button type="button" disabled={busy} onClick={close} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{busy ? "Cerrando…" : "Cerrar sesión"}</button>{error && <p role="alert" className="mt-2 max-w-sm text-sm text-red-700 dark:text-red-200">{error}</p>}</div>
}
