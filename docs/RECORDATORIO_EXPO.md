# Recordatorio puntual de Expo Bebé · 18 de noviembre de 2026

## Estado

**Lote autorizado y procesado: 62 mensajes con cola y hora verificadas individualmente; 1 con procesamiento confirmado por protección contra duplicados, pendiente de recuperar su identificador. Hora prevista: 19:00 de Santiago del 18 de noviembre de 2026.** La responsable revisó las muestras, aprobó los 63 destinatarios y confirmó cupo suficiente. La clave no permite consultar `/account` (403); no se cambiaron sus permisos ni el plan del servicio.

Una aceptación perdió su identificador al vencer una transacción de PostgreSQL. Se contrastó el mismo contenido mediante HMAC y se repitió la misma clave dentro de los 12 minutos posteriores: Brevo respondió `duplicate_parameter`, confirmando procesamiento previo y bloqueando la repetición. Este caso conserva estado `REVISION` con motivo `PROVEEDOR_DUPLICADO_CONFIRMADO`, sin inventar un identificador ni volver a enviarlo. La evidencia privada está en `conciliacion-respuesta.json`. Los demás mensajes se verifican individualmente mediante su identificador nativo.

## Destinatarios y contenido

Se consultaron únicamente las citas activas del tipo de craneometría de Expo Bebé para los días 20, 21 y 22 de noviembre, en America/Santiago. La instantánea contiene 42 horarios, 67 reservas y 63 correos únicos: 18 reservas para el viernes, 28 para el sábado y 21 para el domingo. No se encontraron correos inválidos, referencias de invitado duplicadas ni supresiones locales entre esos destinatarios.

Se prepara un mensaje individual por correo, incluyendo sus horarios cuando tiene más de una reserva. El campo de nombre no se utiliza porque puede corresponder al padre o al bebé. No se crean fichas ni se infieren consentimientos o identidades clínicas. El mensaje recuerda la craneometría, sus días y horas, Metropolitan Santiago y las fechas generales de la Expo. Remite a la confirmación de Calendly para cambios o cancelaciones. No incluye datos clínicos, medidas, resultados ni enlaces públicos al registro del paciente.

La plantilla está en `src/lib/event-reminders/content.ts`. La vista previa ficticia y el plan real se guardan en `test-results/event-reminder/`, excluido de Git. No compartir el plan: contiene direcciones y referencias privadas de reservas. Las credenciales permanecen en `.env.local`.

## Programación

La hora solicitada es **2026-11-18 19:00 America/Santiago**, equivalente a **2026-11-18T22:00:00.000Z**. Se utiliza la programación nativa de correos transaccionales de Brevo, sin depender de GitHub Actions ni del servidor local a esa hora. El proveedor advierte que los mensajes programados pueden demorarse hasta cinco minutos. Una aceptación de programación no confirma entrega al buzón.

El programador puntual `scripts/programar-recordatorio-expo.mjs` exige la huella SHA-256 exacta del plan aprobado y la confirmación explícita del cupo. Antes de programar el primer mensaje vuelve a comprobar que todas las reservas estén activas y con el mismo correo, evento y horario. Si encuentra cambios, se detiene para preparar un plan nuevo. No incluye reservas nuevas que aparezcan después de la instantánea revisada.

Tras la aprobación se ejecuta con Node compatible y las opciones `--approve HUELLA` y `--credits-confirmed NUMERO`. Sin esas opciones se detiene antes de cargar credenciales, conectar a la base o contactar al proveedor. La excepción de destinatarios solo existe en memoria para ese plan; no cambia `CASKU_MAIL_MODE=pruebas`, la lista de dos correos autorizados, los envíos clínicos ni otras rutas del sistema.

Cada intención usa una clave estable y el registro durable de entregas. Repetir un plan aceptado no vuelve a enviarlo. Las respuestas inciertas exigen revisión; no se reintentan automáticamente. La consulta por UUID de lote devolvió 404 pese a las aceptaciones; por eso se utiliza la consulta individual por messageId y se comprueba estado `queued` y hora exacta. Para cancelar antes de la salida se requiere el identificador individual; el caso sin identificador exige conciliación en Brevo. No hay sincronización automática de cambios posteriores en Calendly. El programador guarda además cada nueva respuesta nativa en un archivo privado antes de persistir la aceptación, para poder conciliar errores de base sin repetir el envío.

## Verificación

Pasaron 67 pruebas unitarias, TypeScript, lint y la prueba de Brevo con proveedor ficticio y base temporal. Se comprobaron horarios en Santiago, varias citas por correo, fechas fuera de la Expo, fechas sin zona, programación vencida o a más de 72 horas, restricciones de destinatarios, persistencia de la aceptación y ausencia de duplicados. Se comprobó que ejecutar el programador sin aprobación no realiza operaciones.

Referencias: [programación en Brevo](https://developers.brevo.com/docs/schedule-batch-sendings), [contrato de envío](https://developers.brevo.com/reference/send-transac-email) y [permisos de Calendly](https://developer.calendly.com/docs/authentication/scopes).

La comprobación final y sus cantidades quedan en `test-results/event-reminder/recepcion-brevo.json`. Los correos efectivamente entregados deberán verificarse después de la hora programada; una cola confirmada no garantiza llegada al buzón.

Verificación final a las 16:57 UTC del 18 de noviembre: 62 respuestas individuales `queued` con `scheduledAt=2026-11-18T22:00:00.000Z`, 1 conciliación sin identificador, total 63. Se repitieron con éxito las 67 pruebas unitarias, lint, TypeScript y la comprobación de sintaxis del programador. No se activaron envíos generales ni clínicos.
