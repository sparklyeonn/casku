# Recepción, turnos y concurrencia con PostgreSQL real

## Repetir la validación

Usar Node 22 (`nvm use`), instalar dependencias con `npm ci` y los navegadores de prueba con `npx playwright install chromium webkit`. Después ejecutar:

```sh
npm run test:postgres
```

El comando genera Prisma, compila la versión de producción y ejecuta el recorrido HTTP completo, las carreras entre dos servidores compilados y las pruebas de navegador. `npm run test:postgres -- --skip-build` reutiliza `.next-production-tests/BUILD_ID`; usarlo solo si no ha cambiado la aplicación desde esa compilación. `CASKU_REAL_TEST_PORT` permite elegir otro puerto inicial; la segunda instancia usa el siguiente. Por defecto se necesitan los puertos locales 3120/3121 y otro puerto temporal de correo. No ejecutar simultáneamente otra batería que utilice los mismos puertos o escriba la misma carpeta de compilación.

La conexión administrativa se toma de `CASKU_TEST_POSTGRES_ADMIN_URL` o, en su ausencia, de `DATABASE_URL` en `.env.local`/`.env`. Requiere permiso para crear bases; se recomienda una rama o instancia PostgreSQL dedicada a pruebas. La cuenta y la URL no se registran en la salida. El recorrido completo puede demorar decenas de minutos según la latencia de la base remota; cada proceso de prueba tiene un límite de 90 minutos y se puede interrumpir de forma controlada.

Para repetir únicamente las comprobaciones nuevas después de diagnosticar un fallo, usar `npm run test:postgres -- --skip-build --queue-only`. Este modo también crea y limpia otra base, pero no sustituye el recorrido integral.

No se añade a `npm run check`, que conserva sus pruebas locales sin necesitar credenciales ni conexión a una base remota.

Para una comprobación de navegador local más rápida, `npm run test:devices` compila la aplicación y ejecuta recursos, permisos, el recorrido HTTP completo y los mismos cuatro perfiles con PGlite y correos ficticios. No necesita PostgreSQL remoto y no demuestra concurrencia PostgreSQL: complementa `test:postgres`. `npm run test:devices -- --skip-build` solo se usa si la compilación sigue vigente.

## Aislamiento y limpieza

El orquestador crea una base con nombre aleatorio y una marca aleatoria en su comentario compartido. La batería valida nombre, marca, base actual y ausencia de tablas antes de aplicar las migraciones. No aplica migraciones ni introduce fixtures en la base de origen. La aplicación de prueba conecta exclusivamente a la base nueva; no se modifican las fórmulas clínicas ni los límites del sistema para estas pruebas.

Se comprueban cuatro backends PostgreSQL independientes; no se utiliza el multiplexor serial de PGlite. Dos procesos `next start` trabajan con la misma base de prueba. Para comprobar contención se mantiene temporalmente bloqueado un evento, se lanzan peticiones desde ambas instancias y se observa que existen al menos dos solicitudes esperando bloqueos en PostgreSQL antes de liberarlo. Esto distingue concurrencia real de peticiones que por casualidad se ejecutan una después de otra.

Al terminar, incluso si una aserción falla, se cierran servidores y conexiones y se elimina exclusivamente la base creada en esa ejecución, tras verificar su marca. Si la limpieza falla, el comando termina con error y muestra el nombre de la base temporal para revisión. Un cierre forzado del equipo o del proceso puede requerir esa limpieza manual; nunca borrar otra base por similitud de nombre.

Todos los nombres, cuentas, bebés, autorizaciones y resultados son ficticios. Los procesos compilados usan el transporte de correo local interceptado expresamente mediante `production-mail-preload.mjs`, una clave ficticia y `CASKU_MAIL_AUTOMATION=0`. No se integra ni activa Brevo; la recuperación real de claves y el seguimiento siguen pendientes.

## Escenarios cubiertos

- Recorrido HTTP existente sobre PostgreSQL real: inscripción, último cupo simultáneo, QR generado y decodificado, recepción, inscripción presencial, intercalado 3:1 y prioridad desde 30 minutos, permisos, ausencias/reincorporaciones, evaluación, versiones de resultados, consentimientos, cuentas, cancelaciones y lista de espera.
- Dos servidores compilados: llegada doble con una sola entrada; dos profesionales reciben bebés distintos; un reintento en otra instancia recupera el llamado original; dos recepcionistas reincorporan una sola vez; dos llamados de la misma profesional conservan una única atención; guardar y marcar ausencia compiten con un único resultado válido.
- Navegadores: ingreso del equipo, selección de evento, búsqueda por número y contenido de QR, cámara denegada con alternativa manual, respuesta de llegada perdida y reintento, llamado guardado con respuesta perdida, recarga que conserva la atención, ausencia/regreso, formulario precargado y de solo lectura para identidad, guardado único y fila vacía posterior.
- Comprobaciones de interfaz: ausencia de excepciones JavaScript y de desborde horizontal en recepción, kinesiología y evaluación. Capturas con datos ficticios en `test-results/devices/`, excluidas de Git.

Los grupos independientes de cuentas reinician únicamente la ventana global de ingreso en esta base ficticia; no es una medición de carga ni modifica los límites oficiales. `test:security` conserva sus comprobaciones específicas del límite compartido.

## Matriz automática y validación física

| Objetivo del evento | Prueba automática | Validación física pendiente |
| --- | --- | --- |
| Computador con Chrome | Chromium, 1440 × 900 | Chrome instalado, lector QR USB y red del evento |
| Android con Chrome | Chromium con perfil Pixel 7, pantalla y tacto emulados | Cámara trasera, permisos, teclado y suspender/regresar |
| MacBook con Safari | WebKit de escritorio, 1440 × 900 | Safari instalado y permisos de cámara |
| iPad con Safari | WebKit con perfil iPad de séptima generación | Cámara, teclado, rotación y suspender/regresar |

Chromium no equivale a todas las versiones de Chrome; WebKit no es la aplicación Safari instalada. La emulación no acredita funcionamiento en dispositivos físicos. La prueba automática deniega la cámara de forma controlada y comprueba el QR por su contenido; la decodificación del PNG se comprueba en la batería HTTP. No se ha validado una lectura óptica real.

## Pasos de aceptación en equipos del evento

En un entorno de pruebas con HTTPS y sin envíos reales, preparar dos cuentas de recepción, dos de kinesiología y un evento ficticio. En Android/iPad, usar HTTPS: una dirección IP local por HTTP no habilita la cámara como lo hace `localhost` en el mismo computador.

1. En cada equipo, ingresar, seleccionar el evento y comprobar teclado, campos, botones y textos en vertical y horizontal.
2. Leer un QR desde otro dispositivo y desde papel. Denegar el permiso y comprobar que se puede continuar por número. Cerrar la cámara y comprobar que se apaga su indicador; reabrirla. En el computador, repetir con el lector USB si se utilizará.
3. Desde dos recepciones, confirmar la misma llegada; comprobar una entrada. Llamar desde dos profesionales y verificar números diferentes. Repetir el llamado tras recargar y confirmar que conserva la atención.
4. Inscribir familias presenciales y previas, comprobar la proporción y el aviso de prioridad. No presentar los 30 minutos como una garantía de hora de atención.
5. Marcar una ausencia; reincorporar desde recepción y verificar mismo número/QR y una sola ficha. Guardar una evaluación y comprobar que recepción deja de mostrarla en espera.
6. Interrumpir la conexión, reintentar y verificar que no aparecen duplicados. Bloquear/suspender el dispositivo, volver y actualizar antes de llamar. Repetir cuando expire o se revoque la sesión.
7. Registrar equipo, versión del sistema/navegador, fecha y resultado. Si falla, anotar el paso y un mensaje sin datos de familias reales.

Esta aceptación física sigue abierta hasta realizarla con los equipos disponibles. La ampliación del protocolo clínico también conserva sus confirmaciones pendientes; estas pruebas validan el formulario actual de cuatro medidas.

## Registro de la validación técnica — 2026-11-13

Node 22.14.0 y PostgreSQL 18.7. Compilación de producción, lint, 41 pruebas unitarias, infraestructura de correo, seguridad compartida, eventos, permisos HTTP, recorridos familiares de desarrollo y producción, tipos y perfiles de navegador aprobados. El recorrido completo adicional con PostgreSQL real, dos procesos compilados y los cuatro perfiles también terminó correctamente. Las bases temporales se eliminaron; se comprobó además la limpieza al interrumpir una ejecución y la liberación de conexiones ante un fallo parcial, seguida de recuperación con cuatro conexiones independientes.

Se corrigió la preparación prematura del detalle de resultados familiares y se añadió la comprobación del registro de errores del servidor. Las capturas del último recorrido usan exclusivamente fixtures.

La aceptación física de la matriz anterior sigue pendiente. No se activó Brevo ni se enviaron correos reales; la ampliación clínica conserva sus confirmaciones pendientes.
