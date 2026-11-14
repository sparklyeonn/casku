# Brevo: correos transaccionales preparados

## Alcance y estado

El adaptador conecta códigos de acceso familiar, confirmaciones de inscripción con número y QR PNG adjunto y recuperación de contraseñas del equipo. Usa la API transaccional de Brevo, sin Resend ni proveedor alternativo. El QR no depende de una imagen pública ni de contenido inline no admitido por el contrato utilizado.

**Los envíos reales permanecen desactivados.** No se modificó la configuración privada ni se enviaron mensajes reales. La clave de API y la verificación del remitente `contacto@casku.cl` están pendientes. Una confirmación aceptada por el proveedor no demuestra entrega en el buzón.

Los correos de resultados y seguimiento clínico permanecen bloqueados para proveedores reales, incluso al habilitar los transaccionales. La automatización clínica, sus plantillas, protocolo, webhooks y calendario requieren una etapa separada; `CASKU_MAIL_AUTOMATION=0` debe conservarse.

## Configuración y activación futura

Las variables privadas están documentadas en `.env.example`:

- `BREVO_API_KEY`: pendiente, nunca exponer al navegador.
- `BREVO_SENDER_EMAIL=contacto@casku.cl` y `BREVO_SENDER_NAME=Casku`.
- `BREVO_SENDER_VERIFIED=0`: cambiar solo tras comprobar la verificación real en Brevo; esta bandera no verifica el remitente por sí misma.
- `CASKU_MAIL_ENABLED=0`: control explícito de activación, independiente de disponer de credenciales.
- `CASKU_MAIL_DELIVERY_SECRET`: secreto aleatorio estable de al menos 32 caracteres, distinto de `AUTH_SECRET`. No rotar sin revisar las entregas existentes.
- `AUTH_URL`: URL correcta del portal, HTTPS en producción, utilizada en comprobantes y enlaces.

Antes de habilitar envíos, aplicar las migraciones con `npm run db:deploy` y regenerar Prisma con `npx prisma generate`. La migración `20261114000100_brevo_transaccional` está preparada y probada en bases temporales; no se aplicó a la base configurada del sistema durante esta integración. Después de configurar los valores reales, reiniciar el servidor. La activación y las pruebas reales quedan para una entrega posterior con destinatarios acordados.

Sin configuración completa, los códigos no se envían y la verificación familiar no se omite. La recuperación conserva su respuesta genérica. Administración puede reasignar una clave temporal mediante el flujo existente.

## Entrega, reintentos y privacidad

`EnvioTransaccional` conserva intención, finalidad, estado, intentos, tiempos, bloqueo e identificador del proveedor. Guarda una huella HMAC del mensaje, nunca su cuerpo, correo, código de acceso o enlace de recuperación. El secreto estable protege las huellas de códigos cortos frente a intentos de adivinación sobre la base.

Dos procesos comparten el bloqueo en PostgreSQL. Los tiempos de disponibilidad y reserva utilizan el reloj de la base, con zona horaria explícita. La petición HTTP ocurre fuera de la transacción. Una aceptación conocida se reutiliza sin volver a enviar; cambiar el contenido o destinatario bajo la misma intención se rechaza.

Los rechazos temporales conocidos permiten reintento con la misma intención y contenido, respetando `Retry-After` y un máximo de cinco intentos. Una respuesta perdida, un error de servidor, un duplicado sin identificador original o una interrupción después de posible aceptación quedan en `REVISION`. No se reenvían a ciegas. Si falla el guardado tras la aceptación, al vencer la reserva también se exige revisión.

Se envía un UUID estable de idempotencia. La ventana del proveedor es limitada: el registro durable evita depender de ella para repetir aceptaciones antiguas. No se promete entrega exactamente una vez. Referencias: [API de envío](https://developers.brevo.com/reference/send-transac-email), [idempotencia de Brevo](https://developers.brevo.com/docs/heterogenous-versions-batch-emails).

La migración conserva los correos anteriores e incorpora marcadores de revisión para confirmaciones que tuvieron intentos sin aceptación registrada con el proveedor anterior. Evita reenviarlas automáticamente al cambiar a Brevo. Su revisión manual queda pendiente antes de activar; no hay una acción pública que elimine esos bloqueos.

Se conservan las autorizaciones y límites existentes. Los enlaces de recuperación continúan siendo de un uso, con vencimiento de 30 minutos y revocación de sesiones. La solicitud espera al proveedor: la respuesta es genérica pero no se garantiza tiempo constante; evaluar procesamiento desacoplado antes de habilitar envíos reales, según [CLAVES_EQUIPO.md](CLAVES_EQUIPO.md).

## Pruebas sin mensajes reales

- `npm test`: configuración, contrato de Brevo, clasificación de fallos y validaciones, sin red externa.
- `npm run test:brevo`: migraciones, dos clientes, aceptación única, rechazos, interrupciones y privacidad del registro en PGlite temporal.
- `npm run test:families`: códigos, confirmación con número/QR y recuperación en desarrollo, con API local ficticia.
- `npm run test:production`: compilación y mismos recorridos sobre el servidor compilado. Un archivo exclusivo de pruebas intercepta el endpoint oficial con credenciales ficticias; no se importa desde la aplicación.
- `npm run test:postgres -- --mail-only --skip-build`: registro de entregas con dos clientes en PostgreSQL real y base temporal aislada, que se elimina al terminar. Requiere permiso para crear bases, igual que las pruebas integrales.
- `npm run check`: comprobaciones locales completas en serie, compilación y tipos.

La simulación de la aplicación exige desarrollo, clave y remitente ficticios y dirección de loopback. La aplicación en producción usa el endpoint oficial fijo, sin aceptar una URL de envío arbitraria.

## Validación de esta entrega · 14 de noviembre de 2026

`npm run check` terminó correctamente: lint, 45 pruebas unitarias, cola clínica simulada, registro de Brevo, eventos, seguridad compartida, permisos HTTP, recorridos familiares de desarrollo y producción, compilación de producción y comprobación de tipos. Los tres flujos transaccionales se ejercitaron con proveedor ficticio, incluidos enlaces de recuperación recibidos por correo simulado en el servidor compilado.

`npm run test:postgres -- --mail-only --skip-build` terminó correctamente sobre PostgreSQL real con cuatro conexiones independientes: migración conservadora, concurrencia, aceptación única, reintentos, respuestas inciertas y fallo de escritura tras aceptación. La base temporal aislada se eliminó al finalizar. No se aplicó esta migración a la base del sistema ni se enviaron correos reales.
