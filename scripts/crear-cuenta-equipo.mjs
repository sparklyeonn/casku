import { randomBytes, randomUUID } from "node:crypto"
import { readFile, writeFile, chmod } from "node:fs/promises"
import { createInterface, emitKeypressEvents } from "node:readline"
import { parse } from "dotenv"
import { hashPassword } from "../src/lib/passwords.mjs"

const ask = (question) => new Promise(resolve => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  rl.question(question, answer => { rl.close(); resolve(answer.trim()) })
})
async function passwordPrompt() {
  if (!process.stdin.isTTY) throw new Error("Ejecuta este asistente desde una terminal interactiva.")
  process.stdout.write("Contraseña (mínimo 12 caracteres, no se mostrará): ")
  emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume()
  return new Promise((resolve, reject) => {
    let value = ""
    const finish = () => { process.stdin.removeListener("keypress", handler); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n") }
    const handler = (text, key = {}) => {
      if (key.ctrl && key.name === "c") { finish(); reject(new Error("Cancelado")); return }
      if (key.name === "return" || key.name === "enter") { finish(); resolve(value); return }
      if (key.name === "backspace") value = value.slice(0, -1)
      else if (typeof text === "string" && !/[\x00-\x1f\x7f]/.test(text) && !key.ctrl && !key.meta && value.length < 128) value += text
    }
    process.stdin.on("keypress", handler)
  })
}
async function readEnv(path) { try { return await readFile(path, "utf8") } catch (e) { if (e.code === "ENOENT") return ""; throw e } }
try {
  const email = String(await ask("Correo del equipo: ")).toLowerCase()
  const name = String(await ask("Nombre: "))
  const role = String(await ask("Perfil (KINESIOLOGO, RECEPCION o ADMIN): ")).toUpperCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !["KINESIOLOGO", "RECEPCION", "ADMIN"].includes(role)) throw new Error("Revisa el correo, nombre y perfil.")
  const passwordHash = await hashPassword(String(await passwordPrompt()))
  const base = parse(await readEnv(".env")), original = await readEnv(".env.local"), local = parse(original)
  const accounts = JSON.parse(local.CASKU_TEAM_ACCOUNTS || base.CASKU_TEAM_ACCOUNTS || "[]")
  if (!Array.isArray(accounts)) throw new Error("La configuración de cuentas no es una lista.")
  const existing = accounts.find(a => a.email?.toLowerCase() === email)
  if (existing) throw new Error("La cuenta ya existe. No se sobrescribió su contraseña ni sus permisos.")
  accounts.push({ id: randomUUID(), name, email, role, passwordHash, active: true })
  let output = original.replace(/^CASKU_TEAM_ACCOUNTS=.*(?:\r?\n|$)/gm, "")
  output += `\nCASKU_TEAM_ACCOUNTS='${JSON.stringify(accounts).replace(/'/g, "\\u0027")}'\n`
  if (!local.AUTH_SECRET && !base.AUTH_SECRET && !local.NEXTAUTH_SECRET && !base.NEXTAUTH_SECRET) output += `AUTH_SECRET=${randomBytes(32).toString("base64url")}\n`
  if (!local.AUTH_URL && !base.AUTH_URL && !local.NEXTAUTH_URL && !base.NEXTAUTH_URL) output += "AUTH_URL=http://localhost:3000\n"
  await writeFile(".env.local", output, { mode: 0o600 }); await chmod(".env.local", 0o600)
  console.log("Cuenta habilitada en .env.local. Reinicia el servidor para aplicar la configuración. No compartas ese archivo.")
} catch (error) { console.error(error.message); process.exitCode = 1 }
