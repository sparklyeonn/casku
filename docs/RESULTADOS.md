# Revisión y publicación de resultados

## Kinesiología

Guardar una craneometría crea un **borrador** y finaliza su atención. No publica ni envía el resultado. El botón **Revisar y publicar resultado** del formulario y el menú **Mis resultados** llevan a `/kinesiologia/resultados`.

Cada profesional puede consultar y gestionar las evaluaciones con su autoría verificada. El listado tiene filtros de estado, actualización manual y páginas de veinte elementos. El API permite además filtrar por evento.

En el borrador puede revisar identidad, evento, profesional, medidas, índices, resultado y recomendación, y corregir las cuatro medidas. El servidor conserva las fórmulas existentes y recalcula los índices y el texto; no acepta diagnósticos o autoría enviados por el navegador. Guardar cambios incrementa la revisión y registra la versión anterior, nueva y cuenta responsable. Una recarga explícita recupera la versión guardada y descarta la edición local.

**Publicar resultado y enviar correo** exige la revisión vigente y una vinculación válida con una cuenta familiar activa. La pantalla muestra el correo de destino. Si la evaluación cambió en otra pantalla, debe volver a revisarse antes de publicar. La publicación crea una copia fija de los datos revisados y la orden de correo en una sola transacción.

Una vez publicado no se modifica desde el editor. La corrección de publicaciones mediante una nueva versión auditada, retiro de publicaciones y revisión por otra profesional quedan para una etapa posterior. No se sobrescriben silenciosamente resultados que una familia ya pudo recibir.

## Familias

La cuenta familiar tiene el menú **Resultados publicados** en `/familias/resultados`. Solo aparecen publicaciones de sus bebés, nunca borradores ni evaluaciones de otra cuenta. El detalle muestra las cuatro medidas, índices, resultado, recomendación, profesional y fechas de evaluación y publicación. No muestra RUT, identificadores internos de pacientes o autoría, destinatarios ni metadatos de otras cuentas.

El enlace del correo lleva a ese detalle. Si debe ingresar con un código, se conserva el destino después de la verificación. Solo se admiten destinos internos conocidos; no se utiliza una dirección de redirección libre del navegador.

La autorización comprueba la cuenta activa y la vinculación actual tanto del bebé como de la inscripción, además del propietario de la publicación. Revocar esa propiedad retira el acceso en las consultas posteriores y bloquea nuevos intentos de envío a la cuenta anterior. Las respuestas de API son privadas y no se guardan en caché.

## Correo

El mensaje incluye una copia de las medidas, índices, resultado y recomendación, además del acceso al portal. Se construye desde la copia publicada, con texto y HTML escapado; el asunto no contiene datos clínicos ni nombres del bebé. El destinatario proviene exclusivamente de la cuenta familiar verificada, nunca de `correoPadre`, un campo del navegador o el contacto presencial sin vincular.

El destinatario y el enlace del mensaje quedan fijados al publicar. Antes de enviar se comprueba que la cuenta siga activa y conserve la vinculación. Cambiar una ficha después de publicar no cambia el contenido del mensaje ni el resultado revisado.

Una orden de correo por publicación, reserva temporal de envío y clave de idempotencia del proveedor evitan envíos duplicados durante los reintentos, mientras el proveedor conserve esa clave. Si el envío falla, el resultado sigue publicado y disponible en la cuenta. Familia y autora pueden reintentar desde su detalle; los fallos tienen una pausa mínima de un minuto y los envíos interrumpidos pueden recuperarse tras vencer su reserva de dos minutos.

`ENVIADO` significa que el proveedor aceptó el mensaje, no que llegó al buzón. Aún no hay webhooks de entrega ni un trabajador de reintento programado; la recuperación es manual. La clave de Resend sigue configurada y **el remitente verificado continúa pendiente de Casku**. No se cambió esa configuración ni se enviaron mensajes reales durante las pruebas.

## Históricos y registros presenciales

La migración recupera autoría solo cuando una evaluación está respaldada por una atención finalizada con profesional identificada. No asigna evaluaciones antiguas por coincidencia de nombre y no publica nada automáticamente. Las evaluaciones históricas sin esa evidencia permanecen conservadas, pendientes de un proceso de revisión y vinculación.

Una inscripción presencial sin cuenta familiar puede guardar y revisar su borrador, pero no publicarlo ni enviarlo al correo de contacto. La vinculación está disponible mediante código entregado por recepción y aceptación desde la cuenta verificada (ver VINCULACION.md). Después, la autora recarga el borrador y puede publicarlo. Conocer el correo o RUT no concede propiedad ni habilita un envío clínico.

Recepción y administración no adquieren permiso clínico ni acceso a estos endpoints. No se altera la fila, los cupos, las ausencias o las inscripciones al revisar o publicar.

## Base y comprobación

La migración `20261109000700_publicacion_resultados` añade autoría y revisión a la evaluación, publicaciones, historial de cambios de borrador y órdenes de correo. Conserva los valores clínicos, pacientes e inscripciones existentes. La recuperación de autoría se basa en la relación con atención finalizada y no modifica los nombres profesionales guardados. La migración se ejecuta en una transacción y no envía correos.

Aplicar con `npm run db:deploy`, regenerar con `npx prisma generate` y reiniciar el desarrollo. No usar `db push` ni `migrate reset`.

`npm test` verifica la copia pública sin campos privados, validación de revisiones y destinos de acceso. `npm run test:families` recorre también publicación: migración con evaluación anterior, borradores invisibles a familias, autoría, edición auditada, revisión antigua rechazada, publicación simultánea única, copia inmutable, aislamiento familiar, destinatario verificado, escape de HTML, entrega fallida y reintento, revocación de propiedad, rollback, competencia entre editar y publicar, filtros y paginación. Usa datos y proveedor de correo ficticios locales.

Conservar `npm run test:events`, `npm run test:http`, ESLint, validación de Prisma y TypeScript. Las suites HTTP se ejecutan por separado; TypeScript después de cerrar sus servidores temporales. La compilación de producción mantiene pendiente la comprobación en un entorno donde el proceso de estilos de Turbopack pueda abrir su puerto local, según las etapas anteriores.

Verificación de esta etapa: veintitrés pruebas unitarias, recorrido integral de familias/recepción/kinesiología/presencial/ausencias/resultados, suites de eventos y acceso, ESLint, TypeScript y validación Prisma correctos. La migración se aplicó a la base configurada después del ensayo local, sin cargar pacientes ficticios, publicar evaluaciones existentes ni enviar correos reales.
