import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { parseDatabase, backupDatabase, BackupError, dropOwnedDatabase } from '../scripts/lib/database-backup.mjs'

test('respaldo exige conexión explícita y nombre de base confirmado', () => {
  assert.throws(() => parseDatabase(undefined, 'test'), (error: unknown) => error instanceof BackupError && error.code === 'DATABASE_REQUIRED')
  assert.throws(() => parseDatabase('postgresql://user:secret@127.0.0.1:1/otra', 'test'), (error: unknown) => error instanceof BackupError && error.code === 'DATABASE_MISMATCH')
  assert.throws(() => parseDatabase('https://example.com/test', 'test'), BackupError)
  assert.throws(() => parseDatabase('postgresql://user:secret@127.0.0.1:1/test?dbname=otra', 'test'), BackupError)
  assert.equal(parseDatabase('postgresql://user:secret@127.0.0.1:1/test?sslmode=disable', 'test').pathname, '/test')
})
test('respaldo rechaza una clave insuficiente antes de conectar', async () => {
  await assert.rejects(backupDatabase({ connectionString: 'postgresql://test:test@127.0.0.1:1/test', expectedDatabase: 'test', passphrase: 'corta', outputFile: '/no-se-crea.casku-backup', binDirectory: undefined, signal: undefined }), (error: unknown) => error instanceof BackupError && error.code === 'PASSPHRASE_REQUIRED')
})
test('limpieza nunca acepta un nombre de base ajeno al destino generado', async () => {
  const fake = { query: async () => { throw new Error('No debe consultar ni eliminar bases') } }
  await assert.rejects(dropOwnedDatabase(fake, 'postgres', 'a'.repeat(48)), (error: unknown) => error instanceof BackupError && error.code === 'DESTINATION_UNSAFE')
})
test('CLI no usa DATABASE_URL como alternativa ni admite sobrescritura', () => {
  const env = { ...process.env, DATABASE_URL: 'postgresql://secreto-ficticio@127.0.0.1:1/produccion', CASKU_BACKUP_DATABASE_URL: '', CASKU_BACKUP_PASSPHRASE: '' }
  const result = spawnSync(process.execPath, ['scripts/respaldo-base.mjs', 'backup', '--database', 'produccion', '--out', '/no-se-crea.casku-backup'], { env, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert(result.stderr.includes('DATABASE_REQUIRED'))
  assert(!result.stderr.includes('secreto-ficticio'))
  const forbidden = spawnSync(process.execPath, ['scripts/respaldo-base.mjs', 'restore', '--clean'], { env, encoding: 'utf8' })
  assert.equal(forbidden.status, 1)
})
