import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { createHash, createHmac } from "node:crypto"
import { config } from "dotenv"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { mailConfig } from "../src/lib/mail/brevo.ts"
import { deliverOnce } from "../src/lib/mail/delivery-store.ts"
import { buildExpoReminder, EXPO_REMINDER_SCHEDULED_AT } from "../src/lib/event-reminders/content.ts"

// Operación puntual. Nunca se ejecuta desde npm run check ni desde un endpoint público.
const file = new URL("../test-results/event-reminder/plan.json", import.meta.url)
let db
try {
  const args = process.argv.slice(2)
  assert.equal(args.length, 4, "Se requieren --approve HASH y --credits-confirmed NUMERO.")
  assert.equal(args[0], "--approve"); assert.equal(args[2], "--credits-confirmed")
  const { hash, ...plan } = JSON.parse(await readFile(file, "utf8"))
  const calculated = createHash("sha256").update(JSON.stringify(plan)).digest("hex")
  assert.equal(hash, calculated, "El plan fue modificado; necesita una revisión nueva.")
  assert.equal(args[1], hash, "La aprobación debe corresponder exactamente al plan revisado.")
  assert.equal(plan.campaign, "expo-bebe-recordatorio-2026-11-18")
  assert.equal(plan.scheduledAt, EXPO_REMINDER_SCHEDULED_AT)
  assert.match(plan.batchId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i)
  assert(Array.isArray(plan.recipients) && plan.recipients.length > 0)
  assert.equal(plan.counts.correoInvalido, 0)
  assert.equal(new Set(plan.recipients.map(row => row.email)).size, plan.recipients.length)
  assert(Number.isSafeInteger(Number(args[3])) && Number(args[3]) >= plan.recipients.length, "Confirma primero el cupo disponible en Brevo.")
  assert(Date.now() < Date.parse(plan.scheduledAt) - 120_000, "La hora ya pasó o está demasiado cerca; no se convierte en envío inmediato.")
  config({ path: [".env.local", ".env"], quiet: true })
  assert.equal(process.env.CASKU_MAIL_MODE, "pruebas", "Esta operación no cambia el modo general del sistema.")
  const original = mailConfig("RECORDATORIO_EVENTO")
  // Excepción local y acotada al plan aprobado. No escribe variables de entorno.
  const approved = { ...original, testRecipients: plan.recipients.map(row => row.email) }
  const headers = { Authorization: `Bearer ${process.env.CALENDLY_API_TOKEN}`, Accept: "application/json" }
  const events = new Map()
  async function get(uri, kind) {
    const pattern = kind === "invitee" ? /^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9_-]+\/invitees\/[A-Za-z0-9_-]+$/ : /^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9_-]+$/
    assert(pattern.test(uri), "Referencia de reserva inválida.")
    const response = await fetch(uri, { headers, redirect: "error", signal: AbortSignal.timeout(15000) })
    assert(response.ok, "No se pudo revalidar una reserva; no se programa el lote.")
    return (await response.json()).resource
  }
  // Revalidar todas las reservas antes de programar el primer mensaje.
  for (const row of plan.recipients) {
    assert.equal(row.email, row.email.trim().toLowerCase())
    const expected = buildExpoReminder(row.bookings.map(booking => booking.startAt))
    assert.deepEqual(row.message, expected, "El contenido debe corresponder a los horarios revisados.")
    for (const booking of row.bookings) {
      const invitee = await get(booking.inviteeUri, "invitee")
      assert.equal(invitee.status, "active", "Una reserva cambió; vuelve a preparar el plan.")
      assert.equal(invitee.email.trim().toLowerCase(), row.email)
      assert.equal(invitee.event, booking.eventUri)
      if (!events.has(booking.eventUri)) events.set(booking.eventUri, await get(booking.eventUri, "event"))
      const event = events.get(booking.eventUri)
      assert.equal(event.status, "active"); assert.equal(Date.parse(event.start_time), Date.parse(booking.startAt))
      assert.equal(event.event_type, "https://api.calendly.com/event_types/221b713b-57e8-4990-b35d-3e51d96638cc")
    }
  }
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), transactionOptions: { maxWait: 15000, timeout: 20000 } })
  await db.$connect()
  // Guardar la respuesta nativa antes de persistir la aceptación en PostgreSQL.
  const nativeFetch = globalThis.fetch
  globalThis.fetch = async (input, options) => {
    const response = await nativeFetch(input, options)
    if (input === "https://api.brevo.com/v3/smtp/email" && options?.method === "POST" && response.ok) {
      const result = await response.clone().json()
      const payload = JSON.parse(options.body)
      if (typeof result.messageId === "string") await writeFile(new URL(`../test-results/event-reminder/respuesta-${payload.headers.idempotencyKey}.json`, import.meta.url), JSON.stringify({ messageId: result.messageId, scheduledAt: payload.scheduledAt, hash }), { mode: 0o600 })
    }
    return response
  }
  let accepted = 0, reconciled = 0
  const reconciliation = await readFile(new URL("../test-results/event-reminder/conciliacion-respuesta.json", import.meta.url), "utf8").then(JSON.parse).catch(() => null)
  for (const row of plan.recipients) {
    const key = "expo-reminder-20261118-" + createHmac("sha256", original.secret).update(row.email).digest("hex")
    const existing = await db.envioTransaccional.findUnique({ where: { clave: key } })
    // El proveedor confirmó el procesamiento mediante su protección contra duplicados.
    // Sin messageId conservamos la revisión: nunca inventamos una aceptación durable.
    if (existing && !existing.proveedorId && reconciliation?.key === key && reconciliation.http === 400 && reconciliation.body?.code === "duplicate_parameter" && Date.parse(reconciliation.at) >= existing.createdAt.getTime() && Date.parse(reconciliation.at) - existing.createdAt.getTime() < 12 * 60_000) {
      await db.envioTransaccional.update({ where: { clave: key }, data: { estado: "REVISION", motivo: "PROVEEDOR_DUPLICADO_CONFIRMADO", bloqueoToken: null, bloqueoHasta: null } })
      reconciled++
      continue
    }
    await deliverOnce(db, { to: row.email, subject: row.message.subject, text: row.message.text, html: row.message.html, scheduledAt: plan.scheduledAt, batchId: plan.batchId }, key, "RECORDATORIO_EVENTO", approved)
    accepted++
    await writeFile(new URL("../test-results/event-reminder/recepcion-brevo.json", import.meta.url), JSON.stringify({ hash, batchId: plan.batchId, scheduledAt: plan.scheduledAt, aceptados: accepted, conciliadosSinId: reconciled, total: plan.recipients.length, actualizadoAt: new Date().toISOString() }, null, 2), { mode: 0o600 })
  }
  const rows = await db.envioTransaccional.findMany({ where: { clave: { startsWith: "expo-reminder-20261118-" }, estado: "ACEPTADO" }, select: { proveedorId: true } })
  let queued = 0
  for (const row of rows) {
    assert(row.proveedorId)
    const response = await fetch(`https://api.brevo.com/v3/smtp/emailStatus/${encodeURIComponent(row.proveedorId)}`, { headers: { "api-key": original.key, Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(12000) })
    assert(response.ok, "No se pudo verificar un mensaje programado.")
    const status = await response.json()
    assert.equal(status.status, "queued")
    assert.equal(Date.parse(status.scheduledAt), Date.parse(plan.scheduledAt))
    queued++
  }
  const receipt = { hash, batchId: plan.batchId, scheduledAt: plan.scheduledAt, aceptados: accepted, colaVerificada: queued, conciliadosSinId: reconciled, total: plan.recipients.length, actualizadoAt: new Date().toISOString() }
  await writeFile(new URL("../test-results/event-reminder/recepcion-brevo.json", import.meta.url), JSON.stringify(receipt, null, 2), { mode: 0o600 })
  console.log(JSON.stringify(receipt))
} catch (error) {
  console.error(JSON.stringify({ estado: "DETENIDO_REVISAR", tipo: error.name, codigo: error.code, sqlEstado: error.meta?.code, motivo: error.kind || undefined }))
  process.exitCode = 1
} finally { await db?.$disconnect() }
