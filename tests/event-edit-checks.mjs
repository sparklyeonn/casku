import { familyConsent } from "./privacy-fixtures.mjs"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
export async function eventEditChecks({ db, client, signIn, password, accounts, admin, anonymous, family, post, createEvent, mails }) {
  const parent = await family("event-edits@example.com"), reception = client(), kine = client()
  for (const [request, account] of [[reception, accounts[0]], [kine, accounts[2]]]) await signIn(request, "equipo", { email: account.email, password })
  const current = async id => (await (await admin("/api/eventos")).json()).eventos.find(row => row.id === id)
  const patch = (event, changes = {}, request = admin) => request(`/api/eventos/${event.id}`, { ...post({ ...event, ...changes }), method: "PATCH" })
  const create = async (name, cupos, open = false) => current((await createEvent(admin, name, cupos, open)).id)
  let event = await create("Edición vacía", 4)
  const original = event, future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  for (const [request, status] of [[anonymous, 401], [parent.request, 401], [reception, 403], [kine, 403]]) assert.equal((await patch(event, { nombre: "Sin permiso" }, request)).status, status)
  assert.equal((await patch({ ...event, id: randomUUID() })).status, 404)
  for (const changes of [{ nombre: " " }, { fecha: "2026-02-30" }, { lugar: " " }, { cupos: 0 }, { cupos: "5" }, { revision: 0 }, { revision: undefined }]) assert.equal((await patch(event, changes)).status, 400)
  const changes = { nombre: "Nombre corregido", fecha: future, lugar: "Lugar corregido", cupos: 6, inscritos: 500, ultimoNumero: 500, inscripcionesAbiertas: true, creadoPorId: "intruso" }
  let response = await patch(event, changes); assert.equal(response.status, 200); event = (await response.json()).evento
  assert.equal(event.revision, original.revision + 1); assert.equal(event.fecha, future); assert.equal(event.inscritos, 0); assert.equal(event.inscripcionesAbiertas, false)
  assert.equal((await patch(original, changes)).status, 200, "Una respuesta perdida no duplica la edición")
  assert.equal((await db.query('SELECT count(*)::int n FROM "CambioEvento" WHERE "eventoId"=$1', [event.id])).rows[0].n, 1)
  const audit = (await db.query('SELECT * FROM "CambioEvento" WHERE "eventoId"=$1', [event.id])).rows[0]
  assert.notEqual(audit.actorId, "intruso"); assert.equal(audit.anterior.nombre, original.nombre); assert.equal(audit.nueva.nombre, changes.nombre)
  assert.equal((await patch(original, { nombre: "Versión antigua" })).status, 409)
  const simultaneous = await Promise.all([patch(event, { nombre: "Edición simultánea A" }), patch(event, { nombre: "Edición simultánea B" })])
  assert.deepEqual(simultaneous.map(row => row.status).sort(), [200, 409]); event = await current(event.id)
  assert.equal((await admin(`/api/eventos/${event.id}/inscripciones`, { ...post({ abiertas: true }), method: "PATCH" })).status, 200)
  assert.equal((await patch(event, { cupos: 8 })).status, 409, "Abrir inscripciones también invalida un formulario anterior")
  event = await current(event.id)
  const later = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10)
  assert.equal((await patch(event, { fecha: later })).status, 409)
  await admin(`/api/eventos/${event.id}/inscripciones`, { ...post({ abiertas: false }), method: "PATCH" })
  event = await current(event.id)
  assert.equal((await patch(event, { fecha: "2000-01-01" })).status, 409)
  response = await patch(event, { fecha: later }); assert.equal(response.status, 200)

  const booked = await create("Evento con familias", 3, true)
  async function register(eventoId, name) {
    return parent.request("/api/familias/inscripciones", post({ ...familyConsent, id: randomUUID(), eventoId, nombreBebe: name, fechaNacimiento: "2026-01-01", nombreApoderado: "Familia ficticia de edición" }))
  }
  response = await register(booked.id, "Bebé edición"); assert.equal(response.status, 201)
  const receipt = (await response.json()).inscripcion, mailCount = mails.length
  assert.equal((await reception("/api/recepcion/llegadas", post({ eventoId: booked.id, inscripcionId: receipt.id }))).status, 201)
  const beforeRows = (await db.query('SELECT to_jsonb(i) AS row FROM "Inscripcion" i WHERE id=$1 UNION ALL SELECT to_jsonb(f) FROM "EntradaFila" f WHERE "inscripcionId"=$1', [receipt.id])).rows
  const originalMail = (await db.query('SELECT "datosEvento" FROM "CorreoInscripcion" WHERE "inscripcionId"=$1', [receipt.id])).rows[0].datosEvento
  const selections = (await db.query('SELECT * FROM "EventoSeleccionado" ORDER BY "usuarioId"')).rows
  let fresh = await current(booked.id)
  assert.equal((await patch(fresh, { fecha: later })).status, 409)
  response = await patch(fresh, { nombre: "Evento renombrado", lugar: "Recinto corregido", cupos: 1 }); assert.equal(response.status, 200); fresh = (await response.json()).evento
  assert.equal(fresh.inscritos, 1); assert.equal(fresh.cupos, 1)
  assert.deepEqual((await db.query('SELECT to_jsonb(i) AS row FROM "Inscripcion" i WHERE id=$1 UNION ALL SELECT to_jsonb(f) FROM "EntradaFila" f WHERE "inscripcionId"=$1', [receipt.id])).rows, beforeRows)
  assert.deepEqual((await db.query('SELECT * FROM "EventoSeleccionado" ORDER BY "usuarioId"')).rows, selections)
  assert.equal(mails.length, mailCount, "Editar no dispara notificaciones")
  const visible = (await (await parent.request("/api/familias/inscripciones")).json()).inscripciones.find(row => row.id === receipt.id)
  assert.equal(visible.evento.nombre, fresh.nombre); assert.equal(visible.evento.lugar, fresh.lugar); assert.equal(visible.numero, receipt.numero); assert.equal(visible.bebe.id, receipt.bebe.id)
  await db.query('UPDATE "CorreoInscripcion" SET estado=\'FALLIDO\',"disponibleAt"=$1 WHERE "inscripcionId"=$2', [new Date(Date.now() - 1000), receipt.id])
  const retry = await parent.request(`/api/familias/inscripciones/${receipt.id}/correo`, post({})); assert.equal(retry.status, 200); assert.equal((await retry.json()).estado, "ENVIADO")
  assert.deepEqual((await db.query('SELECT "datosEvento" FROM "CorreoInscripcion" WHERE "inscripcionId"=$1', [receipt.id])).rows[0].datosEvento, originalMail)
  assert.equal(mails.length, mailCount, "La clave y el cuerpo del correo preparado se conservan")
  // La copia clínica publicada no se reescribe al corregir la descripción del evento.
  const publication = (await db.query('SELECT p.id,p.datos,f."eventoId" FROM "ResultadoPublicado" p JOIN "Evaluacion" e ON e.id=p."evaluacionId" JOIN "EntradaFila" f ON f.id=e."filaId" LIMIT 1')).rows[0]
  assert(publication)
  assert.equal((await patch(await current(publication.eventoId), { nombre: "Corrección con publicación" })).status, 200)
  assert.deepEqual((await db.query('SELECT datos FROM "ResultadoPublicado" WHERE id=$1', [publication.id])).rows[0].datos, publication.datos)
  console.log("OK edición: permisos, campos validados, revisión, reintentos, fecha protegida, selección/números/QR/fila conservados y correos/publicaciones inmutables.")

  // Comparten el bloqueo del evento: nunca se reduce capacidad sobre una reserva concurrente.
  fresh = await current(booked.id); response = await patch(fresh, { cupos: 2 }); assert.equal(response.status, 200); fresh = (await response.json()).evento
  const race = await Promise.all([patch(fresh, { cupos: 1 }), register(booked.id, "Bebé último cupo")])
  assert(race.every(row => [200, 201, 409].includes(row.status)))
  assert.equal(race.filter(row => row.status === 409).length, 1)
  const final = await current(booked.id)
  assert(final.inscritos <= final.cupos)
  if (final.inscritos === 1) {
    assert.equal((await patch(final, { cupos: 2 })).status, 200)
    assert.equal((await register(booked.id, "Bebé capacidad posterior")).status, 201)
  }
  fresh = await current(booked.id)
  assert.equal((await patch(fresh, { cupos: 1 })).status, 409)
  // También se protege una reserva real si el contador auxiliar fue alterado por fuera.
  await db.query('UPDATE "Evento" SET inscritos=0 WHERE id=$1', [booked.id])
  assert.equal((await patch(fresh, { cupos: 1 })).status, 409)
  await db.query('UPDATE "Evento" SET inscritos=2 WHERE id=$1', [booked.id])
  fresh = await current(booked.id)
  await db.exec(`CREATE FUNCTION event_edit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER event_edit_fail_trigger BEFORE INSERT ON "CambioEvento" FOR EACH ROW EXECUTE FUNCTION event_edit_fail();`)
  assert.equal((await patch(fresh, { lugar: "Cambio que falla" })).status, 503)
  assert.deepEqual(await current(booked.id), fresh)
  await db.exec('DROP TRIGGER event_edit_fail_trigger ON "CambioEvento"; DROP FUNCTION event_edit_fail();')
  console.log("OK controles: cupos frente a inscripción simultánea, mínimo de reservas reales y rollback completo si falla la auditoría.")
}
