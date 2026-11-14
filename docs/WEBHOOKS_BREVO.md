# Notificaciones de entrega de Brevo

## Estado de la integración

`POST /api/webhooks/brevo` registra entregas, rebotes temporales, rebotes definitivos y quejas de spam. No envía correos, no cambia permisos ni publica resultados. Los envíos reales permanecen desactivados y no se modificó la configuración privada ni la base del sistema.

La recepción tiene su propio interruptor, `BREVO_WEBHOOK_ENABLED=0`, independiente de `CASKU_MAIL_ENABLED=0` y `CASKU_MAIL_AUTOMATION=0`. Se puede recibir una notificación de un envío anterior con los nuevos envíos desactivados. No se creó ningún webhook en la cuenta de Brevo.

## Autenticación y configuración futura

La implementación utiliza la [autorización Bearer documentada por Brevo](https://developers.brevo.com/docs/secured-webhooks). No presupone una firma HMAC de cuerpo que el contrato elegido no proporciona.

- `BREVO_WEBHOOK_SECRET`: token aleatorio base64url de 32 a 256 caracteres; independiente de la clave de API, del trabajador y de los secretos de autenticación y huellas.
- `BREVO_WEBHOOK_ENABLED`: mantener en `0` hasta configurar la URL pública HTTPS y el token en Brevo.
- `CASKU_MAIL_SUPPRESSION_SECRET`: secreto aleatorio estable de al menos 32 caracteres; obligatorio también para los nuevos envíos transaccionales. Se usa para identificar destinatarios con HMAC, sin guardar su dirección en el registro técnico. No rotarlo sin migrar las huellas existentes.

El token se exige en `Authorization: Bearer <token>` y se compara con tiempo constante para valores de igual longitud. No se acepta desde parámetros, cuerpo, cookies del equipo ni cabeceras de origen. No se registra ni devuelve. Se autentica antes de leer el cuerpo o consultar la base. Las solicitudes no autenticadas reciben `401`; un receptor desactivado o sin secreto de supresión devuelve `503` después de autenticar.

Antes de activarlo se deben aplicar las migraciones con `npm run db:deploy`, regenerar Prisma con `npx prisma generate` y reiniciar. La migración `20261114000200_webhooks_brevo` añade huellas y estados; conserva los registros anteriores, sin inventar eventos, destinatarios o entregas históricas. Los registros previos sin huella no se vinculan a partir del correo declarado en una notificación.

Para una configuración futura mediante la API de Brevo, usar `type: "transactional"`, `events: ["delivered", "softBounce", "hardBounce", "spam"]`, la URL HTTPS del receptor y `auth: {"type":"bearer","token":"<token privado>"}`. Las suscripciones usan esos nombres; los cuerpos recibidos usan `delivered`, `soft_bounce`, `hard_bounce` y `spam`. Ver [creación de webhooks](https://developers.brevo.com/reference/create-webhook) y [eventos transaccionales](https://developers.brevo.com/docs/transactional-webhooks). No ejecutar esa configuración durante las pruebas simuladas.

## Validación y almacenamiento

Se admiten un objeto o un lote de hasta 50 eventos, con `application/json` y un máximo de 128 KiB verificado al leer el cuerpo. Un lote con un evento admitido malformado se rechaza completo antes de escribir. Fechas UTC numéricas (`ts_event`, o `ts` si falta), identificador de mensaje y destinatario son obligatorios para eventos admitidos. No se interpreta `date` como hora local ni `ts_epoch` como fecha del evento; no se rechazan avisos antiguos válidos por su antigüedad.

Se normaliza el identificador de mensaje con y sin corchetes angulares. La identidad de una notificación se deriva de mensaje, tipo, fecha y huella del destinatario. No se usa `id` como identificador único del evento, porque la documentación lo describe como identificador del webhook. Cambiar campos irrelevantes o repetir la misma notificación no crea otro evento. Otros tipos de evento se ignoran con `200`, sin almacenar su contenido ni rastrear aperturas o clics.

`NotificacionCorreo` guarda proveedor, identidad derivada, mensaje, tipo, fecha y huella HMAC del destinatario; opcionalmente, la vinculación al envío o a la orden clínica y su fecha de aplicación. No guarda dirección, asunto, razón de rebote, cuerpo, códigos, enlaces ni payload completo. Los identificadores del mensaje y su destinatario deben coincidir con un envío conocido antes de modificar su entrega o crear una supresión. Mensajes desconocidos o destinatarios discordantes quedan sin aplicar; no pueden bloquear otras cuentas.

El registro y la aplicación son transaccionales. Un fallo de persistencia devuelve `503`, sin confirmar recepción. Un fallo de formato devuelve `400`, un tipo de contenido incorrecto `415` y exceso de tamaño `413`; las respuestas no exponen datos internos. Los límites y códigos deben comprobarse también con la infraestructura del despliegue oficial.

## Entrega y supresión

La aceptación de Brevo permanece separada de la entrega: `estado=ACEPTADO` no cambia porque posteriormente llegue un rebote o una queja. El estado de entrega progresa con esta prioridad: SIN_CONFIRMAR, REBOTE_TEMPORAL, ENTREGADO, REBOTE, QUEJA. Una entrega tardía no borra un rebote definitivo o una queja. Una queja no se degrada si luego llega un rebote de otro mensaje del mismo destinatario.

Un rebote temporal queda registrado y no suprime al destinatario ni provoca un nuevo envío desde el webhook. Un rebote definitivo o queja de un mensaje conocido incorpora su HMAC a `SupresionCorreo`. Los nuevos códigos, confirmaciones y recuperaciones comprueban esa supresión antes de llamar al proveedor. Se conserva la respuesta pública genérica de recuperación. No existe una acción pública de desbloqueo ni una retirada automática de la supresión. Un envío ya en curso puede completarse.

La cola clínica simulada utiliza las mismas notificaciones: cancela recordatorios pendientes del destinatario ante rebote definitivo o queja. Su trabajador vuelve a comprobar la supresión antes de enviar. El adaptador clínico real continúa bloqueado, al igual que sus protocolos, plantillas y programación pendientes de aprobación.

Los bloqueos compartidos de PostgreSQL serializan recepción y guardado de aceptación por mensaje. Así se cubren avisos tempranos y concurrentes. Un evento temprano se aplica al guardar la aceptación; uno posterior se aplica al recibirlo. Una respuesta de envío perdida sin identificador conocido no se presume aceptada a partir de una dirección de correo: conserva su revisión manual.

## Pruebas simuladas

- `npm test`: autenticación antes de leer el cuerpo, normalización, privacidad, límites de tamaño/lote, fechas y respuestas ante fallos.
- `npm run test:brevo`: eventos tempranos, repetidos y concurrentes con dos clientes, correlación del destinatario, prioridad de estados, supresión de las tres finalidades, rollback y ausencia de información privada.
- `npm run test:mail`: integración con órdenes clínicas ficticias y cancelación de recordatorios.
- `npm run test:http` y `npm run test:production`: receptor HTTP real sobre servidores temporales de desarrollo y producción, autenticación y rechazo de tokens en URL, validación y deduplicación, con envíos desactivados.
- `npm run test:postgres -- --mail-only --skip-build`: las pruebas de persistencia anteriores sobre una base PostgreSQL real separada. Incluye fallo SQL inducido para demostrar rollback y repetición posterior. En PGlite este segundo fallo se induce en el cliente para evitar desincronizar su único backend tras errores SQL; no se altera el comportamiento de producción.

La verificación en Brevo, una URL HTTPS accesible y las pruebas de notificaciones reales siguen pendientes. No se realizaron peticiones de envío ni de creación de webhooks a Brevo.

## Validación de esta entrega · 14 de noviembre de 2026

`npm run check` terminó correctamente: lint, 49 pruebas unitarias, cola clínica simulada, entregas y webhooks, eventos, seguridad compartida, recorridos HTTP y familiares, compilación de producción y comprobación de tipos. El receptor se probó mediante HTTP en desarrollo y en el servidor compilado, manteniendo los envíos desactivados.

`npm run test:postgres -- --mail-only --skip-build` terminó correctamente en una base PostgreSQL real aislada, con clientes independientes. Se verificaron eventos tempranos, duplicados concurrentes, supresión por destinatario, conservación de quejas entre mensajes y rollback SQL con reintento posterior. La base temporal se eliminó. La migración nueva queda preparada, sin aplicarla a la base del sistema.
