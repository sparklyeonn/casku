# Infraestructura de correos y seguimiento

## Alcance de esta etapa

La infraestructura clínica queda desactivada. El [adaptador transaccional de Brevo](BREVO_TRANSACCIONAL.md) está preparado para acceso, confirmaciones y recuperación, sin activar envíos reales. No se han configurado credenciales de Brevo, un webhook público ni un servicio de ejecución periódica externo. La verificación de `contacto@casku.cl`, el subdominio y el despliegue siguen pendientes.

Cada nueva publicación crea, en la misma transacción, tres órdenes: INICIAL, SEMANA y MES. Se crean **bloqueadas**, sin fecha, destinatario ni mensaje operativo. Una migración no genera campañas históricas ni presupone consentimiento o clasificación clínica. Las publicaciones anteriores no se incorporan de oficio.

El transporte anterior fue retirado. El adaptador de Brevo bloquea los resultados clínicos reales, incluso si se habilitan los correos transaccionales; los recordatorios tampoco se envían. Las pruebas conservan el recorrido clínico con un proveedor ficticio. Cuando un flujo confirma aceptación, la orden inicial se reconcilia para evitar contarla como pendiente. La publicación y consulta familiar siguen disponibles, según sus permisos.

## Aprobación clínica y calendario

`prepareMailPlan` es una función interna; no existe una API que permita aprobar una clasificación o un calendario desde el navegador. Su futuro llamador clínico deberá aportar un protocolo confirmado, una política versionada, aprobación de plantillas y clasificaciones estructuradas. Nunca se interpreta el texto del diagnóstico para decidir quién recibe correos.

- Hay elegibilidad si existe plagiocefalia alterada o alteración de forma; los casos mixtos están incluidos.
- Solo dos clasificaciones explícitamente normales excluyen por normalidad.
- Sin una alteración confirmada y con indicadores pendientes, el plan sigue bloqueado.
- Cada intento exige datos, resultados por correo y, para SEMANA/MES, permiso de seguimiento vigente, además de propiedad y correo verificado actuales.
- Retirar permisos cancela las órdenes pendientes de su finalidad. Una nueva aceptación no reactiva automáticamente recordatorios cancelados. Los mensajes ya en curso pueden completarse.

El cálculo de calendario está preparado y probado, pero **la política utilizada en las pruebas es ficticia, no una aprobación de Casku**: D+7 calendario en Chile, mes calendario con ajuste al último día y una hora diurna explícita; las etapas que ya vencieron al publicar se omiten. El inicial corresponde al día de evaluación. La confirmación de Casku podrá requerir cambiar estas decisiones antes de activar cualquier orden. La ventana técnica de reintento es de 72 horas desde la fecha programada, con un máximo de cinco intentos.

Los mensajes reutilizan únicamente resultados y recomendaciones publicados. Las plantillas semanales y mensuales son borradores; no infieren consejos, indicaciones de casco ni ausencia a una consulta. La ampliación clínica de siete medidas y sus clasificaciones sigue en el pendiente 3.

## Procesamiento durable

`POST /api/interno/correos/procesar` requiere un Bearer secreto de al menos 32 caracteres y no admite activación mediante cuerpo o parámetros. Con `CASKU_MAIL_AUTOMATION=0`, responde desactivado sin enviar. Requiere además una política versionada y un secreto estable de supresión, independiente de la clave de autenticación. No configurar estas variables en la instalación oficial hasta completar las aprobaciones y el proveedor.

Al activar en el futuro, un programador externo deberá invocar la ruta periódicamente por POST y registrar sus fallos. Los lotes son pequeños y acotados. Cada orden se reclama con bloqueo y `SKIP LOCKED`, un token temporal y un registro por intento. Solo se reserva una orden a la vez por trabajador: no caducan reservas de mensajes que todavía están esperando dentro del lote.

Se mantienen destinatario, mensaje congelado y clave de idempotencia. El inicial conserva la clave del correo anterior y se reconcilia con mensajes iniciales ya aceptados. Un cambio de destinatario o propietario cancela el intento, sin redirigir contenido clínico al nuevo correo automáticamente.

Solo un rechazo **conocido como temporal y no aceptado** permite reintento automático: uno, dos, cuatro y ocho minutos, hasta el límite. Los fallos permanentes se detienen. Un error desconocido, una respuesta incierta o una interrupción sin garantía vigente de idempotencia quedan en REVISION; no se reenvían a ciegas. La recuperación tras caída reutiliza la misma clave solo dentro de la garantía declarada por el adaptador. No se promete entrega exactamente una vez.

El adaptador de Brevo clasifica rechazos temporales, permanentes y respuestas inciertas. El registro transaccional evita repetir solicitudes aceptadas y envía a revisión las respuestas perdidas o interrupciones tras una posible aceptación. La integración clínica permanece bloqueada y no declara una ventana de recuperación automática de respuestas inciertas; requiere aprobación y pruebas específicas antes de activarse.

## Notificaciones y supresión

`recordDeliveryEvent` recibe eventos normalizados de un futuro adaptador **después de autenticar su webhook**. Es una función interna, no un endpoint público de recepción. La firma/autenticación específica de Brevo, su configuración y las pruebas de entrega real están pendientes de esa integración posterior.

Se registra proveedor, identificador único del evento, identificador de mensaje, tipo y fecha, sin guardar cuerpo clínico, dirección ni el webhook completo. Repetir un evento es idempotente; repetir su identificador con contenido diferente se rechaza. Los avisos que llegan antes de guardar la aceptación quedan pendientes de correlación y se reconcilian después.

ACEPTADO significa que el proveedor confirmó la solicitud; la entrega al buzón se registra aparte. Una entrega tardía no borra un rebote o una queja. Los rebotes definitivos y las quejas bloquean nuevos mensajes de la cola a ese destinatario mediante una clave HMAC, y cancelan órdenes pendientes. El adaptador debe distinguir rebotes definitivos de incidencias temporales antes de normalizar un evento como REBOTE. El secreto de supresión debe conservarse; una rotación requiere migrar las claves para no perder ese bloqueo.

## Administración y validación

El panel de administración muestra totales del evento para órdenes en preparación, pendientes, aceptadas o que requieren revisión. No expone diagnósticos, medidas, QR, direcciones de correo ni cuerpos. Recepción y kinesiología no acceden a esta API administrativa.

`npm run test:mail` utiliza Prisma, dos clientes, una base PGlite temporal y transporte ficticio. Comprueba bloqueo inicial, idempotencia, casos mixtos, normalidad explícita, calendario, permisos, reintentos, límites, interrupciones, cambio de destinatario, inicial ya enviado, tokens obsoletos, eventos tempranos/repetidos/desordenados y supresión. Las pruebas HTTP comprueban protección y desactivación del trabajador; las familiares verifican que la migración conserva los registros anteriores. `npm run check` incluye esta nueva batería.

Esta validación no reemplaza PostgreSQL real ni las pruebas conjuntas del punto 7. El punto 5 incorpora versiones y retiro: las órdenes llevan número de versión, se detienen al reemplazar o retirar su contenido y las nuevas quedan bloqueadas. Ver [VERSIONES_RESULTADOS.md](VERSIONES_RESULTADOS.md). Una aceptación tardía no reactiva la orden cancelada.
