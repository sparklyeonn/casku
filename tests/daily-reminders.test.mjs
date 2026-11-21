import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { DAILY_DATES, scheduledAt, buildDailyReminder } from "../src/lib/event-reminders/daily.mjs"
import { EXPO_TYPE, digest, emailKey, makeCalendlyRead, collectPages, snapshotDay, createPlan, validatePlan, assertWindow, privateDir, readPrivate, batchForDay, prepare, schedule } from "../scripts/lib/daily-reminders.mjs"
import { explicitDatabase, providerEnvironment, parseArgs } from "../scripts/programar-recordatorios-jornadas.mjs"
import { brevoPayload } from "../src/lib/mail/brevo.ts"
import { recipientKey } from "../src/lib/mail/webhook-policy.ts"

const day = DAILY_DATES[0], user = "https://api.calendly.com/users/test", organization = "https://api.calendly.com/organizations/test"
const config = { key: "synthetic", secret: "x".repeat(40), suppressionSecret: "y".repeat(40), sender: { email: "sender@example.test", name: "Test" }, baseUrl: "https://api.brevo.com", testRecipients: ["operator@example.test"] }
function fixture() {
  const data = new Map()
  for (const [i, date] of DAILY_DATES.entries()) {
    const event = `https://api.calendly.com/scheduled_events/e${i}`
    const guests = ["a@example.test", ...(i === 0 ? ["b@example.test"] : [])].map((email, n) => ({ uri: `${event}/invitees/i${n}`, status: "active", event, email }))
    data.set(date, { event: { uri: event, status: "active", event_type: EXPO_TYPE, event_memberships: [{ user }], start_time: `${date}T14:00:00Z` }, guests })
  }
  const read = async path => {
    if (path === "/users/me") return { resource: { uri: user, current_organization: organization } }
    const url = new URL(path, "https://api.calendly.com")
    if (url.pathname === "/event_types") return { collection: [{ uri: EXPO_TYPE, active: true, scheduling_url: "https://calendly.com/contacto-casku/new-meeting" }], pagination: { next_page_token: null } }
    if (url.pathname === "/scheduled_events") return { collection: [data.get(url.searchParams.get("min_start_time").slice(0, 10)).event], pagination: { next_page_token: null } }
    for (const { event, guests } of data.values()) {
      if (path === new URL(event.uri).pathname) return { resource: structuredClone(event) }
      if (url.pathname === new URL(event.uri).pathname + "/invitees") return { collection: structuredClone(guests), pagination: { next_page_token: null } }
      const guest = guests.find(g => path === new URL(g.uri).pathname)
      if (guest) return { resource: structuredClone(guest) }
    }
    throw new Error("UNEXPECTED_MOCK_GET")
  }
  return { data, read }
}
async function context(t) {
  const dir = await mkdtemp(join(tmpdir(), "daily-reminders-unit-"))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await privateDir(dir)
  const { data, read } = fixture()
  const plan = createPlan(day, await batchForDay(dir, day), await snapshotDay(read, day))
  const rows = new Map(), suppressed = new Set(), posts = []
  const db = {
    supresionCorreo: { findUnique: async ({ where }) => suppressed.has(where.clave) ? {} : null },
    envioTransaccional: {
      findUnique: async ({ where }) => rows.get(where.clave) || null,
      updateMany: async ({ where, data }) => { const row = rows.get(where.clave); if (!row || row.hashMensaje !== where.hashMensaje) return { count: 0 }; Object.assign(row, data); return { count: 1 } }
    }
  }
  let failDB = false, uncertain = false, queuedStatus = "queued"
  const fetcher = async (url, options) => {
    if (options.method === "GET") return new Response(JSON.stringify({ status: queuedStatus, scheduledAt: plan.scheduledAt }))
    assert.equal(url, "https://api.brevo.com/v3/smtp/email"); posts.push(JSON.parse(options.body))
    if (uncertain) throw new Error("MOCK_TIMEOUT")
    return new Response(JSON.stringify({ messageId: `<synthetic-${posts.length}@example.test>` }))
  }
  // Transport double exercises the same native response boundary as deliverOnce.
  const deliver = async (_db, message, key, purpose, approved) => {
    const payload = brevoPayload(message, approved, key)
    const { createHmac } = await import("node:crypto")
    const row = { clave: key, finalidad: purpose, hashMensaje: createHmac("sha256", config.secret).update(JSON.stringify({ purpose, payload })).digest("hex"), destinatarioClave: recipientKey(message.to, config.suppressionSecret), estado: "ENVIANDO", intentos: 1, proveedorId: null }
    rows.set(key, row)
    const response = await globalThis.fetch(`${approved.baseUrl}/v3/smtp/email`, { method: "POST", body: JSON.stringify(payload) })
    const { messageId } = await response.json()
    // Verify receipt exists DURABLY before the simulated acceptance DB write.
    const receipt = await readPrivate(join(dir, `attempt-${key}.json`))
    assert.equal(receipt.status, "ACCEPTED"); assert.equal(receipt.providerId, messageId)
    if (failDB) throw new Error("MOCK_ACCEPTANCE_DB_FAILURE")
    row.estado = "ACEPTADO"; row.proveedorId = messageId
    return messageId
  }
  const run = overrides => schedule({ dir, plan, db, config, read, deliver, payloadFor: brevoPayload, recipientFor: recipientKey, fetcher, now: () => Date.parse("2026-11-20T23:00:00Z"), targetFingerprint: "a".repeat(64), ...overrides })
  return { dir, plan, data, read, rows, suppressed, posts, run, failDB: () => { failDB = true }, uncertain: () => { uncertain = true }, unqueue: () => { queuedStatus = "sent" } }
}

test("daily: exact 09 Santiago = 12 UTC on both dates, own day only", () => {
  for (const date of DAILY_DATES) {
    assert.equal(scheduledAt(date), `${date}T12:00:00.000Z`)
    const result = buildDailyReminder(date, [`${date}T15:00:00Z`, `${date}T14:00:00Z`, `${date}T14:00:00Z`])
    assert.match(result.text, /11:00 y 12:00/); assert.match(result.text, /Metropolitan Santiago/); assert.match(result.subject, /Hoy tienes/)
    assert.throws(() => buildDailyReminder(date, ["2026-11-20T14:00:00Z"]))
    assert.throws(() => buildDailyReminder(date, [`${date}T14:00:00`]))
  }
})
test("daily: private plans per day, persistent UUIDs, deterministic hashes, no POST", async t => {
  const c = await context(t)
  const first = await prepare({ dir: c.dir, read: c.read }), second = await prepare({ dir: c.dir, read: c.read })
  assert.deepEqual(first, second); assert.equal(first[0].recipients, 2); assert.equal(first[1].recipients, 1)
  assert.notEqual(first[0].hash, first[1].hash)
  const file = join(c.dir, `plan-${day}-${first[0].hash}.json`)
  assert.equal((await stat(file)).mode & 0o777, 0o600)
  assert.equal((await readPrivate(file)).batchId, c.plan.batchId)
  assert.equal((await stat(c.dir)).mode & 0o777, 0o700)
})
test("daily: plan integrity and date HMAC key independent of plan", async t => {
  const c = await context(t)
  validatePlan(c.plan)
  assert.throws(() => validatePlan({ ...c.plan, batchId: randomUUID() }))
  assert.throws(() => validatePlan(c.plan, "f".repeat(64)))
  const key = emailKey(day, "a@example.test", config.secret)
  assert.equal(key, emailKey(day, "a@example.test", config.secret))
  assert.notEqual(key, emailKey(DAILY_DATES[1], "a@example.test", config.secret))
  assert(!key.includes("@"))
})
test("daily: late, near-deadline and >72h never become immediate", async t => {
  const c = await context(t)
  for (const now of [Date.parse(c.plan.scheduledAt), Date.parse(c.plan.scheduledAt) - 120000, Date.parse(c.plan.scheduledAt) - 73 * 3600000]) assert.throws(() => assertWindow(c.plan, now))
  await assert.rejects(c.run({ now: () => Date.parse(c.plan.scheduledAt) })); assert.equal(c.posts.length, 0)
})
test("daily: all bookings revalidated before first POST, changed last guest blocks whole batch", async t => {
  const c = await context(t)
  c.data.get(day).guests.at(-1).email = "changed@example.test"
  await assert.rejects(c.run()); assert.equal(c.posts.length, 0)
})
test("daily: cancellation, type, account and hours changes block whole batch", async t => {
  for (const change of [x => { x.guests[0].status = "canceled" }, x => { x.event.event_type += "changed" }, x => { x.event.event_memberships = [] }, x => { x.event.start_time = `${day}T15:00:00Z` }]) {
    const c = await context(t); change(c.data.get(day)); await assert.rejects(c.run()); assert.equal(c.posts.length, 0)
  }
})
test("daily: suppression on last recipient blocks ALL posts", async t => {
  const c = await context(t)
  c.suppressed.add(recipientKey("b@example.test", config.suppressionSecret))
  await assert.rejects(c.run(), /RECIPIENT_SUPPRESSED/); assert.equal(c.posts.length, 0)
})
test("daily: native receipt before DB, same hash retry only GET queued, scoped allowlist", async t => {
  const c = await context(t)
  const original = globalThis.fetch
  const first = await c.run(); assert.equal(first.accepted, 2)
  assert.equal(globalThis.fetch, original)
  assert.deepEqual(config.testRecipients, ["operator@example.test"])
  assert(c.posts.every(p => p.scheduledAt === `${day}T12:00:00.000Z` && p.batchId === c.plan.batchId))
  const second = await c.run(); assert.equal(second.reused, 2); assert.equal(second.accepted, 0); assert.equal(c.posts.length, 2)
  c.unqueue(); await assert.rejects(c.run(), /PROVIDER_NOT_QUEUED/); assert.equal(c.posts.length, 2)
})
test("daily: DB acceptance failure recovered from native receipt without repeating POST", async t => {
  const c = await context(t); c.failDB()
  await assert.rejects(c.run(), /MOCK_ACCEPTANCE_DB_FAILURE/); assert.equal(c.posts.length, 1)
  // Only the accepted first recipient participates here; second must not be posted during recovery test.
  c.suppressed.add(recipientKey("b@example.test", config.suppressionSecret))
  await assert.rejects(c.run(), /RECIPIENT_SUPPRESSED/); assert.equal(c.posts.length, 1)
  c.suppressed.clear()
  // Second new recipient will hit the same simulated DB failure; first is recovered first.
  await assert.rejects(c.run(), /MOCK_ACCEPTANCE_DB_FAILURE/)
  assert.equal(c.posts.length, 2)
  const result = await c.run(); assert.equal(result.recovered, 1); assert.equal(result.reused, 2); assert.equal(c.posts.length, 2)
})
test("daily: uncertain acceptance blocks forever without another POST", async t => {
  const c = await context(t); c.uncertain()
  await assert.rejects(c.run()); assert.equal(c.posts.length, 1)
  await assert.rejects(c.run(), /ACCEPTANCE_UNCERTAIN/); assert.equal(c.posts.length, 1)
})
test("daily: changed payload and doubtful existing DB row block before POST", async t => {
  const c = await context(t)
  const key = emailKey(day, "b@example.test", config.secret)
  c.rows.set(key, { hashMensaje: "wrong", finalidad: "RECORDATORIO_EVENTO", estado: "REVISION" })
  await assert.rejects(c.run(), /PAYLOAD_CHANGED/); assert.equal(c.posts.length, 0)
})
test("daily: full pagination and repeated cursor fails closed", async () => {
  let calls = 0
  assert.deepEqual(await collectPages(async () => ({ collection: [++calls], pagination: { next_page_token: calls === 1 ? "second" : null } }), "/event_types", {}), [1, 2])
  await assert.rejects(collectPages(async () => ({ collection: [], pagination: { next_page_token: "loop" } }), "/event_types", {}), /INVALID_CURSOR/)
})
test("daily: Calendly transport GET only, origin fixed, no provider preflight", async () => {
  const calls = []
  const read = makeCalendlyRead("synthetic", async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ resource: {} })) })
  await read("/users/me"); assert.equal(calls[0].options.method, "GET"); assert.equal(calls[0].url, "https://api.calendly.com/users/me")
  await assert.rejects(read("https://evil.test/")); assert.equal(calls.length, 1)
})
test("daily: explicit DB only, envlocal never sets destination or global application activation", () => {
  const env = { DATABASE_URL: "ambient-not-used", CASKU_MAIL_MODE: "produccion" }
  providerEnvironment("CASKU_MAIL_MODE=pruebas\nDATABASE_URL=wrong\nBREVO_API_KEY=synthetic\n", env)
  assert.equal(env.DATABASE_URL, "ambient-not-used"); assert.equal(env.CASKU_MAIL_MODE, "pruebas")
  assert.equal(explicitDatabase("DATABASE_URL=postgresql://fake:fake@invalid.test/ensayo"), "postgresql://fake:fake@invalid.test/ensayo")
  assert.throws(() => explicitDatabase("OTHER=1")); assert.throws(() => explicitDatabase("DATABASE_URL=${DATABASE_URL}"))
  assert.deepEqual(parseArgs(["--prepare"]), { mode: "prepare" })
  assert.equal(parseArgs(["--schedule", "--approve", "a".repeat(64), "--database-env", ".env.vercel-ensayo"]).mode, "schedule")
  assert.throws(() => parseArgs(["--schedule"]))
  assert.equal(digest({ a: 1 }).length, 64)
})
