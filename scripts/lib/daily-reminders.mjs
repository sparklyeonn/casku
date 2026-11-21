import assert from "node:assert/strict"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { open, mkdir, rename, readdir, lstat, unlink, chmod } from "node:fs/promises"
import { join } from "node:path"
import { DAILY_DATES, DAILY_ZONE, localDay, scheduledAt, buildDailyReminder } from "../../src/lib/event-reminders/daily.mjs"

export const EXPO_TYPE = "https://api.calendly.com/event_types/221b713b-57e8-4990-b35d-3e51d96638cc"
const purpose = "RECORDATORIO_EVENTO"
const check = (condition, code) => { if (!condition) throw new Error(code) }
export const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
export const emailKey = (day, email, secret) => `expo-daily-${day.replaceAll("-", "")}-${createHmac("sha256", secret).update(email).digest("hex")}`
export function normalizeEmail(value) {
  check(typeof value === "string", "INVALID_EMAIL")
  const email = value.trim().toLowerCase()
  check(email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) && !/[\r\n\0]/.test(value), "INVALID_EMAIL")
  return email
}
export function resource(value, kind) {
  check(typeof value === "string" && new RegExp(`^https://api\\.calendly\\.com/${kind}/[A-Za-z0-9_-]{1,128}$`).test(value), "INVALID_RESOURCE")
  return value
}
export function makeCalendlyRead(token, fetcher = fetch) {
  check(typeof token === "string" && token.trim() && !/[\r\n\0]/.test(token), "MISSING_PAT")
  return async path => {
    check(typeof path === "string" && /^\/(users\/me|event_types\?|scheduled_events(?:[/?]|$))/.test(path) && !path.includes("#"), "INVALID_GET")
    const response = await fetcher(`https://api.calendly.com${path}`, { method: "GET", headers: { Authorization: `Bearer ${token.trim()}`, Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15000) })
    check(response.ok, "CALENDLY_GET_FAILED")
    return response.json()
  }
}
export async function collectPages(read, path, params) {
  const rows = [], seen = new Set()
  const query = new URLSearchParams(params)
  for (let page = 0; page < 100; page++) {
    const result = await read(`${path}?${query}`)
    check(Array.isArray(result.collection) && result.collection.length <= 100 && result.pagination && Object.hasOwn(result.pagination, "next_page_token"), "INVALID_PAGE")
    rows.push(...result.collection)
    const next = result.pagination.next_page_token
    if (next === null || next === "") return rows
    check(typeof next === "string" && next.length <= 4096 && !seen.has(next), "INVALID_CURSOR")
    seen.add(next); query.set("page_token", next)
  }
  throw new Error("INCOMPLETE_PAGINATION")
}
export async function snapshotDay(read, day) {
  scheduledAt(day)
  const me = (await read("/users/me")).resource
  const user = resource(me?.uri, "users"), organization = resource(me?.current_organization, "organizations")
  const types = await collectPages(read, "/event_types", { user, count: "100" })
  const typesExpo = types.filter(t => t.uri === EXPO_TYPE)
  check(typesExpo.length === 1 && typesExpo[0].active === true && /^https:\/\/(?:www\.)?calendly\.com\/contacto-casku\/new-meeting\/?$/.test(typesExpo[0].scheduling_url), "EXPO_ACCOUNT_MISMATCH")
  const nextDay = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
  const events = await collectPages(read, "/scheduled_events", { user, status: "active", count: "100", min_start_time: `${day}T03:00:00.000Z`, max_start_time: `${nextDay}T03:00:00.000Z` })
  const recipients = new Map(), seenEvents = new Set(), seenInvitees = new Set()
  for (const listed of events) {
    if (listed.event_type !== EXPO_TYPE) continue
    const uri = resource(listed.uri, "scheduled_events")
    check(!seenEvents.has(uri), "DUPLICATE_EVENT"); seenEvents.add(uri)
    const event = (await read(new URL(uri).pathname)).resource
    check(event?.uri === uri && event.status === "active" && event.event_type === EXPO_TYPE && Array.isArray(event.event_memberships) && event.event_memberships.some(m => m.user === user), "EVENT_CHANGED")
    if (localDay(event.start_time) !== day) continue
    const startAt = new Date(event.start_time).toISOString()
    const guests = await collectPages(read, new URL(uri).pathname + "/invitees", { status: "active", count: "100" })
    for (const listedGuest of guests) {
      check(typeof listedGuest.uri === "string" && listedGuest.uri.startsWith(uri + "/invitees/") && /^[A-Za-z0-9_-]{1,128}$/.test(listedGuest.uri.slice((uri + "/invitees/").length)), "INVALID_INVITEE")
      check(!seenInvitees.has(listedGuest.uri), "DUPLICATE_INVITEE"); seenInvitees.add(listedGuest.uri)
      const guest = (await read(new URL(listedGuest.uri).pathname)).resource
      check(guest?.uri === listedGuest.uri && guest.status === "active" && !guest.rescheduled && guest.event === uri, "BOOKING_CHANGED")
      const email = normalizeEmail(guest.email)
      if (!recipients.has(email)) recipients.set(email, [])
      recipients.get(email).push({ eventUri: uri, inviteeUri: guest.uri, startAt })
    }
  }
  const rows = [...recipients].sort(([a], [b]) => a.localeCompare(b)).map(([email, bookings]) => {
    bookings.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.inviteeUri.localeCompare(b.inviteeUri))
    return { email, bookings, message: buildDailyReminder(day, bookings.map(b => b.startAt)) }
  })
  return { account: { user, organization, eventType: EXPO_TYPE }, recipients: rows }
}
export function createPlan(day, batchId, snapshot) {
  const plan = { version: 1, campaign: "expo-daily-2026", day, zone: DAILY_ZONE, scheduledAt: scheduledAt(day), batchId, ...snapshot }
  validatePlan({ ...plan, hash: digest(plan) })
  return { ...plan, hash: digest(plan) }
}
export function validatePlan(input, approval = input.hash) {
  const { hash, ...plan } = input
  check(/^[a-f0-9]{64}$/.test(hash) && hash === digest(plan) && hash === approval, "APPROVAL_MISMATCH")
  check(plan.version === 1 && plan.campaign === "expo-daily-2026" && plan.zone === DAILY_ZONE && plan.scheduledAt === scheduledAt(plan.day), "INVALID_PLAN")
  check(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(plan.batchId), "INVALID_BATCH")
  check(plan.account?.eventType === EXPO_TYPE, "INVALID_TYPE")
  resource(plan.account.user, "users"); resource(plan.account.organization, "organizations")
  check(Array.isArray(plan.recipients), "INVALID_RECIPIENTS")
  const emails = new Set(), invitees = new Set()
  for (const row of plan.recipients) {
    check(row.email === normalizeEmail(row.email) && !emails.has(row.email), "DUPLICATE_EMAIL"); emails.add(row.email)
    check(Array.isArray(row.bookings) && row.bookings.length > 0, "INVALID_BOOKINGS")
    for (const b of row.bookings) {
      resource(b.eventUri, "scheduled_events")
      check(typeof b.inviteeUri === "string" && b.inviteeUri.startsWith(b.eventUri + "/invitees/") && /^[A-Za-z0-9_-]{1,128}$/.test(b.inviteeUri.slice((b.eventUri + "/invitees/").length)) && !invitees.has(b.inviteeUri), "INVALID_BOOKING")
      invitees.add(b.inviteeUri)
    }
    assert.deepEqual(row.message, buildDailyReminder(plan.day, row.bookings.map(b => b.startAt)))
  }
  return input
}
export function assertWindow(plan, now = Date.now()) {
  const delta = Date.parse(plan.scheduledAt) - now
  check(delta > 120000 && delta <= 72 * 3600000, "OUTSIDE_SCHEDULE_WINDOW")
}

// Private, atomic writes with fsync of both file and directory; no PII in filenames.
export async function privateDir(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const stat = await lstat(dir); check(stat.isDirectory() && !stat.isSymbolicLink(), "UNSAFE_DIRECTORY")
  await chmod(dir, 0o700)
}
export async function readPrivate(file) {
  const stat = await lstat(file)
  check(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, "UNSAFE_PRIVATE_FILE")
  const handle = await open(file, "r")
  try { return JSON.parse(await handle.readFile("utf8")) } finally { await handle.close() }
}
export async function durableWrite(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`
  const handle = await open(temp, "wx", 0o600)
  try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync() } finally { await handle.close() }
  await rename(temp, file)
  const directory = await open(new URL(".", `file://${file}`).pathname, "r")
  try { await directory.sync() } finally { await directory.close() }
}
export async function withLock(dir, work) {
  await privateDir(dir)
  const file = join(dir, "operation.lock"), handle = await open(file, "wx", 0o600)
  try { await handle.sync(); return await work() } finally { await handle.close(); await unlink(file) }
}
export async function batchForDay(dir, day) {
  scheduledAt(day)
  const file = join(dir, `batch-${day}.json`)
  try {
    const value = await readPrivate(file)
    check(value.day === day, "BATCH_MISMATCH")
    check(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.batchId), "INVALID_BATCH")
    return value.batchId
  } catch (error) { if (error.code !== "ENOENT") throw error }
  const batchId = randomUUID()
  await durableWrite(file, { day, batchId }); return batchId
}
export async function prepare({ dir, read }) {
  return withLock(dir, async () => {
    const outputs = []
    for (const day of DAILY_DATES) {
      const batchId = await batchForDay(dir, day)
      const plan = createPlan(day, batchId, await snapshotDay(read, day))
      const file = join(dir, `plan-${day}-${plan.hash}.json`)
      await durableWrite(file, plan)
      outputs.push({ day, hash: plan.hash, status: "PREPARADO", recipients: plan.recipients.length, bookings: plan.recipients.reduce((n, r) => n + r.bookings.length, 0) })
    }
    return outputs
  })
}
export async function loadApproved(dir, hash) {
  check(/^[a-f0-9]{64}$/.test(hash), "INVALID_APPROVAL")
  const files = (await readdir(dir)).filter(f => /^plan-2026-11-(21|22)-[a-f0-9]{64}\.json$/.test(f) && f.endsWith(`-${hash}.json`))
  check(files.length === 1, "PLAN_NOT_FOUND")
  return validatePlan(await readPrivate(join(dir, files[0])), hash)
}

export async function queued(providerId, plan, config, fetcher) {
  check(typeof providerId === "string" && providerId.length > 0 && providerId.length <= 1000 && !/[\s\0]/.test(providerId), "INVALID_PROVIDER_ID")
  const response = await fetcher(`${config.baseUrl}/v3/smtp/emailStatus/${encodeURIComponent(providerId)}`, { method: "GET", headers: { "api-key": config.key, Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(12000) })
  check(response.ok, "STATUS_GET_FAILED")
  const body = await response.json()
  check(body.status === "queued" && Date.parse(body.scheduledAt) === Date.parse(plan.scheduledAt), "PROVIDER_NOT_QUEUED")
}

// All runtime dependencies are injected: importing this module performs no IO/network.
export async function schedule({ dir, plan, db, config, read, deliver, payloadFor, recipientFor, fetcher, now = Date.now, targetFingerprint }) {
  return withLock(dir, async () => {
    validatePlan(plan); assertWindow(plan, now())
    check(plan.batchId === await batchForDay(dir, plan.day), "BATCH_CHANGED")
    check(typeof targetFingerprint === "string" && /^[a-f0-9]{64}$/.test(targetFingerprint), "INVALID_DATABASE_TARGET")
    // Refresh the full day, including each individual event and invitee, before any POST.
    assert.deepEqual(await snapshotDay(read, plan.day), { account: plan.account, recipients: plan.recipients })
    const approved = { ...config, testRecipients: plan.recipients.map(r => r.email) }
    const entries = []
    for (const row of plan.recipients) {
      const key = emailKey(plan.day, row.email, config.secret)
      const message = { to: row.email, ...row.message, scheduledAt: plan.scheduledAt, batchId: plan.batchId }
      const payload = payloadFor(message, approved, key)
      const hashMensaje = createHmac("sha256", config.secret).update(JSON.stringify({ purpose, payload })).digest("hex")
      const recipient = recipientFor(row.email, config.suppressionSecret)
      check(!await db.supresionCorreo.findUnique({ where: { clave: recipient } }), "RECIPIENT_SUPPRESSED")
      const existing = await db.envioTransaccional.findUnique({ where: { clave: key } })
      if (existing) {
        check(existing.hashMensaje === hashMensaje && existing.finalidad === purpose && (!existing.destinatarioClave || existing.destinatarioClave === recipient), "PAYLOAD_CHANGED")
      }
      const file = join(dir, `attempt-${key}.json`)
      let receipt
      try { receipt = await readPrivate(file) } catch (error) { if (error.code !== "ENOENT") throw error }
      if (receipt) {
        check(receipt.hashMensaje === hashMensaje && receipt.targetFingerprint === targetFingerprint && receipt.planHash === plan.hash && receipt.key === key, "ATTEMPT_CHANGED")
        check(receipt.status === "ACCEPTED" && receipt.providerId, "ACCEPTANCE_UNCERTAIN")
        check(existing && ["ACEPTADO", "ENVIANDO", "REVISION"].includes(existing.estado) && (!existing.proveedorId || existing.proveedorId === receipt.providerId), "RECONCILIATION_UNSAFE")
      } else if (existing) {
        check(existing.estado === "ACEPTADO" && existing.proveedorId || existing.estado === "PENDIENTE" && existing.intentos === 0 && !existing.proveedorId, "DELIVERY_UNCERTAIN")
      }
      const providerId = receipt?.providerId || existing?.proveedorId
      if (providerId) await queued(providerId, plan, config, fetcher)
      entries.push({ key, message, payload, hashMensaje, recipient, file, receipt, providerId, existing })
    }
    // Preflight has completed for the ENTIRE batch. Nothing above sends mail.
    let accepted = 0, reused = 0, recovered = 0
    for (const entry of entries) {
      assertWindow(plan, now())
      if (entry.providerId) {
        if (entry.existing.estado !== "ACEPTADO") {
          const result = await db.envioTransaccional.updateMany({ where: { clave: entry.key, hashMensaje: entry.hashMensaje, finalidad: purpose, destinatarioClave: entry.recipient, estado: { in: ["ENVIANDO", "REVISION"] }, proveedorId: null }, data: { estado: "ACEPTADO", proveedorId: entry.providerId, aceptadoAt: new Date(), motivo: null, bloqueoToken: null, bloqueoHasta: null } })
          check(result.count === 1, "RECOVERY_DB_FAILED"); recovered++
        }
        reused++; continue
      }
      const intent = { key: entry.key, planHash: plan.hash, hashMensaje: entry.hashMensaje, targetFingerprint, status: "ATTEMPTING" }
      // Intent is durable before transport; any ambiguous outcome permanently blocks POST retries.
      await durableWrite(entry.file, intent)
      const originalFetch = globalThis.fetch
      let posted = false, saved = false
      globalThis.fetch = async (input, options) => {
        check(!posted && input === `${config.baseUrl}/v3/smtp/email` && options?.method === "POST" && options.body === JSON.stringify(entry.payload), "UNEXPECTED_TRANSPORT")
        assertWindow(plan, now()); posted = true
        const response = await fetcher(input, options)
        if (response.ok) {
          const body = await response.clone().json()
          check(typeof body.messageId === "string" && body.messageId.length > 0 && body.messageId.length <= 1000 && !/[\s\0]/.test(body.messageId), "ACCEPTANCE_UNCERTAIN")
          // Save native acceptance BEFORE deliverOnce sees it and starts its acceptance transaction.
          await durableWrite(entry.file, { ...intent, status: "ACCEPTED", providerId: body.messageId, scheduledAt: plan.scheduledAt, batchId: plan.batchId })
          saved = true
        }
        return response
      }
      let id
      try { id = await deliver(db, entry.message, entry.key, purpose, approved) } finally { globalThis.fetch = originalFetch }
      check(posted && saved, "MISSING_NATIVE_ACCEPTANCE")
      const receipt = await readPrivate(entry.file)
      check(id === receipt.providerId, "PROVIDER_ID_MISMATCH")
      await queued(id, plan, config, fetcher); accepted++
    }
    return { day: plan.day, hash: plan.hash, status: "COLA_VERIFICADA", recipients: entries.length, accepted, reused, recovered, queued: accepted + reused }
  })
}
