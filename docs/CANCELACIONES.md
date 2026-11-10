# Cancelación de inscripciones y recuperación de cupos

## Dónde y quién puede cancelar

| Perfil | Permiso |
| --- | --- |
| Familia | Sus propias inscripciones, vinculadas también a su bebé, antes de que recepción confirme la llegada. |
| Recepción | Inscripciones sin atención activa ni evaluación guardada, incluidas las que están esperando o ausentes. |
| Administración | Mismo alcance de cancelación operativa que recepción, sin acceso a contenido clínico. |
| Kinesiología | No cancela. Puede devolver una atención a la fila para que recepción gestione la solicitud. |

La familia encuentra **Cancelación de inscripción** en su comprobante de `/familias`. Recepción la encuentra al buscar una inscripción por evento y número o QR. Administración y recepción también pueden usar **Datos de familias**, consultar la inscripción y cancelar desde allí.

Se exige un motivo administrativo de entre 10 y 300 caracteres y confirmar explícitamente la cancelación. El motivo queda visible para la familia; no incluir información clínica. La pantalla consulta si todavía puede cancelarse y el servidor vuelve a comprobarlo al guardar. **Actualizar estado** permite recuperar la situación actual si empezó una atención durante el trámite.

No se permite cancelar una atención en curso, una inscripción atendida o una que ya tenga evaluación guardada, aunque el resultado no esté publicado. No se libera capacidad de una atención efectivamente realizada. Si el comprobante se está enviando, primero debe terminar ese envío y luego se reintenta la cancelación.

## Qué cambia y qué se conserva

La cancelación libera exactamente un cupo y registra `CancelacionInscripcion` con responsable, perfil, nombre al cancelar, momento, motivo, estado anterior de fila y estado anterior de correo. El registro es único por inscripción.

No se elimina la inscripción ni se modifica su ID, bebé, propietario, número, QR, origen o fecha de creación. Las fichas, correcciones previas, evaluaciones, publicaciones, llamadas y movimientos de ausencia permanecen. Si existía una entrada en espera o ausente, pasa a `CANCELADO`, conservando sus datos anteriores; el historial registra su estado anterior. No avanza la proporción de turnos ni altera el orden de otras familias.

`Evento.inscritos` cuenta reservas vigentes. La cancelación lo disminuye una sola vez; nunca disminuye `ultimoNumero` ni reutiliza números. Una persona diferente que ocupa la capacidad recuperada recibe el siguiente número del evento, no el del comprobante cancelado. Cancelar no abre un formulario cerrado: se conserva el estado de apertura y la habilitación presencial del evento.

El cambio de estado, auditoría, retiro de la fila, detención de correo y devolución de capacidad ocurren en la misma transacción, bajo el bloqueo de evento usado por inscripciones, llamados y cambios de capacidad. Dos solicitudes simultáneas producen una cancelación, no dos cupos libres. Un fallo de auditoría revierte todo. Si una inscripción compite con la cancelación por el último cupo, el orden de las operaciones determina si puede reservar o debe reintentar, sin sobreventa.

## Comprobantes antiguos, correos y vinculación

- El número y QR almacenados se conservan como referencias históricas. Buscar el QR anterior en recepción muestra la cancelación; no confirma llegada ni reincorpora a la fila. La cuenta familiar ya no muestra un QR de ingreso para la reserva cancelada.
- Los reintentos de inscripción web o registro presencial no reactivan una reserva cancelada ni crean otra ficha para saltarse la cancelación. La reactivación y una nueva reserva del mismo bebé en el mismo evento requieren un flujo posterior de revisión; no están habilitadas en esta entrega. El bebé sí puede inscribirse en otro evento.
- La orden de confirmación pasa a `CANCELADO`. Conserva intentos, ID de proveedor y fecha de envío anterior si existían, pero no admite nuevos reintentos. Cancelar no retira un mensaje ya aceptado por el proveedor ni envía un aviso de cancelación.
- Se revocan los códigos de vinculación aún pendientes y no se emiten otros para esa inscripción. Las cuentas y vinculaciones ya aceptadas se conservan para el historial y los demás eventos.
- El contacto de una inscripción cancelada se conserva como historial y no prepara nuevos correos al editarse. Las correcciones de la ficha permanente y del perfil compartido siguen teniendo su propio permiso y auditoría.

La cancelación no borra el comprobante de la cuenta familiar: muestra fecha, responsable y motivo. El resumen administrativo muestra **Inscritos** vigentes y **Canceladas** por separado. En espera y ausentes excluyen las canceladas; no se cuentan como personas que todavía no llegan.

La capacidad del evento puede reducirse hasta las reservas vigentes, incluso si hay inscripciones canceladas en el historial. Su fecha sigue protegida mientras existan inscripciones históricas: cancelar a todas las familias no convierte el mismo evento en uno reutilizable para otra fecha.

## API y autorización

`GET /api/inscripciones/[id]/cancelacion?eventoId=…` consulta elegibilidad e historial. `POST` recibe `eventoId` y `motivo`. La identidad y el perfil se toman de la sesión, no del cuerpo. Familia ajena o inscripción fuera del evento devuelven 404; visitantes 401 y kinesiología 403. Repetir una cancelación autorizada devuelve la cancelación existente y no modifica el primer responsable ni su motivo.

Las respuestas son privadas y sin caché. No se devuelve contenido clínico: las comprobaciones internas solo determinan si hay atención o evaluación que impide cancelar.

## Migración y comprobaciones

`20261110000300_cancelacion_inscripciones` añade el historial y los estados `CANCELADO` de fila y correo. No cancela reservas existentes, no recalcula ni libera sus cupos y no modifica fichas o evaluaciones. Aplicar con `npm run db:deploy`, regenerar con `npx prisma generate` y reiniciar desarrollo. No usar `db push` ni `migrate reset`.

`npm test` valida el motivo. `npm run test:families` ensaya migración conservando una reserva y ausencia anteriores; permisos, propiedad familiar, cancelaciones simultáneas, auditoría única, QR/reingreso antiguos, cupo recuperado y numeración siguiente, reducción de capacidad, fecha histórica protegida, ausencias, atención/evaluación protegidas, envío en curso, rollback, inscripción y llamado simultáneos, y vinculación revocada. Se conservan las suites de eventos y acceso, TypeScript, ESLint y validación de Prisma.

Los ensayos usan PostgreSQL temporal y correo ficticio; no sustituyen una prueba de carga con PostgreSQL real. Ejecutar las suites HTTP por separado y TypeScript al finalizar. La compilación de producción mantiene la comprobación pendiente del proceso auxiliar de estilos de Turbopack documentada en las etapas anteriores.
