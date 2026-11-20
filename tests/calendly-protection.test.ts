import test from "node:test"
import assert from "node:assert/strict"
import { protectionFresh, PROTECTION_FRESH_MS } from "../src/lib/calendly/protection-policy.ts"
import { completeCalendlyDay } from "../src/lib/calendly/protection-source.ts"
test("protección: falla cerrada ante consulta antigua, fallida, pendiente o reloj futuro", () => {
 const now = new Date("2026-11-20T13:00:00Z"), value = { sincronizadaAt: now, bloqueoToken: null, errorSincronizacion: false }
 assert(protectionFresh(value, now))
 for (const change of [{ sincronizadaAt: null }, { bloqueoToken: "proceso" }, { errorSincronizacion: true }, { sincronizadaAt: new Date(now.getTime() - PROTECTION_FRESH_MS) }, { sincronizadaAt: new Date(now.getTime() + 1) }]) assert.equal(protectionFresh({ ...value, ...change }, now), false)
})
test("protección: no consulta fechas inválidas ni acepta una agenda vacía cuando Calendly está desactivado", async () => {
 const original = globalThis.fetch, enabled = process.env.CALENDLY_ENABLED
 let calls = 0; globalThis.fetch = async () => { calls++; throw new Error("No debe consultar") }
 process.env.CALENDLY_ENABLED = "0"
 try { await assert.rejects(completeCalendlyDay("2026-02-30")); await assert.rejects(completeCalendlyDay("2026-11-20")); assert.equal(calls, 0) }
 finally { globalThis.fetch = original; if (enabled === undefined) delete process.env.CALENDLY_ENABLED; else process.env.CALENDLY_ENABLED = enabled }
})
