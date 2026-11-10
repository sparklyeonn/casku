# Edición de eventos

En **Administración → Eventos**, usar **Editar evento** en la lista. La pantalla permite corregir nombre, fecha, lugar y cupos sin cambiar el evento seleccionado de ninguna cuenta. Solo una cuenta administradora activa puede utilizar `PATCH /api/eventos/[id]`.

## Reglas de edición

| Campo | Control |
| --- | --- |
| Nombre y lugar | Se pueden corregir con inscripciones existentes. El portal muestra los datos actuales; las copias ya publicadas y los correos de confirmación preparados conservan su versión. |
| Fecha | Solo puede cambiarse sin inscripciones y con las inscripciones cerradas. La nueva fecha debe ser hoy o un día futuro en Chile. La fecha permanece como día calendario, sin conversión horaria. Tener solo inscripciones canceladas tampoco permite cambiarla. |
| Cupos | Entero entre 1 y 100.000. Nunca puede ser menor que las reservas vigentes (excluyendo canceladas): se comprueba tanto el contador del evento como el número real de inscripciones. Puede quedar exactamente lleno. |

Las reservas previas todavía sin llegada también consumen cupo. Editar no cancela ni elimina inscripciones, no renumera, no modifica QR, origen, estado/orden de fila, bebés, evaluaciones, publicaciones ni selección de trabajo. No abre ni cierra inscripciones automáticamente.

Si el formulario muestra la fecha bloqueada porque las inscripciones están abiertas, cerrarlas desde la lista y usar **Descartar cambios y recargar datos**. El servidor vuelve a comprobar todas las condiciones: si una familia se inscribió mientras se editaba, se rechaza el cambio de fecha o una reducción incompatible de capacidad.

Guardar correcciones no envía avisos a las familias. Casku debe comunicar los cambios de nombre o lugar por su canal acordado. No se habilita una reprogramación masiva de eventos con familias inscritas en esta entrega.

## Concurrencia y recuperación

Cada evento tiene una revisión de configuración. Se incrementa al editar y al abrir/cerrar inscripciones, pero no al registrar llegadas, reservar cupos o atender pacientes. Así, la actividad normal del evento no invalida innecesariamente el formulario.

Guardar exige la revisión leída. Si otro administrador cambió los datos, el servidor responde con conflicto y la pantalla conserva los cambios escritos hasta que la persona decida recargar o cancelar. Un reintento cuyo contenido ya coincide con el evento devuelve el estado actual, sin duplicar revisión ni auditoría. Una edición antigua no puede restaurar valores que fueron reemplazados posteriormente.

La edición comparte el bloqueo de la fila `Evento` con las inscripciones previas/presenciales y la apertura/cierre. Esto protege el último cupo frente a reservas concurrentes. Cambiar los campos y registrar la auditoría ocurre en una misma transacción: un fallo revierte ambos.

`CambioEvento` conserva actor, hora, revisión y valores anteriores/nuevos de los datos públicos y contadores del evento. El actor proviene de la sesión. La consulta visual de esta auditoría sigue pendiente. La API ignora contadores, estado de apertura y actor enviados en el formulario, y usa el ID de la ruta como evento de destino. Las respuestas son privadas y sin caché.

## Correos y resultados anteriores

`CorreoInscripcion.datosEvento` fija nombre, fecha y lugar al crear la orden de confirmación. Los reintentos conservan estos datos y la clave de idempotencia del proveedor aunque el evento se corrija después. Para órdenes antiguas, la migración fija sus datos actuales antes de habilitar ediciones; no cambia ID, estado, intentos ni identificador de envío.

Las confirmaciones futuras de nuevas inscripciones usan la información corregida. Los comprobantes consultados en el portal muestran el evento actual y conservan su número y QR. Los resultados publicados mantienen su copia inmutable, incluido el nombre del evento al publicar; las nuevas publicaciones usan los datos vigentes al publicarse. Editar no vuelve a publicar ni reenvía resultados.

## Migración y verificación

`20261110000100_edicion_eventos` añade revisión al evento, la tabla de cambios y la copia pública del evento en las órdenes de confirmación existentes. Conserva pacientes, evaluaciones, inscripciones, filas y estados de correo. Aplicar con `npm run db:deploy`, ejecutar `npx prisma generate` y reiniciar desarrollo; no usar `db push` ni `migrate reset`.

`npm test` verifica entradas de edición y copia de datos de correo. `npm run test:families` ensaya migración sobre un evento y correo anteriores, permisos, campos ignorados, fecha protegida, mínimo de reservas, formularios antiguos, ediciones simultáneas, reintentos, inscripciones y selección conservadas, correo con cuerpo estable tras editar, publicaciones inmutables, reducción de capacidad frente a una inscripción y rollback de auditoría. Usa PostgreSQL temporal y correo ficticio, sin enviar mensajes reales.

Las consultas de verificación de la suite familiar también pasan por el servidor local de pruebas para no entrar directamente en una transacción de PGlite todavía en curso; las fechas sin zona se interpretan como UTC, igual que en la aplicación. PGlite no sustituye el ensayo de carga/concurrencia con PostgreSQL real.

Conservar las suites de eventos y acceso, ESLint, TypeScript y validación de Prisma. Ejecutar las suites HTTP por separado y TypeScript al terminar. La compilación de producción mantiene la verificación pendiente del proceso auxiliar de estilos de Turbopack documentada en etapas anteriores.
