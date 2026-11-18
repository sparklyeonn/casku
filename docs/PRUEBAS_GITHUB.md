# Comprobaciones automáticas en GitHub

El flujo **Casku CI**, definido en `.github/workflows/ci.yml`, se ejecuta en cada `push`, al abrir, actualizar o reabrir un pull request y manualmente desde Actions. No limita las ramas ni omite cambios de documentación. Una nueva ejecución en la misma referencia cancela la anterior que siga en curso.

## Qué comprueba

El trabajo **Código, pruebas y compilación** utiliza Ubuntu 24.04 y la versión de Node de `.nvmrc`. Instala con `npm ci`, genera Prisma, instala Chromium y WebKit con sus dependencias de Ubuntu y ejecuta `npm run check`: ESLint, pruebas unitarias, infraestructura y administración de correos, Brevo simulado, recuperación, eventos, autenticación y sesiones entre servidores, permisos HTTP, flujos familiares de desarrollo y producción, compilación de Next.js y comprobación final de TypeScript.

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

Las pruebas ampliadas de dispositivos y PostgreSQL real conservan sus comandos específicos (`test:families:devices`, `test:team:devices`, `test:mail-admin:devices`, `test:postgres`). El recorrido normal de recuperación ahora abre navegadores en cinco perfiles; por eso CI instala explícitamente Chromium y WebKit mediante `npx --no-install playwright install --with-deps chromium webkit`. Se utiliza la CLI de la versión fijada por el archivo de bloqueo. CI no se conecta a un servicio PostgreSQL externo ni sustituye la aceptación física en los equipos del evento o las pruebas de correos reales autorizadas.

## Validación de esta entrega — 17 de noviembre de 2026

El archivo pasó `actionlint` 1.7.12. Se exportó una copia limpia del código versionado, sin archivos privados ni dependencias instaladas, y se ejecutaron los pasos del workflow con sus variables ficticias: guardas de aislamiento, instalación con `npm ci`, generación de Prisma y `npm run check` completo. Las 53 pruebas unitarias, las baterías de integración, la compilación de producción y TypeScript terminaron correctamente. También se comprobó que las guardas rechazan un archivo `.env.local`, el envío habilitado o una conexión externa.

Esta reproducción se realizó localmente en macOS con Node 22.14.0; no equivale a una ejecución en el runner Ubuntu de GitHub. La primera ejecución remota queda pendiente de subir el workflow.

Referencia de configuración: [sintaxis oficial de GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

## Diagnóstico de las siete ejecuciones fallidas — 18 de noviembre de 2026

Se intentaron descargar los logs del primer y último trabajo. GitHub devolvió `BlobNotFound`: las consultas de trabajos y anotaciones mostraron que no se asignó un runner (`runner_id=0`) y no se ejecutó ningún paso (`steps=[]`). Se consultaron después las siete ejecuciones; todas contienen la misma anotación:

> The job was not started because your account is locked due to a billing issue.

| Ejecución | Commit | Pasos ejecutados |
| --- | --- | --- |
| [44126919550](https://github.com/sparklyeonn/casku/actions/runs/44126919550) | bcd2263 | 0 |
| [44132481068](https://github.com/sparklyeonn/casku/actions/runs/44132481068) | 61e54d5 | 0 |
| [44135762493](https://github.com/sparklyeonn/casku/actions/runs/44135762493) | a03657a | 0 |
| [44321324163](https://github.com/sparklyeonn/casku/actions/runs/44321324163) | e3af193 | 0 |
| [44322815077](https://github.com/sparklyeonn/casku/actions/runs/44322815077) | 1df15ee | 0 |
| [44325577948](https://github.com/sparklyeonn/casku/actions/runs/44325577948) | 0787031 | 0 |
| [44329585157](https://github.com/sparklyeonn/casku/actions/runs/44329585157) | 3337344 | 0 |

La causa comprobada de esas siete X rojas es el bloqueo de la cuenta en GitHub. No hay logs de `npm ci`, Prisma, pruebas o compilación en esas ejecuciones porque no llegaron a iniciarse. No se cambian permisos, facturación ni configuraciones de producción para sortearlo. La persona titular debe revisar **Settings → Billing and licensing**; si no hay un saldo o problema visible, GitHub indica pedir una revisión a soporte. El mensaje no permite deducir por sí solo qué originó el bloqueo, ni implica que deba contratarse un plan.

### Correcciones adicionales del repositorio

- Se reprodujo la ausencia de ejecutables de Chromium y WebKit con el Playwright recién instalado y un directorio vacío de navegadores. `npm ci` instala las bibliotecas, pero no esos ejecutables. El workflow incorpora la instalación oficial con dependencias de Linux; no elimina las pruebas de navegador.
- La guarda de aislamiento comprueba también `CALENDLY_ENABLED=0` y `CALENDLY_API_TOKEN` vacío, además de los controles existentes de base y correo.
- Una primera ejecución completa en una copia limpia detectó `25P02` al retirar el trigger de fallo deliberado en `test:brevo`. El ensayo mezclaba conexiones que pasan por `protocolGate` con `PGlite.exec()` directo sobre el mismo backend. La preparación y retirada de ese trigger ahora utilizan una conexión de control que pasa por el gate y respeta el cierre de la transacción. Se conserva el trigger, el fallo de escritura, los dos clientes, la aceptación única y todas las aserciones de revisión y privacidad. No cambia el adaptador de producción.

### Validación aislada

Se exportó el código versionado a una carpeta temporal sin `.env`, `.env.local` ni dependencias previas. Se usó Node 22.14.0, un entorno permitido explícitamente y las variables ficticias del workflow. `npm ci --no-audit --no-fund` instaló 548 paquetes; Prisma 7.10.1 se generó correctamente; la guarda de aislamiento pasó. Los dos identificadores fijados de las acciones oficiales existen. `actionlint` 1.7.12, descargado con su checksum oficial verificado, aprobó el workflow. La prueba focalizada de Brevo pasó tras el ajuste.

`npm run check` terminó con código 0 después de la corrección: lint, 63 pruebas unitarias, todas las suites de correo, Brevo, recuperación, gestión administrativa, eventos, seguridad, permisos HTTP, recorridos familiares completos de desarrollo y producción, navegadores de recuperación en cinco perfiles, compilación y TypeScript. No se omitieron comandos ni se añadieron reintentos automáticos o tolerancia a fallos.

La reproducción local es macOS arm64. La ejecución de Ubuntu 24.04 en GitHub debe verificarse después del desbloqueo de la cuenta; una prueba local aprobada no se presenta como una ejecución remota exitosa.

Referencias: [desbloqueo de cuenta en GitHub](https://docs.github.com/en/billing/how-tos/troubleshooting/locked-account), [Playwright en CI](https://playwright.dev/docs/ci) e [instalación de navegadores](https://playwright.dev/docs/browsers).
