import test from "node:test"
import assert from "node:assert/strict"
import { calendlyStatus, listCalendlyEventTypes, CalendlyUnavailable } from "../src/lib/calendly/client.ts"
const user = { uri: "https://api.calendly.com/users/usuario-ficticio", name: "Cuenta ficticia", timezone: "America/Santiago", email: "privado@example.com" }
const event = { uri: "https://api.calendly.com/event_types/tipo-ficticio", name: "Expo de prueba", duration: 15, active: true, scheduling_url: "https://calendly.com/cuenta-ficticia/expo", internal_note: "No publicar", custom_questions: [{ name: "Nombre del bebé\n", type: "text", enabled: true, required: true, position: 0 }, { name: "Pregunta oculta", enabled: false }] }
async function environment(changes: Partial<Record<"CALENDLY_ENABLED" | "CALENDLY_API_TOKEN", string>>, run: () => Promise<void>) {
  const saved = { CALENDLY_ENABLED: process.env.CALENDLY_ENABLED, CALENDLY_API_TOKEN: process.env.CALENDLY_API_TOKEN }, original = globalThis.fetch
  Object.assign(process.env, { CALENDLY_ENABLED: "1", CALENDLY_API_TOKEN: "token-ficticio-no-utilizable", ...changes })
  try { await run() } finally { globalThis.fetch = original; for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } }
}
test("Calendly: desactivado o sin clave no contacta al proveedor", async () => {
  for (const change of [{ CALENDLY_API_TOKEN: "" }, { CALENDLY_ENABLED: "0" }, { CALENDLY_API_TOKEN: "token\r\nmalformado" }]) await environment(change, async () => {
    let calls = 0; globalThis.fetch = async () => { calls++; throw new Error() }
    assert.notEqual(calendlyStatus(), "LISTO_PARA_CONSULTAR")
    await assert.rejects(listCalendlyEventTypes(), CalendlyUnavailable); assert.equal(calls, 0)
  })
})
test("Calendly: consulta propia, solo GET, sin correos ni datos internos, y paginación sin seguir URLs externas", async () => environment({}, async () => {
  const calls: string[] = []
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(String(url)); calls.push(parsed.href)
    assert.equal(parsed.origin, "https://api.calendly.com"); assert.equal(options?.method, "GET"); assert.equal(options?.redirect, "error"); assert.equal(options?.cache, "no-store")
    assert.equal(new Headers(options?.headers).get("authorization"), "Bearer token-ficticio-no-utilizable")
    if (parsed.pathname === "/users/me") return Response.json({ resource: user })
    assert.equal(parsed.pathname, "/event_types"); assert.equal(parsed.searchParams.get("user"), user.uri); assert.equal(parsed.searchParams.get("page_token"), "pagina-ficticia")
    return Response.json({ collection: [event], pagination: { next_page_token: "siguiente", next_page: "https://ajeno.example/secretos" } })
  }
  const value = await listCalendlyEventTypes("pagina-ficticia")
  assert.equal(calls.length, 2); assert.equal(value.siguiente, "siguiente"); assert.equal(value.tipos[0].duracion, 15)
  assert.deepEqual(value.tipos[0].preguntas, [{ nombre: "Nombre del bebé", tipo: "text", requerida: true, posicion: 0 }])
  for (const privateValue of [user.email, event.internal_note, "token-ficticio-no-utilizable", "Pregunta oculta"]) assert(!JSON.stringify(value).includes(privateValue))
}))
test("Calendly: credenciales, límites, errores y cuerpos inválidos quedan sanitizados", async () => environment({}, async () => {
  for (const [status, kind] of [[401, "CREDENCIALES"], [403, "CREDENCIALES"], [429, "LIMITE"], [500, "PROVEEDOR"]] as const) {
    globalThis.fetch = async () => Response.json({ secret: "privado" }, { status })
    await assert.rejects(listCalendlyEventTypes(), error => error instanceof CalendlyUnavailable && error.kind === kind && !error.message.includes("privado"))
  }
  globalThis.fetch = async () => { throw new Error("token privado") }
  await assert.rejects(listCalendlyEventTypes(), error => error instanceof CalendlyUnavailable && !error.message.includes("token privado"))
  globalThis.fetch = async () => new Response("No es JSON")
  await assert.rejects(listCalendlyEventTypes(), CalendlyUnavailable)
}))
test("Calendly: rechaza URI de cuenta ajena antes de enviar la clave a otra dirección", async () => environment({}, async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({ resource: { ...user, uri: "https://ajeno.example/users/privado" } }) }
  await assert.rejects(listCalendlyEventTypes(), CalendlyUnavailable); assert.equal(calls, 1)
}))
test("Calendly: rechaza enlaces inseguros y cursores inválidos", async () => environment({}, async () => {
  let calls = 0
  globalThis.fetch = async url => { calls++; return String(url).endsWith("/users/me") ? Response.json({ resource: user }) : Response.json({ collection: [{ ...event, scheduling_url: "https://calendly.com.ajeno.example/privado" }], pagination: {} }) }
  await assert.rejects(listCalendlyEventTypes("\n"), CalendlyUnavailable); assert.equal(calls, 0)
  await assert.rejects(listCalendlyEventTypes(), CalendlyUnavailable)
}))
