# Brevo: correos transaccionales preparados

## Alcance y estado

El adaptador conecta códigos de acceso familiar, confirmaciones de inscripción con número y QR PNG adjunto y recuperación de contraseñas del equipo. Usa la API transaccional de Brevo, sin Resend ni proveedor alternativo. El QR no depende de una imagen pública ni de contenido inline no admitido por el contrato utilizado.

**Pruebas reales locales activadas con lista privada de dos destinatarios autorizados.** Casku confirmó el dominio y el remitente `contacto@casku.cl`; la clave oficial se incorporó en `.env.local`, excluido de Git. El servidor local conserva `CASKU_MAIL_MODE=pruebas`; el despliegue oficial todavía requiere su configuración propia. Una confirmación aceptada por el proveedor no demuestra entrega en el buzón.

Los correos de resultados y seguimiento clínico permanecen bloqueados para proveedores reales, incluso al habilitar los transaccionales. Los [webhooks](WEBHOOKS_BREVO.md) ya están preparados con pruebas simuladas. La automatización clínica, sus plantillas, protocolo y calendario requieren una etapa separada; `CASKU_MAIL_AUTOMATION=0` debe conservarse.

## Configuración y activación futura

Las variables privadas están documentadas en `.env.example`:

- `BREVO_API_KEY`: clave oficial incorporada privadamente por la persona responsable; nunca exponer al navegador.
- `BREVO_SENDER_EMAIL=contacto@casku.cl` y `BREVO_SENDER_NAME=Casku`.
- `BREVO_SENDER_VERIFIED=0`: cambiar solo tras comprobar la verificación real en Brevo; esta bandera no verifica el remitente por sí misma.
- `CASKU_MAIL_ENABLED=0`: control explícito de activación, independiente de disponer de credenciales.
- `CASKU_MAIL_DELIVERY_SECRET`: secreto aleatorio estable de al menos 32 caracteres, distinto de `AUTH_SECRET`. No rotar sin revisar las entregas existentes.
- `CASKU_MAIL_SUPPRESSION_SECRET`: secreto aleatorio estable de al menos 32 caracteres, obligatorio para consultar bloqueos por rebote definitivo o queja.
- `AUTH_URL`: URL correcta del portal, HTTPS en producción, utilizada en comprobantes y enlaces.

Antes de habilitar envíos, aplicar las migraciones con `npm run db:deploy` y regenerar Prisma con `npx prisma generate`. La migración `20261114000100_brevo_transaccional` está preparada y probada en bases temporales; no se aplicó a la base configurada del sistema durante esta integración. Después de configurar los valores reales, reiniciar el servidor. La activación y las pruebas reales quedan para una entrega posterior con destinatarios acordados.

Sin configuración completa, los códigos no se envían y la verificación familiar no se omite. La recuperación conserva su respuesta genérica. Administración puede reasignar una clave temporal mediante el flujo existente.

## Entrega, reintentos y privacidad

`EnvioTransaccional` conserva intención, finalidad, estado, intentos, tiempos, bloqueo e identificador del proveedor. Guarda una huella HMAC del mensaje, nunca su cuerpo, correo, código de acceso o enlace de recuperación. El secreto estable protege las huellas de códigos cortos frente a intentos de adivinación sobre la base.

Dos procesos comparten el bloqueo en PostgreSQL. Los tiempos de disponibilidad y reserva utilizan el reloj de la base, con zona horaria explícita. La petición HTTP ocurre fuera de la transacción. Una aceptación conocida se reutiliza sin volver a enviar; cambiar el contenido o destinatario bajo la misma intención se rechaza.

Los rechazos temporales conocidos permiten reintento con la misma intención y contenido, respetando `Retry-After` y un máximo de cinco intentos. Una respuesta perdida, un error de servidor, un duplicado sin identificador original o una interrupción después de posible aceptación quedan en `REVISION`. No se reenvían a ciegas. Si falla el guardado tras la aceptación, al vencer la reserva también se exige revisión.

Se envía un UUID estable de idempotencia. La ventana del proveedor es limitada: el registro durable evita depender de ella para repetir aceptaciones antiguas. No se promete entrega exactamente una vez. Referencias: [API de envío](https://developers.brevo.com/reference/send-transac-email), [idempotencia de Brevo](https://developers.brevo.com/docs/heterogenous-versions-batch-emails).

La migración conserva los correos anteriores e incorpora marcadores de revisión para confirmaciones que tuvieron intentos sin aceptación registrada con el proveedor anterior. Evita reenviarlas automáticamente al cambiar a Brevo. Su revisión manual queda pendiente antes de activar; no hay una acción pública que elimine esos bloqueos.

Se conservan las autorizaciones y límites existentes. Los enlaces de recuperación continúan siendo de un uso, con vencimiento de 30 minutos y revocación de sesiones. La solicitud pública ahora utiliza la [cola desacoplada](RECUPERACION_DESACOPLADA.md): no consulta la cuenta ni espera al proveedor. El procesador privado y sus secretos deben configurarse antes de activar recuperaciones reales.

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

## Pruebas controladas con Brevo real

En `.env.local`, guardar la clave como `BREVO_API_KEY`, confirmar `BREVO_SENDER_VERIFIED=1`, y configurar `CASKU_MAIL_MODE=pruebas` con `CASKU_MAIL_TEST_RECIPIENTS` (direcciones exactas separadas por comas). La lista permanece privada. Sin modo explícito se exige el modo de pruebas; una lista ausente o inválida bloquea la configuración real. La restricción se aplica antes de registrar la intención y otra vez antes de contactar al proveedor. No redirige mensajes de otras familias hacia los destinatarios de prueba.

Mantener `CASKU_MAIL_ENABLED=0` hasta completar la configuración privada y revisar las migraciones de la base de pruebas. Los secretos estables de entrega y supresión deben existir y nunca reemplazarse si ya se usaron. Usar `npm run dev`, no la demostración `dev:familias`, que simula los correos. Reiniciar tras modificar variables.

Al activar temporalmente `CASKU_MAIL_ENABLED=1`, solicitar un código desde `/login` con un correo autorizado, completar el acceso e inscribir un bebé ficticio en un evento de prueba para comprobar número y QR. Revisar la recepción en el buzón y los registros de Brevo. No ejecutar pruebas automáticas con credenciales reales. La recuperación requiere además su procesador privado; los resultados y seguimientos clínicos conservan el bloqueo. Los webhooks requieren una URL pública y su configuración independiente.

Para el evento se debe elegir explícitamente `CASKU_MAIL_MODE=produccion` en el servidor oficial. Este valor elimina la restricción de destinatarios de pruebas; no habilitarlo en desarrollo. Tras la prueba local, volver a `CASKU_MAIL_ENABLED=0`.

## Validación real controlada · 18 de noviembre de 2026

Se revisó la configuración sin mostrar credenciales y se consultó la base configurada. Había 19 migraciones aplicadas y cuatro pendientes, sin migraciones fallidas. Se revisaron y aplicaron las cuatro migraciones de Brevo transaccional, webhooks, recuperación desacoplada y gestión de correos. La aplicación de migraciones no activa el webhook ni el procesador de recuperación.

Se inició el servidor local con los envíos activados y lista de dos correos privados. Se solicitó un código desde la API real de acceso para cada dirección autorizada. Ambas solicitudes respondieron HTTP 200 y cada intención quedó registrada como ACEPTADO, con un intento e identificador del proveedor. No se registraron cuerpos, códigos ni credenciales en este documento. La entrega en buzón sigue pendiente de confirmación; sin webhook público, el estado local de entrega permanece SIN_CONFIRMAR.

Para completar el ingreso desde el navegador se debe solicitar un código nuevo en `/login`: las solicitudes de verificación de transporte no crean el estado de acceso de la pantalla del usuario. Los resultados y seguimientos clínicos continúan bloqueados y la recuperación requiere su procesador independiente.
