# Ausencias y reincorporación

## Marcar que una familia no respondió

En `/kinesiologia`, la profesional que tiene la atención activa puede pulsar **No respondió al llamado**. Se marca `AUSENTE`, queda libre para llamar al siguiente bebé y la familia desaparece de los candidatos de la fila. La inscripción, el número, el QR y el cupo se conservan.

Solo puede hacerlo quien tiene esa reserva activa. No se marca como ausente a alguien que sigue esperando, a un paciente de otra profesional ni a una atención ya guardada. Si guardar una evaluación y marcar ausencia coinciden, la transacción permite solo una de las dos acciones: no queda una evaluación guardada con el paciente marcado ausente.

Las medidas escritas sin guardar no se guardan al marcar ausencia. El formulario que estaba abierto deja de permitir el guardado; tampoco puede usarse después de la reincorporación o de un nuevo llamado.

**Devolver a la fila** sigue disponible para una familia presente que todavía no puede atenderse y conserva su espera anterior. **No respondió** la retira de espera hasta que recepción confirme que volvió. Son acciones distintas.

## Confirmar que volvió

En `/recepcion`, buscar el número o QR, o abrir el registro desde **Familias ausentes → Revisar regreso**. Verificar con la familia el nombre del bebé y pulsar **Confirmar regreso y reincorporar**.

Se reutiliza la misma entrada de fila y la misma inscripción. La familia conserva la categoría previa o del día, pero vuelve al final de su grupo. El reloj de espera empieza nuevamente desde el regreso: ni el tiempo que estuvo ausente ni la espera anterior al llamado activan de inmediato la prioridad de treinta minutos. La primera llegada queda registrada por separado y no se sobrescribe.

La proporción compartida 3:1 continúa contando llamados. Marcar una ausencia o reincorporar no adelanta ni revierte su contador. Tampoco consume otro cupo ni libera la reserva para una nueva inscripción.

El listado de ausentes tiene páginas de cincuenta registros y se actualiza junto con la fila cada diez segundos mientras la pestaña está visible. Las listas operativas no incluyen diagnósticos, mediciones, RUT, contactos ni identidades profesionales. No se envían notificaciones por correo al marcar ausencia o reincorporar.

## Reintentos e historial

Cada ausencia tiene un identificador de ciclo generado en el servidor. Repetir la acción de ausencia o la reincorporación del mismo ciclo no duplica registros, cambia nuevamente el orden ni vuelve a reiniciar la espera. Si ya comenzó otra atención, repetir una reincorporación anterior no la retira de la profesional. Una pestaña con el identificador de una ausencia anterior no puede reincorporar una ausencia nueva; debe consultar otra vez el registro.

Confirmar llegada mediante el botón ordinario, repetir una inscripción presencial o volver a enviar una inscripción web no reincorpora silenciosamente a una familia ausente: siempre se requiere confirmar su regreso.

`MovimientoFila` conserva una ausencia y una reincorporación por ciclo, con hora y cuenta que realizó cada acción. El actor se toma de la sesión. El historial queda en la base en esta etapa; aún no hay una pantalla de auditoría. Si falla el registro del movimiento, la transacción también revierte el cambio de estado, orden y reloj.

## Permisos y base

- `POST /api/kinesiologia/ausente`: solo `KINESIOLOGO` con la reserva propia vigente.
- `POST /api/recepcion/reincorporar`: solo `RECEPCION`, con inscripción del evento correcto y el identificador de la ausencia actual.
- Administración y familias no heredan esos permisos. Los endpoints exigen JSON y las respuestas son privadas, sin caché.

La migración `20261109000600_ausencias_reincorporacion` incorpora `esperaDesde`, metadatos de ausencia y reincorporación, el historial y sus índices. Inicializa el nuevo reloj con la primera llegada de las entradas existentes, conservando la espera que ya tenían. No cambia sus valores anteriores, números, categorías o cupos; tampoco asigna ausencias retrospectivas. Se ejecuta dentro de una transacción.

Aplicar con `npm run db:deploy`, regenerar con `npx prisma generate` y reiniciar el desarrollo. No usar `db push` ni `migrate reset`.

## Comprobación

`npm test` incluye el reloj de prioridad reiniciado y cursores de fila que pueden superar los cupos tras sucesivas reincorporaciones. `npm run test:families` verifica además la migración con una llegada anterior, permisos, marcado concurrente, reincorporación simultánea, conservación íntegra de la inscripción, repetición de ciclos, formularios obsoletos, carrera con el guardado, autoría, rollback del historial y paginación de ausentes. Usa base y correo locales, sin pacientes reales ni mensajes reales.

Conservar las suites `npm run test:events` y `npm run test:http`, ESLint, TypeScript y validación de Prisma. Ejecutar las suites HTTP por separado y TypeScript al terminar, porque Next regenera los tipos temporales. La compilación de producción conserva la verificación pendiente por la restricción de Turbopack documentada en etapas anteriores.

Verificación de esta etapa: veinte pruebas unitarias, recorrido integral de familias/recepción/kinesiología/presencial/ausencias, suites de eventos y acceso, ESLint, TypeScript y validación Prisma correctos. La migración se aplicó correctamente a la base configurada después del ensayo local, sin agregar pacientes ficticios ni enviar correos reales.

Quedan fuera de esta etapa la cancelación definitiva de reservas, recuperación de cupos y reasignación supervisada de una atención activa.
