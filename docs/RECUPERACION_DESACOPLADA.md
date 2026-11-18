# Recuperación de contraseñas desacoplada

## Solicitud pública

`POST /api/equipo/recuperacion/solicitar` valida formato y origen, aplica los límites compartidos y, cuando la función está configurada, guarda una solicitud en `SolicitudRecuperacion`. No consulta `CuentaEquipo`, no genera tokens ni contacta a Brevo. El mismo recorrido de persistencia se aplica a direcciones de cuentas activas, desactivadas, familiares o inexistentes.

La respuesta conserva `202` y el mensaje genérico. No devuelve identificadores de solicitud, tokens, estado de cola ni existencia de cuenta. La latencia de Brevo y la búsqueda de cuentas quedan fuera de la respuesta pública. Esto no promete una duración constante de red/base ni oculta los límites propios de solicitudes previas. Una avería de base puede devolver el error genérico del servicio; no se confirma almacenamiento que no ocurrió.

Con `CASKU_PASSWORD_RECOVERY_ENABLED=0` o sin clave de cola válida, se mantiene el mensaje genérico y no se encola. No se omiten controles de origen ni de intentos. No hay envíos reales durante esta entrega.

## Cola privada y privacidad

Cada solicitud tiene identidad UUID, orden creciente, HMAC del destinatario, estado, vencimiento y bloqueo temporal. La dirección va cifrada mediante AES-256-GCM, con nonce aleatorio y autenticación asociada al UUID: copiar el cifrado a otra solicitud no permite utilizarlo. No se guarda el correo en texto plano, ni token, enlace o cuerpo en esta cola.

Una solicitud pendiente vence a los diez minutos. Se comprueba con el reloj de PostgreSQL. Al terminar, omitir, fallar o pasar a revisión se elimina el correo cifrado y se conserva únicamente el registro técnico. El trabajador limpia en lotes de hasta cien solicitudes vencidas y registros terminados de más de siete días; también aplica la limpieza existente de tokens antiguos. Las solicitudes con seguimiento administrativo conservan metadatos para mantener accesible su historial; el correo cifrado se elimina al terminar igual que antes. La limpieza evita competir con una gestión en curso. Esta retención requiere ejecución periódica del trabajador: un servidor detenido o un procesador sin configurar no ejecuta mantenimiento automáticamente.

No se migran solicitudes antiguas ni se modifican claves, versiones, sesiones o enlaces existentes. La migración `20261115000100_recuperacion_desacoplada` queda preparada; debe aplicarse con `npm run db:deploy`, regenerar Prisma y reiniciar antes de activar. No se aplicó a la base del sistema durante esta entrega.

## Procesamiento independiente

`POST /api/interno/recuperaciones/procesar` requiere un Bearer privado independiente de las sesiones de equipo. No acepta parámetros de activación, destinatarios, enlaces ni identidades desde el cuerpo o la URL. Devuelve solo totales del lote. La ruta pública nunca invoca esta ruta ni depende de su respuesta.

El procesador reclama una solicitud por vez mediante `FOR UPDATE SKIP LOCKED`, con token de bloqueo y reserva de dos minutos. Un lote procesa hasta cinco solicitudes. Dos procesos comparten el orden y no envían el mismo trabajo. No se mantiene una transacción abierta mientras responde Brevo.

Después de reclamar, descifra el correo y busca la cuenta. Una dirección inexistente, desactivada o una solicitud obsoleta se omite. Para una cuenta válida genera un token en memoria; en `RecuperacionClave` guarda únicamente su HMAC, con vencimiento a treinta minutos desde su preparación. El enlace se construye exclusivamente desde el origen privado configurado.

Tras la aceptación de Brevo, una transacción vuelve a comprobar la versión, identidad y estado de la cuenta, el bloqueo, la vigencia del token y las solicitudes posteriores ya enviadas. Solo entonces activa el enlace y sustituye el anterior. Una respuesta de una solicitud más antigua no desplaza un enlace más reciente aunque el proveedor responda fuera de orden.

Un rechazo conocido conserva el enlace anterior. Una respuesta incierta o bloqueo vencido queda en revisión y no provoca un nuevo POST al proveedor. El token nuevo no se activa sin confirmación y finalización válida; la persona puede solicitar otro enlace. No se guardan tokens cifrados ni se reanudan a ciegas envíos interrumpidos. Un fallo de persistencia tras aceptar puede dejar el enlace recibido inutilizable; no cambia la contraseña ni elimina el enlace anterior válido.

La revocación administrativa, consumo único, cambio de contraseña, auditoría y cierre de sesiones siguen en sus transacciones existentes. El trabajador no cambia contraseñas por enviar un enlace. Las supresiones por rebote o queja se siguen comprobando en el adaptador compartido de Brevo.

## Configuración y ejecución futura

Mantener desactivado hasta configurar el procesador:

- `CASKU_PASSWORD_RECOVERY_ENABLED=0`: controla la entrada y el procesamiento de esta cola, independiente de la automatización clínica.
- `CASKU_PASSWORD_RECOVERY_QUEUE_KEY`: 32 bytes aleatorios codificados en base64url canónico, 43 caracteres. Usar una clave exclusiva; no reutilizar `AUTH_SECRET`, secretos de Brevo o del webhook. Conservarla mientras existan solicitudes pendientes; cambiarla hace que el cifrado anterior no pueda procesarse.
- `CASKU_PASSWORD_RECOVERY_WORKER_SECRET`: token base64url de 32 a 256 caracteres para la ruta privada, exclusivo de este procesador.
- `AUTH_URL`: origen del portal. HTTPS en producción; HTTP solo para loopback en pruebas.

El trabajador exige también la configuración transaccional completa de Brevo, remitente verificado, secretos de huellas/supresión y `CASKU_MAIL_ENABLED=1`. Sin ella responde desactivado y no envía; si el procesador está habilitado, sí ejecuta la limpieza de vencidos aunque el transporte no esté disponible. El seguimiento clínico conserva su bloqueo.

`npm run recovery:process` ejecuta un lote contra el servidor configurado; no crea un temporizador ni cambia las banderas. Se deja listo para que el hosting definitivo programe ejecuciones frecuentes, por ejemplo cada minuto, con capacidad para el volumen real, alertas ante fallos y un límite de ejecución compatible con el lote y el tiempo del proveedor. Debe configurarse y probarse esa ejecución antes de habilitar la recuperación real. No depende de visitas al portal, de una promesa sin esperar ni de memoria del proceso Next.js.

El dominio, hosting, credenciales y comprobación de entrega real permanecen pendientes. La configuración privada no se modificó.

## Pruebas

- `npm test`: formato de clave, cifrado, manipulación y asociación del cifrado a su solicitud.
- `npm run test:recovery`: dos clientes sobre base temporal, proveedor retenido, nuevas solicitudes independientes, expiración, errores, cuentas desactivadas, respuestas fuera de orden, reserva vencida, cambio de versión y eliminación de datos cifrados al terminar.
- `npm run test:recovery:http`: recorrido focalizado de claves temporales, solicitud pública, cola privada, entrega posterior, uso único y auditoría, sobre HTTP. No sustituye la batería integral.
- `npm run test:families`: petición pública sin correo ni token, procesamiento privado posterior, enlace real capturado del proveedor ficticio, vencimiento, uso único, fallos sin anular el anterior, auditoría y sesiones.
- `npm run test:http`: autenticación del procesador y desactivación explícita.
- `npm run test:production`: mismos recorridos sobre el servidor compilado.
- `npm run test:postgres -- --recovery-only --skip-build`: concurrencia y fallos en PostgreSQL real, dentro de una base temporal aislada que se elimina al terminar.
- `npm run check`: batería completa, compilación y tipos.

## Validación de esta entrega · 15 de noviembre de 2026

Pasaron `npm run check` (incluidas 51 pruebas unitarias, seguridad entre dos procesos, recorridos completos, compilación de producción y tipos), el recorrido HTTP focalizado y las pruebas específicas de cola. Después del ajuste final de limpieza SQL por lotes, se repitieron satisfactoriamente producción, cola, lint y tipos.

`npm run test:postgres -- --recovery-only --skip-build` terminó correctamente en PostgreSQL real con clientes independientes: proveedor retenido, solicitudes concurrentes, errores, conservación del enlace anterior, respuesta fuera de orden, cambios de cuenta y limpieza acotada de más de cien solicitudes. La base temporal se eliminó. No se modificó la configuración privada, no se aplicó la migración a la base del sistema y no se enviaron correos reales.

La batería general mostró inicialmente incidencias de aislamiento en escenarios anteriores. Se separó la ventana global de ingresos entre grupos independientes de las pruebas familiares, como ya se hacía antes de los grupos de cuentas; `test:security` conserva las ventanas efectivas y verifica sus límites sin reiniciarlas. No se modificó ningún límite de la aplicación ni se relajaron las comprobaciones de permisos. La ejecución completa posterior pasó.

## Prueba local con Brevo real · 18 de noviembre de 2026

La migración de recuperación ya está aplicada en la base configurada. Se prepararon los secretos privados y se habilitó la cola para pruebas locales con los dos destinatarios autorizados del adaptador. La solicitud pública, el procesamiento privado manual, la aceptación real de Brevo y la activación del enlace se comprobaron con una cuenta existente. No se modificó su contraseña ni se habilitó un servicio periódico externo. El detalle y los pasos de aceptación manual están en [BREVO_TRANSACCIONAL.md](BREVO_TRANSACCIONAL.md#confirmaciones-y-recuperación-reales-controladas--18-de-noviembre-de-2026).
