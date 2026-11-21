import { readFile } from "node:fs/promises"
import { resolve, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"
import { createHmac } from "node:crypto"
import { parse } from "dotenv"
import { prepare, loadApproved, schedule, makeCalendlyRead } from "./lib/daily-reminders.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export function parseArgs(args) {
  if (args.length === 1 && args[0] === "--prepare") return { mode: "prepare" }
  if (args.length === 5 && args[0] === "--schedule" && args[1] === "--approve" && /^[a-f0-9]{64}$/.test(args[2]) && args[3] === "--database-env" && args[4]) return { mode: "schedule", hash: args[2], databaseFile: args[4] }
  throw new Error("INVALID_ARGUMENTS")
}
export function explicitDatabase(content) {
  const value = parse(content).DATABASE_URL
  if (!value || /[\r\n\0]/.test(value) || /\$\{?/.test(value)) throw new Error("INVALID_EXPLICIT_DATABASE")
  const url = new URL(value)
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length <= 1) throw new Error("INVALID_EXPLICIT_DATABASE")
  return value
}
export function providerEnvironment(content, env = process.env) {
  const values = parse(content)
  // No dotenv config/default fallback. Neither DATABASE_URL nor app settings are loaded.
  const keys = ["CALENDLY_API_TOKEN", "BREVO_API_KEY", "BREVO_SENDER_EMAIL", "BREVO_SENDER_NAME", "BREVO_SENDER_VERIFIED", "CASKU_MAIL_ENABLED", "CASKU_MAIL_MODE", "CASKU_MAIL_TEST_RECIPIENTS", "CASKU_MAIL_DELIVERY_SECRET", "CASKU_MAIL_SUPPRESSION_SECRET"]
  for (const key of keys) {
    if (Object.hasOwn(values, key)) env[key] = values[key]
    else delete env[key]
  }
  if (env.CASKU_MAIL_MODE !== "pruebas") throw new Error("APPLICATION_MUST_REMAIN_TEST_MODE")
  return env
}
export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args)
  const dir = resolve(root, "test-results/event-reminders-daily")
  // --prepare reads no database settings and never imports/instantiates Prisma.
  providerEnvironment(await readFile(resolve(root, ".env.local"), "utf8"))
  const read = makeCalendlyRead(process.env.CALENDLY_API_TOKEN)
  if (options.mode === "prepare") return prepare({ dir, read })
  const databaseFile = resolve(root, options.databaseFile)
  if (basename(databaseFile) !== ".env.vercel-ensayo") throw new Error("EXPECTED_ENV_VERCEL_ENSAYO")
  const connectionString = explicitDatabase(await readFile(databaseFile, "utf8"))
  const plan = await loadApproved(dir, options.hash)
  const [{ PrismaClient }, { PrismaPg }, { mailConfig, brevoPayload }, { deliverOnce }, { recipientKey }] = await Promise.all([
    import("@prisma/client"), import("@prisma/adapter-pg"), import("../src/lib/mail/brevo.ts"), import("../src/lib/mail/delivery-store.ts"), import("../src/lib/mail/webhook-policy.ts")
  ])
  const config = mailConfig("RECORDATORIO_EVENTO")
  if (config.baseUrl !== "https://api.brevo.com" || process.env.CASKU_TEST_MODE === "1" || process.env.CASKU_PRODUCTION_TEST === "1") throw new Error("INVALID_PROVIDER_RUNTIME")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }), transactionOptions: { maxWait: 15000, timeout: 20000 } })
  try {
    await db.$connect()
    return await schedule({ dir, plan, db, config, read, deliver: deliverOnce, payloadFor: brevoPayload, recipientFor: recipientKey, fetcher: globalThis.fetch, targetFingerprint: createHmac("sha256", config.secret).update(connectionString).digest("hex") })
  } finally { await db.$disconnect() }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => console.log(JSON.stringify(result))).catch(() => {
    // Never print remote errors, payloads, email addresses, secrets or connection strings.
    console.error(JSON.stringify({ status: "DETENIDO_REVISAR", accepted: "NO_INFERIR_REVISAR_RECIBOS_PRIVADOS" }))
    process.exitCode = 1
  })
}
