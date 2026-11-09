# Recepción: llegadas y fila

## Uso

1. Ingresar con una cuenta `RECEPCION` y abrir `/recepcion`.
2. Elegir el evento de trabajo. La selección se guarda por cuenta y no cambia el evento de otros recepcionistas ni de administración. No abre ni cierra las inscripciones.
3. Buscar el número de inscripción del evento, escanear el QR con la cámara o usar un lector que escriba el contenido del QR en el campo de búsqueda. El lector puede enviar Enter para buscar.
4. Revisar el nombre del bebé y del apoderado con la familia. Una búsqueda o un escaneo no agrega automáticamente a nadie a la fila.
5. Pulsar **Confirmar llegada y agregar a la fila**. El sistema registra quién confirmó, la hora y un orden de llegada independiente del número de inscripción.
6. Consultar los bebés en espera y sus tiempos de espera. La lista se actualiza cada diez segundos mientras la pestaña está visible; también tiene actualización manual y páginas de cincuenta entradas.

La cámara se solicita únicamente al pulsar el botón; se libera al leer un QR, cerrar el lector o abandonar el evento/pantalla. Requiere permiso del navegador y un contexto seguro: HTTPS o localhost. Entrar desde otro dispositivo con una dirección HTTP de la red local no habilita la cámara; se puede usar el número. Se comprobó la decodificación de un comprobante PNG real mediante el mismo motor QR, pero queda por comprobar la cámara física en los dispositivos del evento.

El número es local al evento. Un QR de otro evento se rechaza sin mostrar sus datos. Una inscripción existente puede recibirse aunque las inscripciones del evento estén cerradas o sus cupos estén completos. Esta etapa no impone una fecha de llegada: recepción debe revisar el nombre y la fecha del evento seleccionado.

## Persistencia y permisos

`EntradaFila` conserva la inscripción, evento, orden, hora, cuenta que confirmó y estado. Solo se crea una entrada por inscripción. Confirmar dos veces, incluso desde cuentas distintas, devuelve la llegada original sin cambiar su hora ni orden y sin consumir otro cupo.

La transacción bloquea el evento, verifica que la inscripción corresponda a él y actualiza el contador junto con la entrada. Si falla, se revierten ambos. Una relación compuesta y restricciones únicas también impiden mezclar eventos o duplicar órdenes en la base.

Las rutas `/api/recepcion/*` exigen `RECEPCION`. Administración y kinesiología no heredan estos permisos. La pantalla y las respuestas no incluyen diagnósticos, evaluaciones, RUT, contactos ni el token QR; muestran únicamente los nombres necesarios para recibir, número y llegada. Los QR viajan en el cuerpo de la búsqueda, no en parámetros de URL. Las respuestas son privadas y no se guardan en caché.

La fila de recepción muestra únicamente `EN_ESPERA` por orden de llegada. Kinesiología ya reserva al siguiente bebé, puede devolverlo a espera y finaliza su atención al guardar (ver KINESIOLOGIA.md). Recepción no puede realizar esas transiciones. No se estima una hora de atención. La inscripción presencial, proporción 3:1 y prioridad por espera están implementadas (ver PRESENCIAL_Y_PRIORIDAD.md). Ausencias y reasignación supervisada siguen pendientes.

## Actualización y pruebas

La migración `20261109000300_recepcion_fila` agrega una tabla, enum, índices, relaciones y un contador al evento. No elimina datos ni modifica pacientes, inscripciones o evaluaciones anteriores. Aplicar con `npm run db:deploy`, regenerar con `npx prisma generate` y reiniciar el desarrollo. No usar `db push` ni `migrate reset`.

`npm run test:families` ahora recorre también recepción con base y correo locales: permisos de todos los perfiles, selección persistida por cuenta, QR PNG decodificado, número repetido en eventos distintos, rechazo de otro evento, llegada concurrente sin duplicados, rollback, paginación y conservación de datos clínicos anteriores. No envía correos reales ni usa la base configurada.

Ejecutar además `npm test`, `npm run test:events`, `npm run test:http`, `npm run lint`, `npx tsc --noEmit` y `npx prisma validate`. Las suites HTTP se ejecutan por separado porque comparten `.next-tests`. PGlite usa multiplexación y no sustituye una prueba de carga con PostgreSQL y dispositivos reales antes del evento.

Verificación de esta etapa: catorce pruebas unitarias, el recorrido integral de familias y recepción, las suites de eventos y acceso del equipo, TypeScript, ESLint y validación de Prisma correctos. La migración se aplicó a la base configurada después del ensayo aislado, sin cargar datos ficticios en ella. La compilación de producción sigue pendiente por la restricción del proceso de estilos de Turbopack documentada en las etapas anteriores; no se repitió ese intento en esta etapa.
