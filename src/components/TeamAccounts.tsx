"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useRouter } from "next/navigation"
import { roleLabels, roles, type Role } from "@/lib/roles"
type Account = { id: string; email: string; name: string; role: Role; active: boolean; version: number }
type List = { cuentas: Account[]; total: number; hayMas: boolean; miId: string }
type Form = { name: string; email: string; role: Role; active: boolean; password: string; confirmation: string }
const blank: Form = { name: "", email: "", role: "RECEPCION", active: true, password: "", confirmation: "" }
const field = "mt-2 w-full rounded-lg border bg-white p-3 text-gray-900 dark:bg-gray-900 dark:text-gray-100"
async function read(response: Response) {
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "No pudimos consultar las cuentas.")
  return data
}
export function TeamAccounts() {
  const [data, setData] = useState<List | null>(null), [page, setPage] = useState(1), [search, setSearch] = useState(""), [term, setTerm] = useState("")
  const [editing, setEditing] = useState<Account | null>(null), [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState("")
  const operation = useRef(false), creationId = useRef<string | null>(null), revision = useRef(0)
  const router = useRouter()
  const load = useCallback((signal?: AbortSignal) => {
    const version = revision.current
    return fetch(`/api/administracion/cuentas?pagina=${page}&buscar=${encodeURIComponent(term)}`, { cache: "no-store", signal }).then(read).then(result => {
      if (!signal?.aborted && version === revision.current) setData(result)
    }).catch(cause => { if (!signal?.aborted && version === revision.current) setError(cause instanceof Error ? cause.message : "No pudimos cargar las cuentas.") })
      .finally(() => { if (!signal?.aborted && version === revision.current) setLoading(false) })
  }, [page, term])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  function edit(account: Account | null) {
    if (operation.current) return
    setEditing(account); setForm(account ? { ...account, password: "", confirmation: "" } : blank); creationId.current = null; setError(""); setMessage("")
  }
  function change<K extends keyof Form>(key: K, value: Form[K]) { creationId.current = null; setForm(previous => ({ ...previous, [key]: value })) }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (operation.current) return
    if (form.password !== form.confirmation) { setError("Las contraseñas no coinciden."); return }
    operation.current = true; revision.current++; setBusy(true); setError(""); setMessage("")
    try {
      if (!editing) creationId.current ??= crypto.randomUUID()
      const values = { name: form.name, email: form.email, role: form.role, active: form.active, password: form.password }
      const payload = editing ? { ...values, version: editing.version } : { ...values, id: creationId.current }
      const result = await read(await fetch(`/api/administracion/cuentas${editing ? `/${encodeURIComponent(editing.id)}` : ""}`, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))
      setForm(blank); setEditing(null); creationId.current = null
      if (editing && editing.id === data?.miId && result.cuenta.version !== editing.version) { router.replace("/login"); router.refresh(); return }
      setMessage(editing ? result.cuenta.version === editing.version ? "La cuenta ya estaba actualizada." : "Cambios guardados. La persona deberá volver a iniciar sesión." : "Cuenta creada. Entrega la contraseña directamente a su titular por un medio seguro.")
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar. Reintenta el mismo envío o actualiza la lista.") }
    finally { operation.current = false; setBusy(false) }
  }
  async function closeSessions(account: Account) {
    if (operation.current) return
    operation.current = true; revision.current++; setBusy(true); setError(""); setMessage("")
    try {
      await read(await fetch(`/api/administracion/cuentas/${encodeURIComponent(account.id)}/sesiones`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: account.version }) }))
      setMessage(`Sesiones de ${account.name} cerradas. Deberá volver a ingresar; se conserva su contraseña y su trabajo guardado.`)
      if (editing?.id === account.id) { setEditing(null); setForm(blank) }
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cerrar las sesiones.") }
    finally { operation.current = false; setBusy(false) }
  }
  const self = !!editing && editing.id === data?.miId
  return <main className="mx-auto max-w-5xl space-y-7 px-5 py-8"><div><h1 className="text-3xl font-semibold">Cuentas del equipo</h1><p className="mt-3 text-gray-600 dark:text-gray-300">Gestiona quién ingresa a Casku y qué funciones puede utilizar. Las cuentas familiares se administran por separado.</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}{message && <p role="status" className="rounded-lg bg-teal-50 p-4 text-teal-900 dark:bg-teal-950 dark:text-teal-100">{message}</p>}
    <section className="space-y-5 rounded-2xl border p-6"><h2 className="text-2xl font-semibold">{editing ? `Editar cuenta de ${editing.name}` : "Crear cuenta"}</h2><form onSubmit={save} className="space-y-5"><fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2"><label className="block text-sm">Nombre<input required maxLength={120} value={form.name} onChange={e => change("name", e.target.value)} className={field} autoComplete="off" /></label><label className="block text-sm">Correo de acceso<input required type="email" maxLength={254} value={form.email} onChange={e => change("email", e.target.value)} className={field} autoComplete="off" /></label><label className="block text-sm">Perfil<select value={form.role} disabled={self} onChange={e => change("role", e.target.value as Role)} className={field}>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>{editing && <label className="flex items-center gap-3 self-end py-3 text-sm"><input type="checkbox" checked={form.active} disabled={self} onChange={e => change("active", e.target.checked)} />Cuenta activa</label>}<label className="block text-sm">{editing ? "Nueva contraseña · Opcional" : "Contraseña inicial"}<input required={!editing} type="password" minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={e => change("password", e.target.value)} className={field} /></label><label className="block text-sm">Confirmar contraseña<input required={!editing || !!form.password} type="password" minLength={12} maxLength={128} autoComplete="new-password" value={form.confirmation} onChange={e => change("confirmation", e.target.value)} className={field} /></label></fieldset><p className="text-sm">Usa entre 12 y 128 caracteres. {editing ? "Deja ambos campos vacíos para conservar la contraseña. Guardar cambios cierra las sesiones anteriores; desactivar impide nuevos accesos." : "La contraseña se entrega directamente a la persona; no se envía por correo."}</p>{self && <p className="text-sm">Estás editando tu cuenta. Al guardar cambios deberás ingresar nuevamente. No puedes desactivarte ni quitarte administración.</p>}<p className="text-sm text-gray-600 dark:text-gray-300">Administración gestiona eventos y accesos; recepción gestiona inscripciones y fila; kinesiología atiende y publica sus evaluaciones. Administración no incluye permiso clínico.</p><div className="flex flex-wrap gap-3"><button disabled={busy} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear cuenta"}</button>{editing && <button type="button" disabled={busy} onClick={() => edit(null)} className="rounded-lg border px-4 py-2">Cancelar edición</button>}</div></form></section>
    <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-semibold">Equipo registrado</h2><button type="button" disabled={busy || loading} onClick={() => { setError(""); setLoading(true); void load() }} className="rounded-lg border px-4 py-2">Actualizar lista</button></div><form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); if (operation.current) return; setLoading(true); setError(""); setPage(1); setTerm(search.trim()); if (term === search.trim() && page === 1) void load() }}><label className="grow text-sm">Buscar por nombre o correo<input value={search} maxLength={120} disabled={busy} onChange={e => setSearch(e.target.value)} className={field} /></label><button disabled={busy || loading} className="self-end rounded-lg border px-4 py-3">Buscar</button></form>{loading ? <p role="status">Cargando cuentas…</p> : data && <><p className="text-sm">{data.total} cuentas · Página {page}</p>{data.cuentas.length === 0 ? <p>No hay cuentas que coincidan.</p> : <ul className="space-y-3">{data.cuentas.map(account => <li key={account.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5"><div><h3 className="break-words font-semibold">{account.name}{account.id === data.miId ? " · Tu cuenta" : ""}</h3><p className="break-all text-sm">{account.email}</p><p className="mt-2 text-sm">{roleLabels[account.role]} · {account.active ? "Activa" : "Desactivada"}</p></div><button type="button" disabled={busy} onClick={() => edit(account)} className="rounded-lg border px-4 py-2">Editar y gestionar contraseña</button>{account.id !== data.miId && <button type="button" disabled={busy} onClick={() => closeSessions(account)} className="rounded-lg border px-4 py-2 disabled:opacity-50">Cerrar sus sesiones</button>}</li>)}</ul>}<div className="flex gap-3">{page > 1 && <button disabled={busy} onClick={() => { setLoading(true); setPage(value => value - 1) }} className="rounded-lg border px-4 py-2">Anterior</button>}{data.hayMas && <button disabled={busy} onClick={() => { setLoading(true); setPage(value => value + 1) }} className="rounded-lg border px-4 py-2">Siguiente</button>}</div></>}</section>
  </main>
}
