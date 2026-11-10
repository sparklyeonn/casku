# Resumen administrativo por evento

En `/administracion`, seleccionar un evento con **Trabajar en este evento**. Debajo de sus datos aparece **Resumen del evento**. Crear un evento lo selecciona y muestra sus totales iniciales en cero. La selección sigue siendo individual por cuenta.

## Qué cuenta cada indicador

| Indicador | Criterio |
| --- | --- |
| Inscritos | Reservas vigentes del evento, previas y presenciales, con o sin cuenta familiar vinculada. Excluye canceladas. |
| Canceladas | Inscripciones canceladas, con cupo liberado y conservadas como historial. |
| Atendidos | Inscripciones cuya entrada está actualmente en `ATENDIDO`, estado que se asigna al guardar su evaluación. |
| En espera | Inscripciones con llegada confirmada y entrada actualmente en `EN_ESPERA`. |
| Ausentes | Inscripciones actualmente en `AUSENTE`, hasta que recepción confirme su regreso. |
| Pendientes de publicación | Evaluaciones guardadas y asociadas a una entrada de ese evento que no tienen publicación. Incluye borradores que esperan vinculación familiar o revisión de autoría. |
| Sin llegada confirmada | Inscripciones del evento que aún no tienen entrada en la fila. |
| En atención | Inscripciones actualmente reservadas por una profesional (`EN_ATENCION`). |
| Resultados publicados | Evaluaciones del evento con publicación, independientemente del estado de su correo. |

La unidad de atención es una inscripción por bebé. Una familia con dos bebés representa dos inscripciones; no se intenta deducir familias únicas a partir de un correo o nombre de contacto. Inscritos vigentes es la suma de sin llegada, en espera, en atención, atendidos y ausentes. Las canceladas se muestran por separado.

Los pendientes de publicación forman parte de las evaluaciones guardadas; no se suman a los estados de fila. No significan que todos puedan publicarse inmediatamente. Un correo fallido no convierte un resultado publicado en pendiente de publicación. Las evaluaciones sin inscripción no se atribuyen a un evento por coincidencia de bebé, profesional o fecha.

Las ausencias muestran el estado actual, no la cantidad histórica de llamados sin respuesta: reincorporar disminuye ausentes y aumenta en espera sin aumentar inscritos. Las mediciones repetidas del mismo bebé en otros eventos se cuentan únicamente donde corresponde su inscripción.

## Actualización y privacidad

La pantalla consulta cada quince segundos mientras está visible, al volver a ella y mediante **Actualizar resumen**. Al cambiar de evento se cancela la consulta anterior y se presenta el nuevo resumen sin reutilizar los totales del anterior. La lista de eventos conserva su actualización independiente mediante **Actualizar lista**.

Se muestra la hora de la última consulta en horario de Chile. Si una actualización falla se conserva la última lectura con una advertencia; si no existe lectura anterior se informa que los totales no están disponibles, sin presentar ceros como si fueran datos reales.

`GET /api/eventos/[id]/resumen` exige una cuenta administradora activa. Familias y visitantes reciben 401; recepción y kinesiología reciben 403. Un identificador inválido produce 400 y un evento inexistente, 404. El resumen solo expone ID/nombre/cupos del evento, contadores y hora de consulta. No devuelve nombres de pacientes o apoderados, contactos, QR, medidas, diagnósticos ni listados clínicos. Administración conserva sus permisos operativos y no adquiere permiso clínico.

Los contadores se calculan desde las relaciones persistidas dentro de una transacción `RepeatableRead` para consultar una sola instantánea. El total de inscritos proviene de las inscripciones reales, sin depender del contador auxiliar del evento. Las respuestas son privadas y sin caché. Consultar no modifica selecciones, filas, publicaciones ni correos.

## Comprobaciones

No requiere migración ni cambios de configuración. `npm run test:families` incorpora casos de evento vacío, todos los estados de atención, dos bebés de una familia, ambos orígenes de inscripción, varios ciclos de ausencia, reincorporación, evaluación sin cuenta vinculada, publicación, un mismo bebé en dos eventos, evaluaciones sin inscripción, permisos, privacidad y consultas sin efectos secundarios. Usa PostgreSQL temporal y correo ficticio, sin utilizar la base configurada.

Se mantienen las suites de eventos y acceso, TypeScript y ESLint. Ejecutar las suites HTTP por separado y TypeScript al terminar. La compilación de producción conserva la verificación pendiente por la restricción del proceso auxiliar de estilos de Turbopack documentada en las etapas anteriores.
