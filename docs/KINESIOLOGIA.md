# Kinesiología: llamado y evaluación vinculada

## Recorrido

1. Ingresar con una cuenta individual `KINESIOLOGO` y abrir `/kinesiologia`.
2. Seleccionar el evento. La selección se guarda por cuenta, sin cambiar la de recepción u otras profesionales.
3. Pulsar **Llamar al siguiente**. Se reserva una inscripción `EN_ESPERA` aplicando la regla intercalada 3:1 y la prioridad por espera de treinta minutos, según PRESENCIAL_Y_PRIORIDAD.md. El llamado queda registrado y pasa a `EN_ATENCION`.
4. Confirmar con la familia el número y nombre del bebé. Abrir el formulario de craneometría desde la tarjeta de atención.
5. El formulario existente carga nombre, fecha de nacimiento, RUT si existe y correo del apoderado. Esos campos son de solo lectura. El nombre profesional proviene de la sesión; solo se ingresan las cuatro medidas. Una inscripción presencial puede no tener correo de contacto; esto no impide guardar su evaluación. **Limpiar medidas** conserva los datos del bebé.
6. Guardar crea la evaluación sobre el paciente ya registrado y marca la atención `ATENDIDO` en la misma transacción. No crea otro paciente y admite bebés sin RUT.
7. Volver a **Mi atención** para llamar al siguiente. Los resultados clínicos todavía no se publican ni se envían automáticamente por correo.

Si no puede atenderse todavía, **Devolver a la fila** conserva la hora y orden originales de llegada. Esta acción no guarda mediciones escritas en otra pestaña. Antes de un nuevo llamado, el formulario anterior queda invalidado para guardar. La inscripción no pierde el cupo y recepción no debe confirmarla de nuevo.

La atención se conserva al recargar o volver a ingresar. Seleccionar otro evento no libera una atención activa: debe terminarse o devolverse. No hay vencimiento automático de la reserva ni reasignación por administración en esta etapa. Cada profesional debe usar su propia cuenta.

## Exclusividad, reintentos y permisos

- Solo `KINESIOLOGO` utiliza `/api/kinesiologia/*`. Un formulario vinculado exige que la atención esté asignada a la cuenta que lo abre y que su identificador de reserva siga vigente.
- El evento se bloquea en una transacción para elegir y reservar al siguiente paciente. Un índice único parcial impide dos atenciones activas por profesional, incluso entre eventos distintos. Dos profesionales reciben entradas diferentes.
- Cada petición de llamado tiene una clave UUID persistida en `LlamadaFila`. Repetirla no llama a otro paciente, aunque el primer llamado ya haya finalizado, se haya devuelto a espera o la fila estuviera vacía. La pantalla conserva la clave si no logra confirmar la respuesta.
- Cada nueva asignación rota la reserva. Un formulario antiguo no puede guardar ni devolver una asignación posterior, aunque vuelva a corresponder a la misma profesional.
- El servidor obtiene paciente, apoderado y correo desde la inscripción, y autoría desde la sesión. No confía en identidades, diagnósticos ni índices enviados por el navegador. Conserva las fórmulas y umbrales anteriores y recalcula desde las mediciones.
- Una evaluación por entrada de fila y una transacción de guardado impiden duplicados. El reintento con las mismas medidas devuelve la evaluación existente; medidas distintas generan un conflicto y no sobrescriben el resultado. Un fallo de guardado mantiene la atención activa para reintentar.
- Las respuestas son privadas y no se guardan en caché. Recepción conserva acceso exclusivamente operativo y no recibe datos clínicos.

La ruta anterior `/evaluacion` sin parámetros sigue disponible como **Evaluación sin inscripción** para casos anteriores. Si el RUT corresponde a un bebé vinculado a un apoderado, exige abrir la atención desde la fila. Los resultados antiguos no se asignan retrospectivamente a un evento.

## Alcance pendiente

La fila ya incorpora inscripción presencial, intercalado 3:1 y prioridad al mayor tiempo de espera desde treinta minutos. **No respondió al llamado** permite marcar ausencia y liberar la atención; recepción confirma el regreso y reinicia la espera, conservando la inscripción (ver AUSENCIAS.md). La reasignación supervisada sigue pendiente. Tampoco hay anuncios por voz, pantalla pública ni mensajes automáticos al llamar. El llamado se muestra a la profesional, que avisa a la familia en el evento. Las medidas sin guardar no tienen recuperación automática entre recargas.

## Base y comprobación

La migración `20261109000400_atencion_kinesiologia` añade campos opcionales a fila y evaluación, una tabla de solicitudes y los índices de exclusividad. Conserva los valores de las evaluaciones e inscripciones existentes. No asigna profesionales a filas anteriores ni crea pacientes de prueba en la base configurada.

Aplicar con `npm run db:deploy`, generar el cliente con `npx prisma generate` y reiniciar el desarrollo. No usar `db push` ni `migrate reset`.

`npm run test:families` ahora recorre familias, recepción y kinesiología con PostgreSQL y correo locales: permisos, dos profesionales concurrentes, una atención por profesional entre eventos, datos precargados y privados, bebé sin RUT, devolución y formularios obsoletos, fallos de guardado, reintento sin duplicados, identidad y autoría del servidor, cierre de atención y conservación de los datos anteriores. No usa la base configurada ni envía correos reales. PGlite no sustituye una prueba de carga con PostgreSQL real.

Ejecutar además `npm test`, `npm run test:events`, `npm run test:http`, `npm run lint`, `npx tsc --noEmit` y `npx prisma validate`. Las suites HTTP deben correr por separado porque comparten `.next-tests`. La compilación de producción sigue pendiente de comprobar en un entorno donde el proceso de estilos de Turbopack pueda abrir su puerto local, como se documentó en las etapas anteriores.

Verificación de esta etapa: quince pruebas unitarias, recorrido integral de familias/recepción/kinesiología, suites HTTP de eventos y acceso del equipo, TypeScript, ESLint y validación Prisma correctos. La migración se aplicó correctamente a la base configurada después del ensayo local; no se crearon datos ficticios ni se enviaron correos reales en ella.
