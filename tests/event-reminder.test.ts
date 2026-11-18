import test from "node:test"
import assert from "node:assert/strict"
import { buildExpoReminder, EXPO_REMINDER_SCHEDULED_AT } from "../src/lib/event-reminders/content.ts"
test("recordatorio Expo: programa las 19 de Santiago y presenta la cita en su horario local", () => {
  const result = buildExpoReminder(["2026-11-20T14:00:00.000Z"])
  assert.equal(EXPO_REMINDER_SCHEDULED_AT, "2026-11-18T22:00:00.000Z")
  assert.equal(new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(result.scheduledAt)), "19:00")
  assert.equal(result.appointments[0].hora, "11:00")
  assert(result.appointments[0].dia.includes("viernes"));assert(result.appointments[0].dia.includes("20"))
  for (const value of ["Metropolitan Santiago", "craneometría", "11:00"]) { assert(result.text.includes(value));assert(result.html.includes(value)) }
  assert(!result.html.includes("<script"));assert(!result.html.includes("src="))
})
test("recordatorio Expo: conserva múltiples citas, ordena y elimina horarios repetidos", () => {
  const result = buildExpoReminder(["2026-11-22T15:00:00Z", "2026-11-20T14:00:00Z", "2026-11-20T11:00:00-03:00"])
  assert.equal(result.appointments.length, 2);assert(result.appointments[0].dia.includes("viernes"));assert(result.appointments[1].dia.includes("domingo"))
})
test("recordatorio Expo: rechaza fechas incompletas, sin zona y ajenas a las jornadas de Santiago", () => {
  for (const values of [[], ["2026-11-20T11:00:00"], ["invalida"], ["2026-11-19T14:00:00Z"], ["2026-11-23T03:00:00Z"], ["2026-11-20T02:59:59Z"]]) assert.throws(() => buildExpoReminder(values))
})
