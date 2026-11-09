import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { PNG } from "pngjs"
import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, QRCodeReader } from "@zxing/library"

// Reutiliza la base y las inscripciones del recorrido familiar; nunca toca la base configurada.
export async function receptionChecks({ db, client, signIn, password, accounts, admin, anonymous, f1, a, b, first, second, own2, png, token, post, createEvent }) {
  const reception = client(), other = client(), clinician = client()
  for (const [request, account] of [[reception, accounts[0]], [other, accounts[1]], [clinician, accounts[2]]]) assert.equal((await signIn(request, "equipo", { email: account.email, password })).role, account.role)
  const actions = [
    ["/api/recepcion/eventos", undefined],
    ["/api/recepcion/eventos", post({ eventoId: a.id })],
    ["/api/recepcion/buscar", post({ eventoId: a.id, consulta: "001" })],
    ["/api/recepcion/llegadas", post({ eventoId: a.id, inscripcionId: first.id })],
    [`/api/recepcion/fila?eventoId=${a.id}`, undefined],
  ]
  for (const [request, expected] of [[anonymous, 401], [f1.request, 401], [admin, 403], [clinician, 403]]) for (const [path, options] of actions) assert.equal((await request(path, options)).status, expected)
  assert.equal((await reception("/api/evaluaciones", post({}))).status, 403)
  assert.equal((await reception("/api/eventos", post({}))).status, 403)

  const adminSelection = (await (await admin("/api/eventos")).json()).seleccionadoId
  assert.equal((await reception("/api/recepcion/eventos", post({ eventoId: a.id, usuarioId: "otro" }))).status, 200)
  assert.equal((await other("/api/recepcion/eventos", post({ eventoId: b.id }))).status, 200)
  assert.equal((await (await reception("/api/recepcion/eventos")).json()).seleccionadoId, a.id)
  assert.equal((await (await other("/api/recepcion/eventos")).json()).seleccionadoId, b.id)
  assert.equal((await (await admin("/api/eventos")).json()).seleccionadoId, adminSelection)
  const restored = client()
  await signIn(restored, "equipo", { email: accounts[0].email, password })
  assert.equal((await (await restored("/api/recepcion/eventos")).json()).seleccionadoId, a.id)

  // Decodifica el PNG real con el mismo motor QR utilizado por la cámara.
  const image = PNG.sync.read(png), luminances = new Uint8ClampedArray(image.width * image.height)
  for (let pixel = 0; pixel < luminances.length; pixel++) luminances[pixel] = image.data[pixel * 4]
  const decoded = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminances, image.width, image.height)))).getText()
  assert.equal(decoded, `CASKU:INSCRIPCION:${token}`)
  const lookup = await reception("/api/recepcion/buscar", post({ eventoId: a.id, consulta: decoded }))
  assert.equal(lookup.status, 200); assert(lookup.headers.get("cache-control").includes("no-store"))
  const row = (await lookup.json()).inscripcion
  assert.equal(row.id, first.id); assert.equal(row.llegada, null)
  assert(!JSON.stringify(row).match(/qrToken|rut|correo|telefono|diagnostico|evaluaciones|fechaNacimiento/))
  const numeric = await reception("/api/recepcion/buscar", post({ eventoId: a.id, consulta: "000001" }))
  assert.equal((await numeric.json()).inscripcion.id, first.id)
  const sameNumber = await reception("/api/recepcion/buscar", post({ eventoId: b.id, consulta: "1" }))
  assert.equal((await sameNumber.json()).inscripcion.id, own2.inscripcion.id)
  assert.equal((await reception("/api/recepcion/buscar", post({ eventoId: b.id, consulta: decoded }))).status, 404)
  for (const consulta of ["", "0", "1.5", "CASKU:INSCRIPCION:no", "https://example.com"]) assert.equal((await reception("/api/recepcion/buscar", post({ eventoId: a.id, consulta }))).status, 400)
  assert.equal((await reception("/api/recepcion/buscar", post({ eventoId: a.id, consulta: "99999" }))).status, 404)
  assert.equal((await reception("/api/recepcion/buscar", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" })).status, 400)
  assert.equal((await (await reception(`/api/recepcion/fila?eventoId=${a.id}`)).json()).total, 0, "Buscar o escanear no confirma llegada")
  await admin(`/api/eventos/${a.id}/inscripciones`, { ...post({ abiertas: false }), method: "PATCH" })

  // Dos recepcionistas confirman simultáneamente: solo se reserva una entrada.
  const results = await Promise.all([reception, other].map(request => request("/api/recepcion/llegadas", post({ eventoId: a.id, inscripcionId: second.inscripcion.id, confirmadoPorId: "intruso" }))))
  assert.deepEqual(results.map(r => r.status).sort(), [200, 201])
  const arrivals = await Promise.all(results.map(r => r.json()))
  assert.equal(arrivals[0].inscripcion.llegada.orden, 1); assert.deepEqual(arrivals[0].inscripcion.llegada, arrivals[1].inscripcion.llegada)
  const recorded = (await db.query('SELECT "confirmadoPorId" FROM "EntradaFila" WHERE "inscripcionId"=$1', [second.inscripcion.id])).rows[0]
  assert(accounts.slice(0, 2).some(account => account.id === recorded.confirmadoPorId))
  const nextArrival = await reception("/api/recepcion/llegadas", post({ eventoId: a.id, inscripcionId: first.id }))
  assert.equal(nextArrival.status, 201)
  const confirmed = await nextArrival.json()
  assert.equal(confirmed.inscripcion.llegada.orden, 2)
  const replay = await other("/api/recepcion/llegadas", post({ eventoId: a.id, inscripcionId: first.id }))
  assert.equal(replay.status, 200); assert.deepEqual((await replay.json()).inscripcion.llegada, confirmed.inscripcion.llegada)
  const queue = await (await reception(`/api/recepcion/fila?eventoId=${a.id}`)).json()
  assert.equal(queue.total, 2); assert.deepEqual(queue.inscripciones.map(row => row.numero), [2, 1])
  assert.equal((await (await reception(`/api/recepcion/fila?eventoId=${b.id}`)).json()).total, 0)
  assert.equal((await reception("/api/recepcion/llegadas", post({ eventoId: b.id, inscripcionId: first.id }))).status, 404)
  assert.equal((await reception("/api/recepcion/llegadas", post({ eventoId: a.id, inscripcionId: randomUUID() }))).status, 404)
  assert.equal((await reception(`/api/recepcion/fila?eventoId=${a.id}&despues=-1`)).status, 400)
  assert.equal((await reception(`/api/recepcion/fila?eventoId=${randomUUID()}`)).status, 404)
  assert.equal((await db.query('SELECT inscritos, "ultimoOrdenFila" FROM "Evento" WHERE id=$1', [a.id])).rows[0].inscritos, 2, "Una llegada no consume otro cupo")

  // Un error al crear la entrada debe revertir el contador; el reintento conserva la secuencia.
  await db.exec(`CREATE FUNCTION reception_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$;
    CREATE TRIGGER reception_fail_trigger BEFORE INSERT ON "EntradaFila" FOR EACH ROW EXECUTE FUNCTION reception_fail();`)
  assert.equal((await reception("/api/recepcion/llegadas", post({ eventoId: b.id, inscripcionId: own2.inscripcion.id }))).status, 503)
  assert.equal((await db.query('SELECT "ultimoOrdenFila" FROM "Evento" WHERE id=$1', [b.id])).rows[0].ultimoOrdenFila, 0)
  await db.exec('DROP TRIGGER reception_fail_trigger ON "EntradaFila"; DROP FUNCTION reception_fail();')
  const recovered = await reception("/api/recepcion/llegadas", post({ eventoId: b.id, inscripcionId: own2.inscripcion.id }))
  assert.equal((await recovered.json()).inscripcion.llegada.orden, 1)
  await assert.rejects(db.query('INSERT INTO "EntradaFila" (id,"eventoId","inscripcionId",orden,"confirmadoPorId") VALUES ($1,$2,$3,2,$4)', [randomUUID(), b.id, first.id, accounts[0].id]), "La base impide mezclar eventos")

  // Página de 50 más cursor: no truncar silenciosamente una fila larga.
  const long = await createEvent(admin, "Fila extensa ficticia", 55, false)
  const owner = (await db.query('SELECT "apoderadoId" FROM "Inscripcion" WHERE id=$1', [first.id])).rows[0].apoderadoId
  await db.query(`INSERT INTO "Paciente" (id,nombre,"fechaNacimiento","apoderadoId") SELECT 'fila-fixture-'||n, 'Bebé ficticio '||n, '2026-01-01'::timestamp, $1::uuid FROM generate_series(1,55) n`, [owner])
  await db.query(`INSERT INTO "Inscripcion" (id,"solicitudHash","eventoId","pacienteId","apoderadoId",numero,"qrToken") SELECT gen_random_uuid(),'fixture',$1::uuid,'fila-fixture-'||n,$2::uuid,n,'fixture-qr-'||n FROM generate_series(1,55) n`, [long.id, owner])
  await db.query(`INSERT INTO "EntradaFila" (id,"eventoId","inscripcionId",orden,"confirmadoPorId") SELECT gen_random_uuid(),"eventoId",id,numero,$2 FROM "Inscripcion" WHERE "eventoId"=$1::uuid`, [long.id, accounts[0].id])
  await db.query('UPDATE "Evento" SET inscritos=55,"ultimoNumero"=55,"ultimoOrdenFila"=55 WHERE id=$1', [long.id])
  const page1 = await (await reception(`/api/recepcion/fila?eventoId=${long.id}`)).json()
  assert.equal(page1.total, 55); assert.equal(page1.inscripciones.length, 50); assert.equal(page1.siguiente, 50)
  const page2 = await (await reception(`/api/recepcion/fila?eventoId=${long.id}&despues=${page1.siguiente}`)).json()
  assert.equal(page2.inscripciones.length, 5); assert.equal(page2.inscripciones[0].numero, 51); assert.equal(page2.siguiente, null)
  await db.query('UPDATE "EntradaFila" SET estado=\'EN_ATENCION\' WHERE "eventoId"=$1 AND orden=1', [long.id])
  const waiting = await (await reception(`/api/recepcion/fila?eventoId=${long.id}`)).json()
  assert.equal(waiting.total, 54); assert.equal(waiting.inscripciones[0].numero, 2)
  const page = await reception("/recepcion"); assert.equal(page.status, 200); assert((await page.text()).includes("Llegadas y fila de atención"))
  console.log("OK recepción: número y QR real, permisos, evento por cuenta, llegadas concurrentes sin duplicados, rollback y fila paginada sin datos clínicos.")
}
