import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { backupDatabase, restoreDatabase, BackupError } from './lib/database-backup.mjs'

const controller = new AbortController()
const interrupt = () => controller.abort()
process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt)
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { database: { type: 'string' }, out: { type: 'string' }, file: { type: 'string' }, help: { type: 'boolean' } } })
  const operation = positionals[0]
  if (values.help) {
    console.log('db:backup -- --database NOMBRE --out /directorio-privado/copia.casku-backup\ndb:restore -- --database BASE_ADMINISTRATIVA --file /directorio-privado/copia.casku-backup\nConexiones explícitas: CASKU_BACKUP_DATABASE_URL o CASKU_RESTORE_ADMIN_URL. Clave: CASKU_BACKUP_PASSPHRASE. Herramientas opcionales: CASKU_PG_BIN.\nNo se carga .env ni se usa DATABASE_URL. Restaurar siempre crea otra base; no acepta un destino existente.')
  } else {
    if (!values.database || positionals.length !== 1 || !['backup', 'restore'].includes(operation)) throw new BackupError('ARGUMENTS', 'Indica la operación y confirma el nombre de la base con --database. Usa --help para ver el procedimiento.')
    const options = { passphrase: process.env.CASKU_BACKUP_PASSPHRASE, binDirectory: process.env.CASKU_PG_BIN, signal: controller.signal }
    if (operation === 'backup') {
      if (!values.out || values.file) throw new BackupError('ARGUMENTS', 'Indica únicamente --out para generar el respaldo.')
      const result = await backupDatabase({ ...options, connectionString: process.env.CASKU_BACKUP_DATABASE_URL, expectedDatabase: values.database, outputFile: resolve(values.out) })
      console.log(`Respaldo cifrado generado. Valida su recuperación en una base de prueba. Tablas: ${result.tables}. PostgreSQL: ${result.serverMajor}.\nArchivo: ${result.file}\nSHA-256: ${result.sha256}`)
    } else {
      if (!values.file || values.out) throw new BackupError('ARGUMENTS', 'Indica únicamente --file para restaurar en una base nueva.')
      const result = await restoreDatabase({ ...options, adminConnectionString: process.env.CASKU_RESTORE_ADMIN_URL, expectedAdminDatabase: values.database, inputFile: resolve(values.file) })
      console.log(`Restauración verificada en una base nueva: ${result.database}\nTablas: ${result.tables}. PostgreSQL: ${result.serverMajor}.\nSHA-256: ${result.sha256}\nLa aplicación y los envíos no se activaron. Mantén el destino aislado hasta completar el procedimiento de recuperación.`)
    }
  }
} catch (error) {
  console.error(error instanceof BackupError ? `${error.code}: ${error.message}` : 'No se completó la operación. No publiques errores de conexión, claves ni contenido del respaldo; revisa la guía de restauración.')
  process.exitCode = 1
} finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt) }
