# Comprobaciones automáticas en GitHub

El flujo **Casku CI**, definido en `.github/workflows/ci.yml`, se ejecuta en cada `push`, al abrir, actualizar o reabrir un pull request y manualmente desde Actions. No limita las ramas ni omite cambios de documentación. Una nueva ejecución en la misma referencia cancela la anterior que siga en curso.

## Qué comprueba

El trabajo **Código, pruebas y compilación** utiliza Ubuntu 24.04 y la versión de Node de `.nvmrc`. Instala con `npm ci`, genera Prisma y ejecuta `npm run check`: ESLint, pruebas unitarias, infraestructura y administración de correos, Brevo simulado, recuperación, eventos, autenticación y sesiones entre servidores, permisos HTTP, flujos familiares de desarrollo y producción, compilación de Next.js y comprobación final de TypeScript.

Las suites se ejecutan en serie porque comparten puertos y directorios de compilación. La compilación de producción usa `.next-production-tests`; no despliega ni publica la aplicación. Las acciones de GitHub están fijadas a identificadores de commit para que su contenido no cambie al moverse una etiqueta de versión. El trabajo tiene un límite de 45 minutos.

## Aislamiento

- No solicita ni referencia secretos de GitHub, credenciales de Casku ni entornos de despliegue. El token de GitHub tiene únicamente lectura del repositorio y no se conserva en la configuración de Git.
- Antes de instalar, rechaza archivos `.env` y `.env.*`, salvo la plantilla `.env.example`.
- La conexión base apunta a un puerto local inutilizable. Las suites usan sus propias bases PostgreSQL temporales con PGlite; no leen ni migran la base de Casku.
- Los interruptores de correo, automatización y webhooks comienzan desactivados y la clave de Brevo está vacía. Las suites de correo habilitan exclusivamente sus simulaciones con clave ficticia y servidor local. Las pruebas de producción interceptan el transporte y bloquean solicitudes externas mediante `tests/production-mail-preload.mjs`.
- No se ejecutan `db:deploy`, tareas oficiales de envío, creación de cuentas reales ni despliegues. Solo se reutiliza la caché de descargas de npm; no se guardan bases, configuración privada ni compilaciones como artefactos.

No hay que agregar `DATABASE_URL`, `AUTH_SECRET` ni `BREVO_API_KEY` a los secretos de Actions para este flujo.

## Cómo usarlo

Subir el commit con el workflow y abrir **GitHub → Actions → Casku CI**. Cada paso conserva su salida y un error deja la ejecución en rojo. La ejecución manual aparece cuando el archivo está en la rama predeterminada y Actions está habilitado.

El archivo preparado localmente empieza a operar en GitHub cuando se sube al repositorio. La primera ejecución remota debe revisarse allí; una validación local no equivale a una ejecución aprobada en GitHub.

Si se desea impedir fusiones con comprobaciones fallidas, configurar una regla de protección para exigir **Código, pruebas y compilación** después de su primera ejecución. El workflow por sí solo no cambia esas reglas.

## Alcance separado

Las pruebas de navegador y PostgreSQL real conservan sus comandos específicos (`test:families:devices`, `test:team:devices`, `test:mail-admin:devices`, `test:postgres`). Este flujo automático no instala navegadores ni se conecta a un servicio PostgreSQL externo. Tampoco sustituye la aceptación física en los equipos del evento o las pruebas de correos reales autorizadas.

## Validación de esta entrega — 17 de noviembre de 2026

El archivo pasó `actionlint` 1.7.12. Se exportó una copia limpia del código versionado, sin archivos privados ni dependencias instaladas, y se ejecutaron los pasos del workflow con sus variables ficticias: guardas de aislamiento, instalación con `npm ci`, generación de Prisma y `npm run check` completo. Las 53 pruebas unitarias, las baterías de integración, la compilación de producción y TypeScript terminaron correctamente. También se comprobó que las guardas rechazan un archivo `.env.local`, el envío habilitado o una conexión externa.

Esta reproducción se realizó localmente en macOS con Node 22.14.0; no equivale a una ejecución en el runner Ubuntu de GitHub. La primera ejecución remota queda pendiente de subir el workflow.

Referencia de configuración: [sintaxis oficial de GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).
