# Respaldos y restauración de PostgreSQL

Estas herramientas preparan un respaldo lógico cifrado y lo recuperan en **otra base nueva**, comprobando su contenido. No cambian `DATABASE_URL`, no inician la aplicación ni procesadores de correo y nunca restauran sobre una base existente. No cargan `.env` ni toman conexiones de la configuración habitual de Casku.

## Requisitos y alcance

- Node indicado en `.nvmrc` y dependencias del proyecto instaladas.
- `pg_dump` y `pg_restore` oficiales en `PATH`, o su directorio en `CASKU_PG_BIN`. El procedimiento exige que servidor, herramientas y destino tengan la misma versión mayor. La compatibilidad entre versiones mayores queda fuera de este ensayo.
- Conexión directa a PostgreSQL, sin agrupador de conexiones por transacción, porque se comparte una instantánea entre conexiones.
- Permisos de lectura suficientes para todas las tablas y secuencias del origen. La cuenta administrativa de restauración necesita crear una base desde `template0`.
- Historial Prisma completo, sin migraciones pendientes y con nombres y checksums coincidentes con el código utilizado. Para una copia antigua se debe utilizar el commit de código que corresponda; no se aplican migraciones durante la restauración.
- Una clave aleatoria de respaldo de al menos 32 caracteres, custodiada separadamente. No se utiliza `AUTH_SECRET`, la clave de Brevo ni una contraseña del equipo como clave del respaldo.

El archivo contiene el esquema, tablas, datos, relaciones, índices y secuencias exportados por `pg_dump`. No incluye roles globales, propietarios, permisos originales del servidor, archivos de la aplicación, DNS ni secretos del entorno. Esos recursos deben conservarse por separado en los servicios y gestores de secretos aprobados.

## Controles incorporados

1. La conexión debe proporcionarse explícitamente y su nombre debe coincidir con `--database`. No hay alternativa automática a `DATABASE_URL`.
2. El respaldo usa una transacción de solo lectura y una instantánea compartida con `pg_dump`. Se registran huellas SHA-256 de todos los registros por tabla, estados de secuencias e historial de migraciones. Si las secuencias cambian durante la copia, se rechaza. Para una copia verificable, pausar escrituras y cambios de esquema en el procedimiento operativo.
3. El contenedor `.casku-backup` cifra datos y manifiesto con AES-256-GCM y deriva su clave con scrypt, sal e IV aleatorios. Se imprime una huella SHA-256 del archivo cifrado para su registro en un catálogo independiente.
4. El directorio de salida debe ser privado, con permisos 0700; el archivo tiene permisos 0600 y no reemplaza uno existente. Dentro del repositorio solo se permite `backups/`, excluido de Git. Nunca usar `public/`.
5. Antes de crear el destino se autentica y descifra la copia, se comprueba la huella del archivo interno, las migraciones, la versión y el índice de `pg_restore`.
6. Restaurar genera un nombre `casku_restore_` aleatorio y crea una base vacía. Se comprueban su identidad y marca antes de ejecutar `pg_restore --single-transaction`. No existen opciones `--clean`, sobrescritura o selección de una base ya existente.
7. Se comparan nuevamente todas las huellas, cantidades, secuencias y migraciones después de restaurar. Un fallo descarta exclusivamente la base nueva cuya marca coincide. Si la marca cambió o hay conexiones que impiden eliminarla, se detiene para revisión; no fuerza cierres de terceros.
8. Las contraseñas no se pasan como argumentos de PostgreSQL ni se imprimen. Las herramientas reciben un archivo temporal `pgpass` privado. Los diagnósticos de PostgreSQL no se vuelcan a la consola porque podrían contener datos de filas.

El archivo custom y el contenido descifrado existen temporalmente sin cifrar en un directorio 0700 con archivos 0600; se eliminan al terminar o al manejar un fallo. Usar un equipo con disco cifrado y no sincronizar sus temporales con servicios compartidos. Un apagado o terminación forzada puede dejar temporales que el responsable deberá eliminar de forma controlada. Solo se restauran respaldos propios y de origen confiable: un archivo PostgreSQL puede contener código ejecutable del esquema.

## Generar una copia — ejecución futura autorizada

Elegir una ventana sin escrituras y un destino de almacenamiento privado. Introducir las conexiones y la clave mediante el gestor de secretos o una lectura silenciosa en la terminal, evitando pegarlas como comandos que queden en el historial. Por ejemplo, en una terminal interactiva:

```sh
read -r -s CASKU_BACKUP_DATABASE_URL
export CASKU_BACKUP_DATABASE_URL
read -r -s CASKU_BACKUP_PASSPHRASE
export CASKU_BACKUP_PASSPHRASE
mkdir -m 700 backups
npm run db:backup -- --database NOMBRE_ORIGEN_CONFIRMADO --out backups/COPIA_UNICA.casku-backup
```

`mkdir` es necesario solo la primera vez. No reutilizar nombres de archivo. Registrar fecha, huella mostrada, versión mayor de PostgreSQL, commit de la aplicación y responsable. Copiar el contenedor cifrado al almacenamiento externo aprobado y comprobar allí su huella. Mantener la clave por separado y comprobar que el responsable de recuperación puede obtenerla.

La generación correcta de un archivo **no demuestra por sí sola que se pueda recuperar**; ejecutar periódicamente una restauración de prueba.

## Restaurar una copia aislada

Usar un servidor de recuperación aislado y una conexión administrativa explícita. No conectar la aplicación ni trabajadores al destino durante esta etapa. Mantener desactivados correos, automatización y webhooks.

```sh
read -r -s CASKU_RESTORE_ADMIN_URL
export CASKU_RESTORE_ADMIN_URL
read -r -s CASKU_BACKUP_PASSPHRASE
export CASKU_BACKUP_PASSPHRASE
npm run db:restore -- --database NOMBRE_BASE_ADMINISTRATIVA --file /RUTA_PRIVADA/COPIA_UNICA.casku-backup
```

`--database` confirma la base de mantenimiento de la conexión administrativa; **no es el destino de la copia**. La herramienta muestra al finalizar el nombre nuevo generado y conserva intacta la base de mantenimiento. Guardar el informe sin claves ni contenido clínico.

Comprobar después, con acceso autorizado y sin envíos: número y QR de una inscripción de muestra; relaciones bebé/apoderado/evento; evaluación y versiones; consentimientos e historial; contadores y secuencias. Registrar responsable, duración real y resultado del ensayo.

## Antes de una eventual puesta en servicio

La herramienta recupera una copia aislada; no decide ni ejecuta el cambio de producción. El responsable debe aprobar por separado:

- Plan de corte y pausa de escrituras, accesos al destino, permisos y versión de aplicación.
- Tratamiento de sesiones, códigos de acceso y recuperaciones copiadas, para que no se vuelvan válidos accesos antiguos.
- Revisión de correos y tareas pendientes: no volver a enviar automáticamente órdenes antiguas. La clave de cifrado de las colas y otros secretos del entorno se gestionan por separado, sin rotarlos a ciegas.
- Cambio controlado de conexión y prueba funcional con los envíos todavía detenidos; habilitación posterior solo de los servicios aprobados.
- Conservación del origen hasta aprobar el resultado. Si el destino ya recibió escrituras, no basta con volver a la conexión anterior: se debe evaluar cómo recuperar esos cambios.

Definir con Casku responsables, frecuencia, conservación, ubicación externa, alertas, pérdida máxima de datos aceptable (RPO) y tiempo de recuperación objetivo (RTO). Su configuración automática depende del proveedor elegido. Este respaldo lógico complementa los respaldos gestionados y la recuperación a un punto en el tiempo del proveedor; no los sustituye.

## Ensayo reproducible, sin datos reales

Preparar PostgreSQL **local y exclusivo de pruebas**, con herramientas de su misma versión mayor. La cuenta local necesita permiso para crear bases. Proporcionar únicamente `CASKU_BACKUP_TEST_ADMIN_URL`, apuntando a `postgres` en loopback; la prueba rechaza hosts externos y no lee `.env`.

```sh
read -r -s CASKU_BACKUP_TEST_ADMIN_URL
export CASKU_BACKUP_TEST_ADMIN_URL
npm run test:backup
```

La prueba crea un origen temporal marcado, aplica el esquema y un historial Prisma ficticio, y carga cuentas, familia, bebé, evento, inscripción, fila, evaluación, publicación/versiones, autorización/historial y órdenes de correo ficticias. Genera la copia cifrada y la recupera en otra base; comprueba datos, relaciones, restricciones únicas, secuencia, número/QR, integridad del origen y ausencia de procesos de envío. También prueba clave incorrecta, archivo alterado o truncado, sobrescritura rechazada y un fallo del restaurador. Al terminar elimina solo las bases y archivos creados por el ensayo, comprobando sus marcas.

Las guardas sin base se ejecutan automáticamente con `npm test` y forman parte del CI existente. El ensayo real `test:backup` es independiente: no se agrega un acceso PostgreSQL ni una contraseña real a GitHub Actions.

## Referencias

[pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html) y [respaldo lógico en PostgreSQL](https://www.postgresql.org/docs/current/backup-dump.html).

## Resultado del ensayo — 17 de noviembre de 2026

Ensayo completado en una instancia propia y temporal de PostgreSQL 18.6, accesible solo por loopback, con `pg_dump`/`pg_restore` 18.7. Se verificaron 40 tablas, incluidos sus registros y relaciones, historial de migraciones y autorizaciones, versión publicada, números/QR, restricciones únicas y secuencias. El origen conservó exactamente sus huellas después de recuperar la copia.

Pasaron los rechazos por nombre de origen diferente, migración desconocida, archivo ya existente, clave incorrecta, contenedor alterado o truncado y marca de destino incorrecta. Un fallo controlado del restaurador eliminó solamente la base nueva marcada por la operación. Las bases, el clúster y los archivos de datos ficticios se eliminaron al finalizar. No se leyó la configuración privada ni se inició la aplicación o un servicio de correo.

También pasaron ESLint, TypeScript y las 57 pruebas unitarias (incluidas las cuatro guardas nuevas de respaldo). No se realizaron respaldos de producción, subidas a almacenamiento externo, programación automática ni cambios de conexión del sistema.
