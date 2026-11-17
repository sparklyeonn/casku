import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdtemp, chmod, readFile, writeFile, rm, stat, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { backupDatabase, restoreDatabase, dropOwnedDatabase, inventory, localMigrations } from '../scripts/lib/database-backup.mjs'

// No dotenv and no fallback to the application's DATABASE_URL.
const source = process.env.CASKU_BACKUP_TEST_ADMIN_URL
assert(source, 'Configura CASKU_BACKUP_TEST_ADMIN_URL con PostgreSQL local de pruebas, nunca la base de Casku.')
const adminUrl = new URL(source)
assert(['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname), 'El ensayo solo acepta PostgreSQL local.')
assert.equal(decodeURIComponent(adminUrl.pathname), '/postgres')
const admin = new pg.Client({ connectionString: source }), name = 'casku_backup_test_' + randomBytes(12).toString('hex'), marker = randomBytes(24).toString('hex')
const work = await mkdtemp(join(tmpdir(), 'casku-backup-test-')); await chmod(work, 0o700)
const passphrase = randomBytes(48).toString('base64url'), archive = join(work, 'ensayo.casku-backup'), binDirectory = process.env.CASKU_PG_BIN
const generated = [], temporaryNames = async () => (await admin.query("SELECT datname FROM pg_database WHERE datname LIKE 'casku_restore_%' ORDER BY datname")).rows
let created = false, db, target, raw
try {
  await admin.connect()
  const baseline = await temporaryNames()
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`); created = true
  await admin.query(`COMMENT ON DATABASE "${name}" IS 'casku-backup-test:${marker}'`)
  const url = new URL(source); url.pathname = '/' + name
  raw = new pg.Client({ connectionString: url.href }); await raw.connect()
  await raw.query('CREATE TABLE "_prisma_migrations" (id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0)')
  for (const migration of await localMigrations()) {
    await raw.query(await readFile(`prisma/migrations/${migration.name}/migration.sql`, 'utf8'))
    await raw.query('INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,applied_steps_count) VALUES ($1,$2,now(),$3,1)', [randomUUID(), migration.checksum, migration.name])
  }
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) })
  const account = await db.cuentaEquipo.create({ data: { id: 'profesional-ficticia', email: 'equipo@example.com', name: 'Profesional ficticia', role: 'KINESIOLOGO', passwordHash: 'hash-ficticio-no-utilizable' } })
  const reception = await db.cuentaEquipo.create({ data: { id: 'recepcion-ficticia', email: 'recepcion@example.com', name: 'Recepción ficticia', role: 'RECEPCION', passwordHash: 'hash-ficticio-no-utilizable' } })
  const parent = await db.apoderado.create({ data: { correo: 'familia@example.com', nombre: 'Familia de ensayo' } })
  const baby = await db.paciente.create({ data: { nombre: 'Bebé ficticio de respaldo', revisionDatos: 2, fechaNacimiento: new Date('2026-01-01'), apoderadoId: parent.id } })
  const event = await db.evento.create({ data: { nombre: 'Evento de ensayo', fecha: new Date('2026-12-01'), lugar: 'Prueba local', cupos: 10, inscritos: 1, ultimoNumero: 7, ultimoOrdenFila: 1, creadoPorId: account.id } })
  const registration = await db.inscripcion.create({ data: { id: randomUUID(), solicitudHash: randomUUID(), eventoId: event.id, pacienteId: baby.id, apoderadoId: parent.id, numero: 7, qrToken: randomBytes(32).toString('base64url') } })
  const queue = await db.entradaFila.create({ data: { eventoId: event.id, inscripcionId: registration.id, orden: 1, estado: 'ATENDIDO', confirmadoPorId: account.id } })
  const evaluation = await db.evaluacion.create({ data: { pacienteId: baby.id, filaId: queue.id, anteroposterior: 140, biparietal: 120, diagonalIzq: 135, diagonalDer: 138, indiceCraneal: 85.71, indiceAsimetria: 3, diagnostico: 'Resultado ficticio', recomendacion: 'Solo ensayo', kinesiologa: account.name, autorId: account.id } })
  const publication = await db.resultadoPublicado.create({ data: { evaluacionId: evaluation.id, apoderadoId: parent.id, publicadoPorId: account.id, revision: 1, datos: { nombre: baby.nombre, ficticio: true }, correo: { create: { destinatario: parent.correo, estado: 'CANCELADO' } } } })
  await db.versionResultado.create({ data: { publicacionId: publication.id, numero: 1, revisionEvaluacion: 1, datos: { ficticio: true }, motivo: 'Publicación inicial ficticia', actorId: account.id } })
  const consent = await db.autorizacionPrivacidad.create({ data: { ambito: randomUUID(), pacienteId: baby.id, eventoId: event.id, apoderadoId: parent.id, datos: true, correoResultados: false, seguimiento: false, versionTexto: 'ensayo-ficticio' } })
  await db.cambioPrivacidad.create({ data: { autorizacionId: consent.id, revision: 1, actorId: parent.id, perfilActor: 'APODERADO', declarante: 'Familia ficticia', canal: 'CUENTA_VERIFICADA', versionTexto: 'ensayo-ficticio', textos: {}, nueva: { datos: true } } })
  await db.ordenCorreo.create({ data: { publicacionId: publication.id, etapa: 'INICIAL', claveIdempotencia: randomUUID() } })
  await db.correoInscripcion.create({ data: { inscripcionId: registration.id, estado: 'ENVIADO', proveedorId: 'aceptacion-ficticia' } })
  await db.cambioDatos.create({ data: { entidad: 'BEBE', registroId: baby.id, revision: 2, actorId: reception.id, perfilActor: 'RECEPCION', motivo: 'Ensayo ficticio de historial', anterior: {}, nueva: { ficticio: true } } })
  // Exercise a real sequence as well as UUID relationships.
  await raw.query('CREATE TABLE public."EnsayoSecuencia" (id bigserial PRIMARY KEY, value text NOT NULL)')
  await raw.query("INSERT INTO public.\"EnsayoSecuencia\" (value) VALUES ('ficticio uno'),('ficticio dos')")
  async function contents(client) { await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL TIME ZONE 'UTC'"); try { return await inventory(client) } finally { await client.query('ROLLBACK') } }
  const before = await contents(raw)
  const options = { connectionString: url.href, expectedDatabase: name, passphrase, outputFile: archive, binDirectory }
  await assert.rejects(backupDatabase({ ...options, expectedDatabase: 'otra-base' }), error => error.code === 'DATABASE_MISMATCH')
  const unknownMigrationId = randomUUID()
  await raw.query('INSERT INTO public._prisma_migrations (id,checksum,finished_at,migration_name,applied_steps_count) VALUES ($1,$2,now(),$3,1)', [unknownMigrationId, '0'.repeat(64), '20990101000000_migracion_desconocida_ficticia'])
  await assert.rejects(backupDatabase(options), error => error.code === 'MIGRATIONS_MISMATCH')
  await raw.query('DELETE FROM public._prisma_migrations WHERE id=$1', [unknownMigrationId])
  const backed = await backupDatabase(options)
  assert.equal(backed.sha256, createHash('sha256').update(await readFile(archive)).digest('hex'))
  assert.equal((await stat(archive)).mode & 0o777, 0o600)
  assert(!(await readFile(archive)).includes(Buffer.from(baby.nombre)), 'Sin datos del bebé legibles en el archivo cifrado')
  await assert.rejects(backupDatabase(options), error => error.code === 'OUTPUT_EXISTS')
  const restoreOptions = { adminConnectionString: source, expectedAdminDatabase: 'postgres', inputFile: archive, passphrase, binDirectory }
  await assert.rejects(restoreDatabase({ ...restoreOptions, passphrase: 'clave-incorrecta-de-ensayo-de-mas-de-32-caracteres' }), error => error.code === 'ARCHIVE_AUTH')
  const altered = Buffer.from(await readFile(archive)); altered[Math.floor(altered.length / 2)] ^= 1
  const corrupt = join(work, 'alterado.casku-backup'); await writeFile(corrupt, altered, { mode: 0o600 })
  await assert.rejects(restoreDatabase({ ...restoreOptions, inputFile: corrupt }), error => error.code === 'ARCHIVE_AUTH')
  const truncated = join(work, 'incompleto.casku-backup'); await writeFile(truncated, altered.subarray(0, 10), { mode: 0o600 })
  await assert.rejects(restoreDatabase({ ...restoreOptions, inputFile: truncated }), error => error.code === 'ARCHIVE_INVALID')
  assert.deepEqual(await temporaryNames(), baseline, 'Errores criptográficos no crean destinos')
  await assert.rejects(dropOwnedDatabase(admin, 'postgres', marker), error => error.code === 'DESTINATION_UNSAFE')
  console.log('OK protección: nombre confirmado, archivo exclusivo, permisos privados, clave incorrecta, alteración, truncado y rechazo de destinos existentes.')
  const restored = await restoreDatabase(restoreOptions); generated.push(restored.database)
  assert.notEqual(restored.database, name)
  await assert.rejects(dropOwnedDatabase(admin, restored.database, '0'.repeat(48)), error => error.code === 'DESTINATION_UNSAFE')
  const targetUrl = new URL(source); targetUrl.pathname = '/' + restored.database
  target = new pg.Client({ connectionString: targetUrl.href }); await target.connect()
  assert.deepEqual(await contents(target), before)
  assert.deepEqual(await contents(raw), before, 'Origen intacto tras restaurar')
  const joined = (await target.query('SELECT i.numero,i."qrToken",e."filaId",r.id AS publicado FROM "Inscripcion" i JOIN "EntradaFila" f ON f."inscripcionId"=i.id JOIN "Evaluacion" e ON e."filaId"=f.id JOIN "ResultadoPublicado" r ON r."evaluacionId"=e.id')).rows[0]
  assert.equal(joined.numero, 7); assert.equal(joined.qrToken, registration.qrToken); assert.equal(joined.filaId, queue.id)
  assert.equal((await target.query('INSERT INTO public."EnsayoSecuencia" (value) VALUES ($1) RETURNING id', ['ficticio restaurado'])).rows[0].id, '3')
  await assert.rejects(target.query('INSERT INTO "Inscripcion" SELECT * FROM "Inscripcion"'), error => error.code === '23505')
  assert.equal((await target.query('SELECT estado FROM "OrdenCorreo"')).rows[0].estado, 'BLOQUEADO')
  console.log(`OK restauración PostgreSQL ${restored.serverMajor}: ${restored.tables} tablas idénticas, relaciones, índices únicos, secuencia, historial, número y QR conservados; origen sin cambios y sin procesos de envío.`)
  // Restore-tool failure must remove only the newly created, marked destination.
  const badBin = join(work, 'bad-bin'); await mkdir(badBin, { mode: 0o700 })
  const realRestore = resolveTool('pg_restore')
  const wrapper = '#!' + process.execPath + '\n' + `const {spawnSync}=require('node:child_process');const a=process.argv.slice(2);if(a.includes('--list')||a.includes('--version'))process.exit(spawnSync(${JSON.stringify(realRestore)},a,{env:process.env,stdio:'inherit'}).status);process.exit(19);\n`
  await writeFile(join(badBin, 'pg_restore'), wrapper, { mode: 0o700 })
  const beforeFailure = await temporaryNames()
  await assert.rejects(restoreDatabase({ ...restoreOptions, binDirectory: badBin }), error => error.code === 'PG_TOOL_FAILED')
  assert.deepEqual(await temporaryNames(), beforeFailure)
  assert.deepEqual(await contents(raw), before)
  console.log('OK fallo de restauración: destino nuevo descartado con marca verificada; ninguna otra base ni el origen se modificaron.')
} finally {
  await target?.end(); await db?.$disconnect(); await raw?.end()
  for (const database of generated) {
    const row = (await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1", [database])).rows[0]
    assert(row?.marker?.startsWith('casku-restore-v1:'))
    await dropOwnedDatabase(admin, database, row.marker.slice('casku-restore-v1:'.length))
  }
  if (created) {
    const row = (await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1", [name])).rows[0]
    assert.equal(row.marker, 'casku-backup-test:' + marker)
    await admin.query(`DROP DATABASE "${name}"`)
  }
  await admin.end(); await rm(work, { recursive: true, force: true })
}
function resolveTool(name) {
  if (binDirectory) return join(binDirectory, name)
  const result = spawnSync('which', [name], { encoding: 'utf8' }); assert.equal(result.status, 0); return result.stdout.trim()
}
