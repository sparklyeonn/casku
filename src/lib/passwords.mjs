import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
const scrypt = promisify(scryptCallback)
/** @param {string} password */
export async function hashPassword(password) {
  if (password.length < 12 || password.length > 128) throw new Error("La contraseña debe tener entre 12 y 128 caracteres.")
  const salt = randomBytes(16).toString("hex")
  const key = await scrypt(password, salt, 64)
  return `scrypt:${salt}:${key.toString("hex")}`
}
/** @param {string} password @param {string} hash */
export async function verifyPassword(password, hash) {
  if (password.length > 128 || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) return false
  const [, salt, expected] = hash.split(":")
  const key = await scrypt(password, salt, 64)
  return timingSafeEqual(key, Buffer.from(expected, "hex"))
}
