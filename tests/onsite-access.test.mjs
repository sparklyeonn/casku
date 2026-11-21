import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { createHash, randomBytes } from "node:crypto"
import ts from "typescript"

// Carga solo el módulo bajo prueba: toda dependencia externa debe declararse como doble.
// No importa Prisma, configuración, autenticación real ni transportes de correo.
function load(path, dependencies = {}, runtimeProcess = process) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  const result = ts.transpileModule(source, { fileName: path, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } })
  assert.equal(result.diagnostics.length, 0)
  const loaded = { exports: {} }
  const require = name => {
    assert(Object.hasOwn(dependencies, name), `Dependencia no simulada: ${name}`)
    return dependencies[name]
  }
  new Function("require", "module", "exports", "process", result.outputText)(require, loaded, loaded.exports, runtimeProcess)
  return loaded.exports
}
const response = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } })
class Conflict extends Error {}
class InputError extends Error {}
class PrismaError extends Error {}
const eventId = "11111111-1111-4111-8111-111111111111"
const input = { id: "22222222-2222-4222-8222-222222222222", eventoId: eventId, bebe: { nombre: "Bebé ficticio", nombreNormalizado: "bebe ficticio", fechaNacimiento: new Date("2026-01-01") }, nombreApoderado: "Persona ficticia", correo: null, telefono: "", privacidad: { datos: true, correoResultados: false, seguimiento: false }, declaracion: { documentada: true } }
function accessFor(user) {
  return load("src/lib/reception/onsite-access.ts", { "@/lib/access": { getTeamUser: async () => user }, "./http": { receptionResponse: response } })
}

// Ejecuta la política de origen real con configuración ficticia y dependencias inertes.
function originPolicy(env = { AUTH_URL: "https://example.test" }) {
  const path = "src/lib/team-passwords/store.ts"
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  const imports = ts.createSourceFile(path, source, ts.ScriptTarget.Latest).statements.filter(ts.isImportDeclaration).map(statement => statement.moduleSpecifier.text)
  return load(path, Object.fromEntries(imports.map(name => [name, {}])), { env })
}

test("presencial GET/POST: solo ADMIN y RECEPCION; sin sesión 401, otros perfiles 403", async () => {
  for (const role of [null, "ADMIN", "RECEPCION", "KINESIOLOGO", "APODERADO", "OTRO"]) {
    const user = role && { id: "actor", role, version: 7 }
    const access = accessFor(user)
    let registrations = 0, availabilityReads = 0, confirmations = 0
    const route = load("src/app/api/recepcion/presencial/route.ts", {
      "@/lib/team-passwords/store": originPolicy(),
      "@/lib/events/input": { parseEventId: value => { assert.equal(value, eventId); return value } },
      "@/lib/reception/onsite-access": access,
      "@/lib/prisma": { prisma: { correoInscripcion: { findUnique: async () => null } } },
      "@/lib/reception/onsite-input": { parseOnsiteInput: value => value },
      "@/lib/reception/onsite": {
        registerOnsite: async (actor, payload) => { registrations++; assert.deepEqual(actor, user); assert.equal(payload.eventoId, eventId); return { inscripcion: { id: input.id }, nuevaInscripcion: true } },
        onsiteAvailability: async () => { availabilityReads++; return { disponibles: 2, presencialHabilitada: true } },
      },
      "@/lib/reception/http": { receptionResponse: response, receptionJson: request => request.json(), receptionFailure: () => assert.fail("Error inesperado") },
      "@/lib/families/confirmation": { deliverConfirmation: async () => { confirmations++ } },
    })
    const allowed = ["ADMIN", "RECEPCION"].includes(role)
    const post = await route.POST(new Request("https://example.test/api/recepcion/presencial", { method: "POST", headers: { origin: "https://example.test" }, body: JSON.stringify(input) }))
    const get = await route.GET(new Request(`https://example.test/api/recepcion/presencial?eventoId=${eventId}`))
    assert.equal(post.status, allowed ? 201 : role ? 403 : 401)
    assert.equal(get.status, allowed ? 200 : role ? 403 : 401)
    assert.equal(post.headers.get("cache-control"), "private, no-store")
    assert.equal(registrations, Number(allowed)); assert.equal(availabilityReads, Number(allowed)); assert.equal(confirmations, Number(allowed))
    if (allowed) assert.deepEqual(await get.json(), { disponibles: 2, presencialHabilitada: true })
  }
})

test("recepción global y permisos clínicos conservan sus restricciones", async () => {
  for (const role of ["ADMIN", "RECEPCION", "KINESIOLOGO"]) {
    const http = load("src/lib/reception/http.ts", {
      "@/lib/access": { getTeamUser: async () => ({ role }) },
      "@/lib/privacy/policy": { PrivacyInputError: InputError }, "@/lib/privacy/store": { PrivacyConflict: Conflict },
      "@prisma/client": { Prisma: { PrismaClientKnownRequestError: PrismaError } },
      "@/lib/events/input": { EventInputError: InputError }, "./input": { ReceptionInputError: InputError }, "@/lib/families/input": { FamilyInputError: InputError },
    })
    const result = await http.receptionAccess()
    assert.equal(result.response?.status ?? 200, role === "RECEPCION" ? 200 : 403)
  }
  const { canEvaluate } = load("src/lib/roles.ts")
  assert.equal(canEvaluate("ADMIN"), false); assert.equal(canEvaluate("RECEPCION"), false); assert.equal(canEvaluate("KINESIOLOGO"), true)
})

function fixture(role = "ADMIN") {
  const actor = { id: "actor", role, version: 7 }
  const state = { staff: { ...actor, active: true, mustChangePassword: false }, replay: null, matches: [], waiting: null, disponibles: 2, event: { id: eventId, fecha: new Date("2026-11-20") }, created: [], consent: [], arrivals: [], lookups: 0 }
  const tx = {
    $queryRaw: async () => [], cuentaEquipo: { findUnique: async () => state.staff },
    evento: { findUnique: async () => state.event, update: async () => ({ ultimoNumero: 5 }) },
    inscripcion: { findUnique: async () => { state.lookups++; return state.replay }, findMany: async () => state.matches, create: async ({ data }) => { state.created.push(data); return data } },
    paciente: { create: async () => ({ id: "baby", nombre: input.bebe.nombre }) }, listaEspera: { findFirst: async () => state.waiting },
  }
  const onsite = load("src/lib/reception/onsite.ts", {
    "@/lib/calendly/capacity": { calendlyCapacity: async () => ({ disponibles: state.disponibles, tokenPrivado: "NO_EXPONER" }) },
    "@/lib/privacy/policy": { parsePrivacy: value => value, paperDeclaration: value => value, PrivacyInputError: InputError },
    "@/lib/privacy/store": { recordConsent: async (_tx, _context, _choice, actor) => { state.consent.push(actor); return { id: "consent" } } },
    "@/lib/families/identity-snapshot": { mailFamily: () => assert.fail("No corresponde crear correo") },
    "@/lib/events/mail-snapshot": { mailEvent: () => assert.fail("No corresponde crear correo") },
    "node:crypto": { createHash, randomBytes }, "@prisma/client": { Prisma: { PrismaClientKnownRequestError: PrismaError } },
    "@/lib/prisma": { prisma: { $transaction: callback => callback(tx) } },
    "@/lib/families/input": { chileToday: () => "2026-11-20" },
    "./store": { receptionSelect: {}, ensureArrival: async (_tx, row, id) => { state.arrivals.push(id); return { inscripcion: row, nueva: true } } },
    "./http": { ReceptionConflict: Conflict }, "./onsite-access": accessFor(null),
  })
  return { actor, state, ...onsite }
}

test("transacción: ADMIN y RECEPCION conservan autor real, número y reintento idempotente", async () => {
  for (const role of ["ADMIN", "RECEPCION"]) {
    const f = fixture(role)
    const first = await f.registerOnsite(f.actor, input)
    assert.equal(first.nuevaInscripcion, true); assert.equal(first.inscripcion.numero, 5)
    assert.equal(first.inscripcion.registradoPorId, f.actor.id)
    assert.deepEqual(f.state.consent, [{ id: f.actor.id, role }])
    f.state.replay = first.inscripcion
    const replay = await f.registerOnsite(f.actor, input)
    assert.equal(replay.nuevaInscripcion, false); assert.equal(replay.inscripcion.id, first.inscripcion.id)
    assert.equal(f.state.created.length, 1)
    await assert.rejects(f.registerOnsite(f.actor, { ...input, nombreApoderado: "Otro" }), Conflict)
    f.state.staff.active = false
    await assert.rejects(f.registerOnsite(f.actor, input), Conflict)
    assert.equal(f.state.arrivals.length, 2)
  }
})

test("revalidación interna rechaza baja, cambio de rol/versión, clave pendiente y perfiles no autorizados antes del replay", async () => {
  for (const staff of [null, { active: false }, { role: "KINESIOLOGO" }, { role: "RECEPCION" }, { version: 8 }, { mustChangePassword: true }]) {
    const f = fixture()
    f.state.staff = staff === null ? null : { ...f.state.staff, ...staff }
    await assert.rejects(f.registerOnsite(f.actor, input), Conflict)
    assert.equal(f.state.lookups, 0); assert.equal(f.state.created.length, 0); assert.equal(f.state.arrivals.length, 0)
  }
  for (const role of ["KINESIOLOGO", "APODERADO", "OTRO"]) {
    const f = fixture(role)
    await assert.rejects(f.registerOnsite(f.actor, input), Conflict)
    assert.equal(f.state.lookups, 0)
  }
})

test("presencial conserva fecha chilena, cupos, lista de espera y prohibición de consentimiento clínico", async () => {
  for (const role of ["ADMIN", "RECEPCION"]) {
    for (const change of [{ event: { id: eventId, fecha: new Date("2026-11-21") } }, { disponibles: 0 }, { waiting: { id: "espera" } }]) {
      const f = fixture(role); Object.assign(f.state, change)
      await assert.rejects(f.registerOnsite(f.actor, input), Conflict)
      assert.equal(f.state.created.length, 0)
    }
    for (const key of ["correoResultados", "seguimiento"]) {
      const f = fixture(role)
      await assert.rejects(f.registerOnsite(f.actor, { ...input, privacidad: { ...input.privacidad, [key]: true } }), InputError)
      assert.equal(f.state.created.length, 0)
    }
  }
})

test("disponibilidad usa capacidad protegida y fecha de Chile sin exponer información adicional", async () => {
  const f = fixture()
  assert.deepEqual(await f.onsiteAvailability(eventId), { disponibles: 2, presencialHabilitada: true })
  f.state.disponibles = 0; f.state.event.fecha = new Date("2026-11-21")
  assert.deepEqual(await f.onsiteAvailability(eventId), { disponibles: 0, presencialHabilitada: false })
  f.state.event = null
  assert.equal(await f.onsiteAvailability(eventId), null)
})

function renderReceipt(administration) {
  let index = 0
  const states = [{}, {}, false, false, "", "", { id: input.id, numero: 5, bebe: "Bebé ficticio", apoderado: "Persona ficticia" }, "PENDIENTE"]
  const jsx = (type, props) => ({ type, props })
  const component = load("src/components/OnsiteRegistration.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    react: { useState: () => [states[index++], () => {}], useRef: () => ({ current: null }) },
    "./PrivacyFields": { PaperPrivacy: "paper-privacy", emptyDeclaration: {} },
    "@/lib/privacy/policy": { PRIVACY_VERSION: "test" },
    "next/image": { default: "qr-image" }, "./ReceptionLinking": { ReceptionLinking: "reception-linking" },
  })
  return JSON.stringify(component.OnsiteRegistration({ administration, event: { id: eventId, nombre: "Evento ficticio" }, enabled: true, disponibles: 2, disabled: false, onStart: () => true, onFinish() {}, onRegistered: async () => {} }))
}
test("UI: comprobante en administración sin QR, reenvío ni vinculación; recepción los conserva", () => {
  const admin = renderReceipt(true), reception = renderReceipt(false)
  assert(admin.includes("Bebé ficticio")); assert(admin.includes("005"))
  for (const value of ["qr-image", "Descargar QR", "Reintentar correo", "reception-linking", "/api/recepcion/inscripciones/"]) {
    assert(!admin.includes(value), value); assert(reception.includes(value), value)
  }
})


test("otros endpoints de recepción siguen rechazando ADMIN y kinesiología antes de operar", async () => {
  const directory = new URL("../src/app/api/recepcion/", import.meta.url)
  const paths = readdirSync(directory, { recursive: true }).filter(path => path.endsWith("route.ts") && path !== "presencial/route.ts")
  assert(paths.length >= 10)
  for (const role of ["ADMIN", "KINESIOLOGO"]) {
    const http = load("src/lib/reception/http.ts", {
      "@/lib/access": { getTeamUser: async () => ({ role }) },
      "@/lib/privacy/policy": { PrivacyInputError: InputError }, "@/lib/privacy/store": { PrivacyConflict: Conflict },
      "@prisma/client": { Prisma: { PrismaClientKnownRequestError: PrismaError } },
      "@/lib/events/input": { EventInputError: InputError }, "./input": { ReceptionInputError: InputError }, "@/lib/families/input": { FamilyInputError: InputError },
    })
    for (const path of paths) {
      const source = readFileSync(new URL(path, directory), "utf8")
      const imports = ts.createSourceFile(path, source, ts.ScriptTarget.Latest).statements.filter(ts.isImportDeclaration).map(statement => statement.moduleSpecifier.text)
      const dependencies = Object.fromEntries(imports.map(name => [name, {}]))
      dependencies["@/lib/reception/http"] = { ...http, receptionFailure: () => assert.fail(`Operación ejecutada: ${path}`) }
      const route = load(`src/app/api/recepcion/${path}`, dependencies)
      for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
        if (!route[method]) continue
        const result = await route[method](new Request(`https://example.test/${path}`), { params: Promise.resolve({ id: input.id }) })
        assert.equal(result.status, 403, `${role} ${method} ${path}`)
      }
    }
  }
})


test("CSRF presencial ADMIN/RECEPCION: rechaza origen ausente, ajeno, null y host suplantado antes de leer datos o escribir", async () => {
  for (const role of ["ADMIN", "RECEPCION"]) {
    let reads = 0, writes = 0, deliveries = 0
    const route = load("src/app/api/recepcion/presencial/route.ts", {
      "@/lib/team-passwords/store": originPolicy(),
      "@/lib/events/input": {}, "@/lib/reception/onsite-access": accessFor({ id: "actor", role, version: 7 }),
      "@/lib/prisma": { prisma: { correoInscripcion: { findUnique: async () => null } } },
      "@/lib/reception/onsite-input": { parseOnsiteInput: data => data },
      "@/lib/reception/onsite": { registerOnsite: async () => { writes++; return { inscripcion: { id: input.id }, nuevaInscripcion: true } } },
      "@/lib/reception/http": { receptionResponse: response, receptionJson: request => { reads++; return request.json() }, receptionFailure: () => assert.fail("Error inesperado") },
      "@/lib/families/confirmation": { deliverConfirmation: async () => { deliveries++ } },
    })
    for (const origin of [undefined, "https://ajeno.example", "null", "https://example.test.ajeno.example", "http://example.test", "https://example.test:444"]) {
      const headers = { "content-type": "application/json", host: "ajeno.example", "x-forwarded-host": "ajeno.example" }
      if (origin !== undefined) headers.origin = origin
      const result = await route.POST(new Request("https://ajeno.example/api/recepcion/presencial", { method: "POST", headers, body: JSON.stringify(input) }))
      assert.equal(result.status, 403, `${role} ${origin ?? "sin origen"}`)
      assert.equal(result.headers.get("cache-control"), "private, no-store")
    }
    assert.equal(reads, 0); assert.equal(writes, 0); assert.equal(deliveries, 0)
    const trusted = await route.POST(new Request("https://example.test/api/recepcion/presencial", { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" }, body: JSON.stringify(input) }))
    assert.equal(trusted.status, 201)
    assert.equal(reads, 1); assert.equal(writes, 1); assert.equal(deliveries, 1)
  }
})

test("CSRF presencial: política configurada falla cerrada y permite localhost de pruebas", () => {
  const trusted = new Request("https://example.test/api/recepcion/presencial", { headers: { origin: "https://example.test" } })
  for (const env of [{}, { AUTH_URL: "inválida" }, { AUTH_URL: "http://example.test" }, { AUTH_URL: "https://usuario:clave@example.test" }]) assert.equal(originPolicy(env).samePasswordOrigin(trusted), false)
  assert.equal(originPolicy({ NEXTAUTH_URL: "https://example.test" }).samePasswordOrigin(trusted), true)
  const local = new Request("http://localhost:3117/api/recepcion/presencial", { headers: { origin: "http://localhost:3117" } })
  assert.equal(originPolicy({ AUTH_URL: "http://localhost:3117" }).samePasswordOrigin(local), true)
})
