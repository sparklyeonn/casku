import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"

// Load only this route with explicit fakes: no app boot, environment files, DB or mail transport.
const source = readFileSync(new URL("../src/app/api/kinesiologia/resultados/[id]/publicar/route.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function route({ access = { user: { id: "author-fixture" } }, publicationFailure = false, mailFailure = false } = {}) {
  const calls = []
  const saved = { id: "evaluation-fixture", publicacion: { id: "publication-fixture", version: 1, correo: { estado: "PENDIENTE" } } }
  const modules = {
    "@/lib/kinesiology/http": {
      clinicalAccess: async () => access,
      clinicalJson: async request => request.json(),
      clinicalResponse: (data, status = 200) => Response.json(data, { status }),
      clinicalFailure: () => Response.json({ error: "Conflicto" }, { status: 409 }),
    },
    "@/lib/results/input": { evaluationId: id => id, resultRevision: revision => revision },
    "@/lib/results/store": {
      publishResult: async (...args) => { calls.push(["publish", ...args]); if (publicationFailure) throw Error("blocked"); return { id: saved.publicacion.id, nueva: true } },
      ownedReview: async (...args) => { calls.push(["review", ...args]); return saved },
    },
    "@/lib/results/mail": { deliverResult: async id => { calls.push(["mail", id]); if (mailFailure) throw Error("mail-unavailable") } },
  }
  const exports = {}
  runInNewContext(compiled, { exports, require: name => { if (!(name in modules)) throw Error(`Unexpected dependency: ${name}`); return modules[name] } })
  const submit = () => exports.POST(new Request("http://fixture.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: 3, correo: "unverified@example.invalid", apoderadoId: "intruder-fixture" }) }), { params: Promise.resolve({ id: saved.id }) })
  return { calls, saved, submit }
}
test("publicación: un fallo posterior de correo no convierte una publicación guardada en error", async () => {
  const fixture = route({ mailFailure: true })
  const response = await fixture.submit()
  assert.equal(response.status, 201)
  const data = await response.json()
  assert.deepEqual(data.resultado, fixture.saved)
  assert.match(data.aviso, /Resultado publicado/)
  assert.match(data.aviso, /antes de reintentar/)
  assert.deepEqual(fixture.calls, [["publish", "author-fixture", "evaluation-fixture", 3], ["mail", "publication-fixture"], ["review", "author-fixture", "evaluation-fixture"]])
})
test("publicación: rechazo de autoría, consentimiento o vinculación no inicia correo", async () => {
  const fixture = route({ publicationFailure: true })
  assert.equal((await fixture.submit()).status, 409)
  assert.deepEqual(fixture.calls, [["publish", "author-fixture", "evaluation-fixture", 3]])
})
test("publicación: acceso denegado evita todas las operaciones", async () => {
  const fixture = route({ access: { response: new Response(null, { status: 403 }) } })
  assert.equal((await fixture.submit()).status, 403)
  assert.deepEqual(fixture.calls, [])
})
