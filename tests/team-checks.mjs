import { paperConsent } from "./privacy-fixtures.mjs"
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
export async function teamChecks({ db, client, signIn, password, accounts, admin, anonymous, f1, post, createEvent }) {
  const endpoint = "/api/administracion/cuentas"
  const reception = client(), kine = client()
  for (const [request, account] of [[reception, accounts[0]], [kine, accounts[2]]]) await signIn(request, "equipo", { email: account.email, password })
  const session = async request => (await (await request("/api/auth/session")).json())?.user
  const fresh = async (email, secret) => { const request = client(); await signIn(request, "equipo", { email, password: secret }); return request }
  async function list(request = admin, suffix = "") { const response = await request(endpoint + suffix); assert.equal(response.status, 200); return response.json() }
  async function create(role, email = `team-${randomUUID()}@example.com`) {
    const secret = randomBytes(20).toString("base64url"), input = { id: randomUUID(), email, name: "Integrante ficticia", role, active: true, password: secret }
    const response = await admin(endpoint, post(input)); assert.equal(response.status, 201)
    const result = await response.json(); assert(!JSON.stringify(result).match(/passwordHash|solicitudHash|"password"/))
    assert.equal((await admin(endpoint, post(input))).status, 200, "Reintento no duplica cuentas")
    return { account: result.cuenta, secret, request: await fresh(email, secret), input }
  }
  async function patch(account, changes, request = admin) { return request(`${endpoint}/${encodeURIComponent(account.id)}`, { ...post({ ...account, ...changes }), method: "PATCH" }) }
  const initial = await list()
  assert(initial.cuentas.some(account => account.id === accounts[2].id))
  assert(!JSON.stringify(initial).match(/passwordHash|solicitudHash|scrypt:/))
  assert.equal((await db.query('SELECT "passwordHash" FROM "CuentaEquipo" WHERE id=$1', [accounts[2].id])).rows[0].passwordHash, accounts[2].passwordHash)
  for (const [request, code] of [[anonymous, 401], [f1.request, 401], [reception, 403], [kine, 403]]) {
    assert.equal((await request(endpoint)).status, code)
    assert.equal((await request(endpoint, post({}))).status, code)
    assert.equal((await request(`${endpoint}/${accounts[0].id}`, { ...post({}), method: "PATCH" })).status, code)
  }
  const created = await create("KINESIOLOGO"), copy = created.input
  for (const changes of [{ role: "APODERADO" }, { role: "SUPERADMIN" }, { password: "corta" }, { active: "true" }, { name: " " }, { email: "inválido" }]) assert.equal((await admin(endpoint, post({ ...copy, id: randomUUID(), ...changes }))).status, 400)
  assert.equal((await admin(endpoint, post({ ...copy, id: randomUUID() }))).status, 409)
  let account = created.account
  const changed = await patch(account, { name: "Nombre editado", autorId: "falso", passwordHash: "falso" }); assert.equal(changed.status, 200)
  account = (await changed.json()).cuenta
  assert(!(await session(created.request)), "Editar invalida la sesión anterior")
  assert.equal((await patch(created.account, { name: "Versión antigua" })).status, 409)
  let request = await fresh(account.email, created.secret)
  assert.equal((await session(request)).name, "Nombre editado")
  let response = await patch(account, { role: "RECEPCION" }); assert.equal(response.status, 200); account = (await response.json()).cuenta
  assert(!(await session(request))); request = await fresh(account.email, created.secret)
  assert.equal((await session(request)).role, "RECEPCION")
  assert.equal((await request("/api/evaluaciones", post({}))).status, 403)
  response = await patch(account, { active: false }); assert.equal(response.status, 200); account = (await response.json()).cuenta
  assert(!(await session(request))); assert(!(await session(await fresh(account.email, created.secret))))
  response = await patch(account, { active: true }); assert.equal(response.status, 200); account = (await response.json()).cuenta
  assert(!(await session(request)), "Reactivar no restaura las sesiones anteriores")
  request = await fresh(account.email, created.secret); assert.equal((await session(request)).id, account.id)
  const newSecret = randomBytes(20).toString("base64url")
  response = await patch(account, { password: newSecret }); assert.equal(response.status, 200); account = (await response.json()).cuenta
  assert(!(await session(request))); assert(!(await session(await fresh(account.email, created.secret))))
  request = await fresh(account.email, newSecret); assert.equal((await session(request)).id, account.id)
  assert(!JSON.stringify((await db.query('SELECT * FROM "CambioCuentaEquipo" WHERE "cuentaId"=$1', [account.id])).rows).match(/passwordHash|scrypt:|solicitudHash/))
  assert.equal((await admin("/administracion/cuentas")).status, 200)
  assert.equal((await admin(endpoint + "?pagina=0")).status, 400)
  assert.equal((await list(admin, "?buscar=Nombre%20editado")).cuentas.length, 1)
  console.log("OK cuentas: importación con IDs/claves conservados, permisos, creación idempotente, edición, perfiles, desactivación, reactivación y contraseña con sesiones revocadas.")

  response = await patch(account, { role: "KINESIOLOGO" }); assert.equal(response.status, 200); account = (await response.json()).cuenta
  request = await fresh(account.email, newSecret)
  const event = await createEvent(admin, "Atención y desactivación", 2, false)
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const part = key => parts.find(p => p.type === key).value
  await db.query('UPDATE "Evento" SET fecha=$1::date WHERE id=$2', [`${part("year")}-${part("month")}-${part("day")}`, event.id])
  assert.equal((await reception("/api/recepcion/presencial", post({ ...paperConsent, id: randomUUID(), eventoId: event.id, nombreBebe: "Atención ficticia", fechaNacimiento: "2026-01-01", nombreApoderado: "Familia ficticia" }))).status, 201)
  const call = await request("/api/kinesiologia/llamar", post({ id: randomUUID(), eventoId: event.id })); assert.equal(call.status, 200)
  const attention = (await call.json()).atencion
  assert.equal((await patch(account, { active: false })).status, 409)
  assert.equal((await patch(account, { role: "RECEPCION" })).status, 409)
  assert.equal((await request("/api/kinesiologia/devolver", post({ atencionId: attention.id, reservaId: attention.reservaId }))).status, 200)
  assert.equal((await patch(account, { active: false })).status, 200)
  const me = initial.cuentas.find(row => row.id === initial.miId)
  assert.equal((await patch(me, { active: false })).status, 409)
  assert.equal((await patch(me, { role: "RECEPCION" })).status, 409)
  const second = await create("ADMIN")
  const competing = await Promise.all([patch(second.account, { active: false }), patch(me, { active: false }, second.request)])
  assert.equal(competing.filter(response => response.status === 200).length, 1)
  assert(competing.every(response => [200, 401, 403, 409].includes(response.status)))
  assert.equal((await db.query('SELECT count(*)::int n FROM "CuentaEquipo" WHERE active AND role=\'ADMIN\'')).rows[0].n, 1)
  const adminRequest = (await session(admin)) ? admin : second.request
  // Una escritura de auditoría fallida no deja cambios parciales de acceso.
  const target = (await list(adminRequest, `?buscar=${encodeURIComponent(account.email)}`)).cuentas[0]
  await db.exec(`CREATE FUNCTION team_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER team_audit_fail_trigger BEFORE INSERT ON "CambioCuentaEquipo" FOR EACH ROW EXECUTE FUNCTION team_audit_fail();`)
  assert.equal((await patch(target, { active: true }, adminRequest)).status, 503)
  assert.equal((await db.query('SELECT active,version FROM "CuentaEquipo" WHERE id=$1', [target.id])).rows[0].version, target.version)
  assert.equal((await db.query('SELECT active FROM "CuentaEquipo" WHERE id=$1', [target.id])).rows[0].active, false)
  await db.exec('DROP TRIGGER team_audit_fail_trigger ON "CambioCuentaEquipo"; DROP FUNCTION team_audit_fail();')
  // El entorno aún contiene las cuentas antiguas; consultar no resucita una desactivada.
  assert.equal((await list(adminRequest)).total, initial.total + 2)
  const disabledId = competing[0].status === 200 ? second.account.id : me.id
  assert.equal((await db.query('SELECT active FROM "CuentaEquipo" WHERE id=$1', [disabledId])).rows[0].active, false)
  console.log("OK administración: atención activa protegida, no autoexclusión, cambios simultáneos conservan un administrador y auditoría transaccional sin contraseñas.")
}
