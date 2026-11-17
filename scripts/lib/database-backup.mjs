import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify, isDeepStrictEqual } from 'node:util'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, link, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, unlink, writeFile, realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import pg from 'pg'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MAGIC = Buffer.from('CASKU-BACKUP-1\n'), HEADER = MAGIC.length + 16 + 12, MAX_META = 1024 * 1024
const scrypt = promisify(scryptCallback)
export class BackupError extends Error {
  constructor(code, message) { super(message); this.name = 'BackupError'; this.code = code }
}
const need = (value, code, message) => { if (!value) throw new BackupError(code, message) }
const quoted = value => '"' + value.replaceAll('"', '""') + '"'
export function parseDatabase(value, expected) {
  let url
  try { url = new URL(value) } catch { throw new BackupError('DATABASE_REQUIRED', 'Configura una conexión explícita para esta operación.') }
  need(['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname && url.username && !url.hash, 'DATABASE_INVALID', 'La conexión PostgreSQL no es válida.')
  const name = decodeURIComponent(url.pathname.slice(1))
  need(name && !name.includes('/') && expected === name, 'DATABASE_MISMATCH', 'El nombre de la base no coincide con el confirmado.')
  need([...url.searchParams.keys()].every(key => ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'channel_binding', 'connect_timeout', 'application_name'].includes(key)), 'DATABASE_OPTIONS', 'La conexión contiene opciones no admitidas por este procedimiento.')
  return url
}
async function keyFor(passphrase, salt) {
  need(typeof passphrase === 'string' && passphrase.length >= 32 && passphrase.length <= 1024, 'PASSPHRASE_REQUIRED', 'Usa una clave de respaldo de entre 32 y 1024 caracteres, separada de las claves del sistema.')
  return scrypt(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}
async function privateWork() { const dir = await mkdtemp(join(tmpdir(), 'casku-backup-')); await chmod(dir, 0o700); return dir }
async function fileHash(path) { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex') }
async function privateFile(path) { const file = await open(path, 'wx', 0o600); await file.close() }
async function clientFor(url) {
  const client = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 15000, query_timeout: 30000, application_name: 'casku-backup' })
  try { await client.connect(); return client } catch { await client.end().catch(() => {}); throw new BackupError('DATABASE_UNAVAILABLE', 'No se pudo conectar a la base explícitamente configurada.') }
}
async function version(client) { return Math.floor(Number((await client.query('SHOW server_version_num')).rows[0].server_version_num) / 10000) }
const passEscape = value => value.replaceAll('\\', '\\\\').replaceAll(':', '\\:')
async function toolEnv(url, work, readOnly) {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || tmpdir(), LC_ALL: 'C', PGCONNECT_TIMEOUT: '15' }
  if (url) {
    const password = decodeURIComponent(url.password)
    const passfile = join(work, 'pgpass')
    await rm(passfile, { force: true })
    const fields = [url.hostname.replace(/^\[|\]$/g, ''), url.port || '5432', decodeURIComponent(url.pathname.slice(1)), decodeURIComponent(url.username), password]
    need(fields.every(value => !/[\r\n]/.test(value)), 'DATABASE_INVALID', 'La conexión contiene caracteres no válidos.')
    await writeFile(passfile, fields.map(passEscape).join(':') + '\n', { mode: 0o600, flag: 'wx' })
    env.PGPASSFILE = passfile
    env.PGDATABASE = decodeURIComponent(url.pathname.slice(1))
    env.PGHOST = url.hostname.replace(/^\[|\]$/g, '')
    env.PGPORT = url.port || '5432'
    env.PGUSER = decodeURIComponent(url.username)
    env.PGOPTIONS = readOnly ? '-c default_transaction_read_only=on -c statement_timeout=600000' : '-c statement_timeout=600000'
  }
  return env
}
async function tool(name, args, { url, work, binDirectory, signal, readOnly = false } = {}) {
  signal?.throwIfAborted()
  const executable = binDirectory ? join(binDirectory, name) : name
  const env = await toolEnv(url, work, readOnly)
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'], signal })
    let output = '', spawnError
    const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60 * 1000)
    child.on('error', error => { spawnError = error })
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 4 * 1024 * 1024) child.kill('SIGTERM') })
    // PostgreSQL diagnostics may contain copied data or connection details: never relay them.
    child.stderr.resume()
    child.on('close', code => {
      clearTimeout(timer)
      if (spawnError || code !== 0 || output.length > 4 * 1024 * 1024) reject(new BackupError('PG_TOOL_FAILED', `No se completó ${name}; revisa herramientas, permisos y conectividad sin publicar datos del respaldo.`))
      else resolvePromise(output)
    })
  })
}
async function toolVersion(name, options) {
  const output = await tool(name, ['--version'], options), match = output.match(/PostgreSQL\)?\s+(\d+)\./)
  need(match, 'TOOL_VERSION', 'No se reconoció la versión de las herramientas PostgreSQL.')
  return Number(match[1])
}
export async function localMigrations() {
  const dir = join(root, 'prisma/migrations'), result = []
  for (const name of (await readdir(dir)).filter(name => /^\d/.test(name)).sort()) {
    result.push({ name, checksum: createHash('sha256').update(await readFile(join(dir, name, 'migration.sql'))).digest('hex') })
  }
  return result
}
async function migrationState(client) {
  need((await client.query("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present")).rows[0].present, 'MIGRATIONS_REQUIRED', 'La base debe tener historial de migraciones Prisma.')
  const rows = (await client.query('SELECT migration_name AS name,checksum,finished_at,rolled_back_at FROM public._prisma_migrations ORDER BY migration_name')).rows
  need(rows.every(row => row.finished_at || row.rolled_back_at), 'MIGRATION_PENDING', 'Hay una migración sin terminar; no se generará ni validará esta copia.')
  const applied = rows.filter(row => row.finished_at && !row.rolled_back_at).map(row => ({ name: row.name, checksum: row.checksum }))
  need(isDeepStrictEqual(applied, await localMigrations()), 'MIGRATIONS_MISMATCH', 'Las migraciones no coinciden con esta versión del código.')
  return applied
}
async function sequences(client) {
  const result = []
  const names = (await client.query("SELECT schemaname,sequencename FROM pg_sequences WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema' ORDER BY schemaname COLLATE \"C\",sequencename COLLATE \"C\"")).rows
  for (const row of names) {
    const state = (await client.query(`SELECT last_value::text,is_called FROM ${quoted(row.schemaname)}.${quoted(row.sequencename)}`)).rows[0]
    result.push({ schema: row.schemaname, name: row.sequencename, ...state })
  }
  return result
}
export async function inventory(client) {
  const tables = []
  const names = (await client.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema' ORDER BY schemaname COLLATE \"C\",tablename COLLATE \"C\"")).rows
  for (const row of names) {
    const hash = createHash('sha256'); let count = 0n
    await client.query(`DECLARE casku_backup_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS value FROM ${quoted(row.schemaname)}.${quoted(row.tablename)} t ORDER BY to_jsonb(t)::text COLLATE "C"`)
    try {
      for (;;) {
        const batch = (await client.query('FETCH 500 FROM casku_backup_rows')).rows
        if (!batch.length) break
        for (const item of batch) { hash.update(Buffer.byteLength(item.value) + ':').update(item.value); count++ }
      }
    } finally { await client.query('CLOSE casku_backup_rows') }
    tables.push({ schema: row.schemaname, name: row.tablename, count: String(count), sha256: hash.digest('hex') })
  }
  return { tables, sequences: await sequences(client), migrations: await migrationState(client) }
}
async function readInventory(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try { await client.query("SET LOCAL TIME ZONE 'UTC'"); return await inventory(client) } finally { await client.query('ROLLBACK') }
}
async function outputLocation(outputFile) {
  const path = resolve(outputFile)
  need(path.endsWith('.casku-backup'), 'OUTPUT_INVALID', 'El archivo debe terminar en .casku-backup.')
  need(!path.startsWith(root + sep) || path.startsWith(join(root, 'backups') + sep), 'OUTPUT_PRIVATE', 'Dentro del proyecto, guarda respaldos únicamente en backups/.')
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const actualRoot = await realpath(root), actualPath = join(await realpath(dirname(path)), basename(path))
  need(!actualPath.startsWith(actualRoot + sep) || actualPath.startsWith(join(actualRoot, 'backups') + sep), 'OUTPUT_PRIVATE', 'El destino real no puede quedar en una carpeta pública o versionada del proyecto.')
  const parent = await lstat(dirname(path))
  need(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o077) === 0, 'OUTPUT_PRIVATE', 'El directorio de respaldo debe ser privado, con permisos 0700.')
  try { await lstat(path); throw new BackupError('OUTPUT_EXISTS', 'El archivo de destino ya existe; no se sobrescribe.') } catch (error) { if (error.code !== 'ENOENT') throw error }
  return path
}
async function encrypt(dump, destination, metadata, passphrase, signal) {
  const salt = randomBytes(16), iv = randomBytes(12), header = Buffer.concat([MAGIC, salt, iv])
  const cipher = createCipheriv('aes-256-gcm', await keyFor(passphrase, salt), iv); cipher.setAAD(header)
  await privateFile(destination)
  await writeFile(destination, header)
  async function* input() { yield Buffer.from(JSON.stringify(metadata) + '\n'); yield* createReadStream(dump) }
  await pipeline(input(), cipher, createWriteStream(destination, { flags: 'a' }), { signal })
  const file = await open(destination, 'a')
  try { await file.write(cipher.getAuthTag()); await file.sync() } finally { await file.close() }
}
async function decrypt(source, work, passphrase, signal) {
  const file = await open(source, 'r'), header = Buffer.alloc(HEADER), tag = Buffer.alloc(16)
  let size
  try {
    size = (await file.stat()).size
    need(size > HEADER + 16, 'ARCHIVE_INVALID', 'El respaldo está incompleto.')
    await file.read(header, 0, HEADER, 0); await file.read(tag, 0, 16, size - 16)
  } finally { await file.close() }
  need(header.subarray(0, MAGIC.length).equals(MAGIC), 'ARCHIVE_INVALID', 'Formato de respaldo no reconocido.')
  const decipher = createDecipheriv('aes-256-gcm', await keyFor(passphrase, header.subarray(MAGIC.length, MAGIC.length + 16)), header.subarray(-12))
  decipher.setAAD(header); decipher.setAuthTag(tag)
  const payload = join(work, 'payload'); await privateFile(payload)
  try { await pipeline(createReadStream(source, { start: HEADER, end: size - 17 }), decipher, createWriteStream(payload, { flags: 'w' }), { signal }) }
  catch { throw new BackupError('ARCHIVE_AUTH', 'La clave no corresponde o el respaldo fue alterado; no se creó una base de destino.') }
  const prefix = Buffer.alloc(MAX_META), handle = await open(payload, 'r')
  let bytesRead
  try { ({ bytesRead } = await handle.read(prefix, 0, MAX_META, 0)) } finally { await handle.close() }
  const end = prefix.subarray(0, bytesRead).indexOf(10)
  need(end > 0, 'ARCHIVE_INVALID', 'No se pudo leer el manifiesto del respaldo.')
  let metadata
  try { metadata = JSON.parse(prefix.subarray(0, end).toString()) } catch { throw new BackupError('ARCHIVE_INVALID', 'Manifiesto inválido.') }
  need(metadata.format === 1 && Number.isInteger(metadata.serverMajor) && metadata.inventory?.tables?.length && /^[a-f0-9]{64}$/.test(metadata.dumpSha256), 'ARCHIVE_INVALID', 'El manifiesto no contiene una copia verificable.')
  const dump = join(work, 'database.dump'); await privateFile(dump)
  await pipeline(createReadStream(payload, { start: end + 1 }), createWriteStream(dump, { flags: 'w' }), { signal }); await unlink(payload)
  need(await fileHash(dump) === metadata.dumpSha256, 'ARCHIVE_INVALID', 'El contenido no coincide con el manifiesto.')
  need(isDeepStrictEqual(metadata.inventory.migrations, await localMigrations()), 'MIGRATIONS_MISMATCH', 'Usa la versión de código que corresponde al respaldo.')
  return { metadata, dump }
}
export async function backupDatabase({ connectionString, expectedDatabase, passphrase, outputFile, binDirectory, signal }) {
  signal?.throwIfAborted()
  const url = parseDatabase(connectionString, expectedDatabase)
  // Validate the key before connecting or producing any copy.
  const salt = randomBytes(16), key = await keyFor(passphrase, salt); key.fill(0)
  const path = await outputLocation(outputFile), work = await privateWork()
  let client, pending
  try {
    client = await clientFor(url)
    need((await client.query('SELECT current_database() AS name')).rows[0].name === expectedDatabase, 'DATABASE_MISMATCH', 'La base conectada no coincide con la confirmada.')
    const serverMajor = await version(client), options = { url, work, binDirectory, signal, readOnly: true }
    need(await toolVersion('pg_dump', options) === serverMajor, 'TOOL_VERSION', 'pg_dump y el servidor deben tener la misma versión mayor.')
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL TIME ZONE 'UTC'")
    const snapshot = (await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot
    const contents = await inventory(client), dump = join(work, 'database.dump'); await privateFile(dump)
    await tool('pg_dump', ['--dbname=' + (() => { const safe = new URL(url.href); safe.password = ''; return safe.href })(), '--format=custom', '--no-owner', '--no-acl', '--no-password', `--snapshot=${snapshot}`, `--file=${dump}`], options)
    need(isDeepStrictEqual(contents.sequences, await sequences(client)), 'SOURCE_CHANGED', 'Cambiaron las secuencias durante el respaldo. Detén las escrituras y repite.')
    await client.query('ROLLBACK'); await client.end(); client = undefined
    const metadata = { format: 1, createdAt: new Date().toISOString(), serverMajor, inventory: contents, dumpSha256: await fileHash(dump) }
    need(Buffer.byteLength(JSON.stringify(metadata)) < MAX_META - 1, 'ARCHIVE_INVALID', 'El manifiesto supera el tamaño admitido.')
    pending = path + '.' + randomBytes(8).toString('hex') + '.partial'
    await encrypt(dump, pending, metadata, passphrase, signal)
    await link(pending, path); await unlink(pending); pending = undefined
    return { file: path, sha256: await fileHash(path), tables: contents.tables.length, serverMajor }
  } finally { await client?.end().catch(() => {}); if (pending) await rm(pending, { force: true }); await rm(work, { recursive: true, force: true }) }
}
export async function dropOwnedDatabase(admin, name, marker) {
  need(/^casku_restore_[a-f0-9]{24}$/.test(name) && /^[a-f0-9]{48}$/.test(marker), 'DESTINATION_UNSAFE', 'No se permite eliminar esta base.')
  const row = (await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1", [name])).rows[0]
  need(row?.marker === 'casku-restore-v1:' + marker, 'DESTINATION_UNSAFE', 'La marca del destino cambió; no se eliminará.')
  await admin.query(`DROP DATABASE ${quoted(name)}`)
}
export async function restoreDatabase({ adminConnectionString, expectedAdminDatabase, passphrase, inputFile, binDirectory, signal }) {
  signal?.throwIfAborted()
  const url = parseDatabase(adminConnectionString, expectedAdminDatabase), work = await privateWork()
  let admin, target, name, marker, created = false, complete = false
  try {
    const { metadata, dump } = await decrypt(inputFile, work, passphrase, signal)
    need(await toolVersion('pg_restore', { work, binDirectory, signal }) === metadata.serverMajor, 'TOOL_VERSION', 'pg_restore debe coincidir con la versión mayor del respaldo.')
    await tool('pg_restore', ['--list', dump], { work, binDirectory, signal })
    admin = await clientFor(url)
    need(await version(admin) === metadata.serverMajor, 'TOOL_VERSION', 'El destino debe usar la misma versión mayor de PostgreSQL que el ensayo del respaldo.')
    need((await admin.query('SELECT current_database() AS name')).rows[0].name === expectedAdminDatabase, 'DATABASE_MISMATCH', 'La conexión administrativa no coincide con la confirmada.')
    signal?.throwIfAborted()
    name = 'casku_restore_' + randomBytes(12).toString('hex'); marker = randomBytes(24).toString('hex')
    await admin.query(`CREATE DATABASE ${quoted(name)} TEMPLATE template0`); created = true
    await admin.query(`COMMENT ON DATABASE ${quoted(name)} IS 'casku-restore-v1:${marker}'`)
    const destination = new URL(url.href); destination.pathname = '/' + name
    target = await clientFor(destination)
    need((await target.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema'")).rows[0].n === 0, 'DESTINATION_UNSAFE', 'El destino no está vacío.')
    const identity = (await target.query("SELECT current_database() AS name,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0]
    need(identity.name === name && identity.marker === 'casku-restore-v1:' + marker, 'DESTINATION_UNSAFE', 'La conexión no apunta al destino nuevo marcado por esta operación.')
    await tool('pg_restore', ['--single-transaction', '--exit-on-error', '--no-owner', '--no-acl', '--no-password', '--dbname=' + (() => { const safe = new URL(destination.href); safe.password = ''; return safe.href })(), dump], { url: destination, work, binDirectory, signal })
    const restored = await readInventory(target)
    need(isDeepStrictEqual(restored, metadata.inventory), 'RESTORE_MISMATCH', 'La restauración no conserva exactamente los registros, las secuencias y las migraciones.')
    await target.query('ANALYZE')
    complete = true
    return { database: name, tables: restored.tables.length, serverMajor: metadata.serverMajor, sha256: await fileHash(inputFile) }
  } finally {
    await target?.end().catch(() => {})
    try { if (created && !complete) await dropOwnedDatabase(admin, name, marker) }
    finally { await admin?.end().catch(() => {}); await rm(work, { recursive: true, force: true }) }
  }
}
