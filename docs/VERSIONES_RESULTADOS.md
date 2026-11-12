# Corrección y retiro de resultados publicados

## Permisos y funcionamiento

La kinesióloga autora activa puede corregir o retirar sus propias publicaciones desde la revisión de resultados. Administración y recepción mantienen sus permisos operativos y no acceden al contenido ni al historial clínico. Una profesional distinta no puede adoptar una evaluación por conocer su identificador o nombre.

La corrección exige revisar las cuatro medidas actuales, motivo de 5 a 500 caracteres, confirmación expresa e identificador de solicitud. Los índices, diagnóstico y recomendación se recalculan en el servidor con el protocolo existente. No se incorpora todavía el protocolo de siete medidas ni se aceptan diagnósticos calculados en el navegador. La identidad de la copia publicada se conserva; corregir las fichas familiares sigue siendo una operación distinta.

Cada corrección crea una versión numerada nueva y actualiza la evaluación y su revisión. La copia original de la publicación y cada versión anterior se conservan. La autora puede consultar versiones, motivos, fecha y acciones registradas mediante un historial paginado. La atribución interna identifica la cuenta responsable; la copia clínica conserva el nombre profesional publicado.

El retiro conserva evaluación, inscripción, fila e historial, y cambia el estado visible de la publicación. Puede realizarse aun si después se retiró la autorización de datos: permite dejar de ofrecer un resultado como vigente. Para volver a publicar se exige una nueva versión, motivo y confirmación; no hay un botón que restaure silenciosamente una copia antigua. La corrección/republicación sí exige consentimiento vigente y una vinculación familiar activa y coherente.

## Vista familiar

Los enlaces existentes conservan el identificador de la publicación. Al abrirlos se consulta la versión vigente, aunque el correo original sea anterior. No se ofrecen versiones antiguas por cambiar un parámetro de URL.

La familia ve un aviso de actualización y el número de versión. Si el resultado está retirado, su listado y el enlace muestran un aviso; la API y la página no entregan medidas, diagnóstico ni recomendaciones retiradas. Los motivos internos y la atribución administrativa no se incluyen en esa respuesta. El historial clínico queda restringido a la autora.

No es posible recuperar una copia ya descargada o un correo que ya llegó al buzón. La página refleja el estado consultado; una pantalla que ya estaba abierta debe actualizarse para consultar el estado nuevo.

## Concurrencia y trazabilidad

Se bloquean evaluación y publicación al cambiar su estado. La revisión de control es independiente de la revisión de medidas: retirar también invalida los formularios antiguos. Dos cambios simultáneos sobre la misma revisión no se pisan; uno se aplica y el otro requiere recargar.

Una solicitud repetida con el mismo identificador y contenido no crea otra versión ni restaura un estado anterior. Reutilizar ese identificador para otro contenido se rechaza. Si la respuesta se pierde, la pantalla conserva el envío exacto para reintentarlo o permite recargar el estado antes de continuar.

Nueva versión, revisión de evaluación, puntero vigente, cancelaciones de correo, motivo y auditoría se guardan en una sola transacción. Si falla el historial, se revierte el cambio completo. La base protege versiones y movimientos contra edición, eliminación y truncado ordinarios; protege también la copia original publicada. Estas protecciones no sustituyen la gestión de credenciales y respaldos: un propietario de la base puede modificar sus controles.

## Correos asociados

Las órdenes de correo llevan número de versión. Al corregir o retirar se cancelan las órdenes bloqueadas, pendientes y reservadas de la versión afectada; el inicial antiguo pendiente/fallido también se detiene. Los registros de mensajes ya aceptados y las incidencias históricas se conservan.

El trabajador comprueba publicación vigente y número de versión antes de enviar, además de permisos, destinatario y reserva. Una respuesta antigua no puede reactivar una orden cancelada. Si un envío ya estaba en curso, puede completarse: se registra esa condición en el cambio y se informa en la pantalla. Si se confirma después, se conserva la aceptación tardía sin convertir la orden cancelada en vigente.

La nueva versión tiene tres órdenes distintas en preparación, con claves nuevas; no reutiliza el cuerpo ni el identificador del correo de otra versión. La corrección no dispara un correo automático ni permite reenviar la copia antigua desde sus botones. Los avisos de corrección y la programación definitiva deben aprobarse en la integración posterior de Brevo, con el calendario y las plantillas. La automatización permanece desactivada.

## Migración y comprobaciones

La migración copia las publicaciones existentes a su versión 1 conservando JSON, autor, revisión y fecha. Asigna versión 1 a las órdenes anteriores, sin cambiar su clave, estado, destinatario ni proveedor y sin generar nuevos envíos. Las tablas de movimientos empiezan vacías. No se recalculan históricos ni se agregan medidas que no fueron registradas.

`npm test` comprueba validación de las solicitudes. `npm run test:families` incluye corrección, retiro, republicación, permisos, aislamiento familiar, idempotencia, pestañas obsoletas, carreras, fallo de auditoría, copias inmutables y cancelación de correos. `npm run test:mail` añade conservación de publicaciones antiguas en la migración, rechazo de versiones reemplazadas y confirmación tardía de mensajes en curso. `npm run test:production` ejecuta los recorridos HTTP sobre la aplicación compilada.

Las comprobaciones utilizan una base temporal y correos simulados. La activación con Brevo y las pruebas de proveedor y despliegue siguen posteriores al punto 7. Las pruebas conjuntas en dispositivos y PostgreSQL real conservan su lugar en ese punto.
