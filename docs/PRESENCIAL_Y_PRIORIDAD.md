# Inscripción presencial y fila intercalada

## Inscribir en recepción

La sección **Inscripción presencial** de `/recepcion` se habilita el día del evento según `America/Santiago`. Recepción puede registrar aunque el formulario web esté cerrado. Ambos canales comparten el total de cupos: una reserva previa sigue ocupando su cupo aunque la familia aún no haya llegado. No se sobrevende ni se reutilizan cupos de ausentes automáticamente.

Se ingresan nombre y fecha de nacimiento del bebé y nombre del apoderado. RUT del bebé, teléfono y correo son opcionales. **Registrar y confirmar llegada** guarda paciente, inscripción, cupo, número y entrada de fila en una sola transacción. El número comparte la secuencia del evento con las inscripciones web. Se muestra un comprobante QR descargable y se intenta enviar por correo si se proporcionó una dirección.

Antes de registrar, buscar el comprobante de quien ya esté inscrito. Si coinciden bebé (nombre normalizado y fecha de nacimiento) y apoderado dentro del evento, el sistema conserva la inscripción y confirma su llegada sin consumir otro cupo. Nunca cambia su clasificación previa. Datos ambiguos o un RUT ya existente que no coincide con esa inscripción exigen revisión; no vinculan automáticamente historias de otros eventos. No se sobrescriben contactos de cuentas familiares existentes.

La clave de envío y las restricciones de la base evitan cupos o entradas duplicadas. Ante una respuesta incierta, el formulario permite reintentar el mismo registro conservando su clave y bloquea la edición de los datos hasta recuperar el resultado. Un fallo de guardado revierte todas las operaciones. Un fallo de correo conserva el registro y la fila; puede reintentarse el correo respetando el intervalo del servicio existente.

El remitente verificado de Casku sigue pendiente. Sin remitente no se envían correos reales; el registro presencial funciona y conserva el comprobante en recepción. No proporcionar correo tampoco impide atender y guardar la craneometría: `correoPadre` puede quedar nulo en estas nuevas evaluaciones. Las evaluaciones anteriores conservan sus valores.

## Contacto y acceso familiar

El contacto anotado por recepción es independiente de una cuenta verificada. No se crea un apoderado ni se asigna el bebé a una cuenta existente por conocer un correo o RUT. Por eso un registro presencial nuevo no aparece automáticamente en el portal de una cuenta que tenga ese correo. La vinculación posterior requiere un flujo adicional de revisión de identidad, todavía pendiente.

La inscripción presencial sin cuenta guarda nombre, correo opcional y teléfono del contacto, junto con la cuenta de recepción que la registró. Los QR de recepción y los reintentos de correo exigen sesión `RECEPCION` y el evento correcto. Las listas operativas siguen sin devolver RUT, contactos o datos clínicos. El correo de una inscripción sin cuenta invita a conservar el comprobante y consultar a recepción, sin prometer acceso al portal familiar.

## Regla compartida de llamado

Las inscripciones se clasifican en el servidor:

- **PREVIA:** inscripción web realizada antes de la fecha del evento. Las inscripciones existentes antes de esta migración conservan esta categoría.
- **PRESENCIAL / inscripción del día:** nueva inscripción en recepción o por la web el mismo día del evento. El visitante no puede elegir o falsificar la prioridad. Esta categoría incluye los dos canales del día; no significa necesariamente que la inscripción se hiciera en el mesón.

Solo participan llegadas confirmadas y en estado `EN_ESPERA`.

1. Si alguien lleva **30 minutos o más**, el próximo llamado prioriza al de mayor espera entre ambos grupos. Empates se resuelven por orden de llegada.
2. Si nadie alcanzó ese umbral y ambos grupos esperan, se llaman **tres previas y una del día**.
3. Si solo espera un grupo, se continúa con él; nunca se deja libre a una profesional para esperar al otro grupo. El contador de previas queda como máximo en tres para que una nueva inscripción del día tenga el siguiente turno disponible.

El contador es persistente por evento y compartido entre todas las profesionales. Se actualiza únicamente al reservar una nueva atención; revisar la fila, recuperar una atención activa o repetir un envío no lo avanza. El bloqueo de evento y la exclusividad por profesional conservan las garantías de la etapa de kinesiología.

Devolver un bebé a espera mantiene su hora y orden originales. No revierte el contador: la proporción cuenta llamados, no evaluaciones terminadas. Una espera ya larga conserva su prioridad al reincorporarse mediante esa devolución.

Los treinta minutos son un umbral de prioridad, **no una espera máxima garantizada**: la regla se aplica al liberarse una profesional, sin interrumpir atenciones. Si hay más demanda que capacidad, varias familias pueden superar ese tiempo. No estima una hora de atención.

## Pantallas

Recepción y kinesiología muestran la misma regla, el recuento de ambos grupos y un **Próximo previsto** con el motivo de prioridad. La vista es informativa y puede cambiar si otra profesional llama o una espera alcanza treinta minutos. La asignación efectiva se decide nuevamente dentro de la transacción de llamado.

La lista paginada de recepción conserva el orden de llegada y etiqueta cada inscripción. No presenta ese orden visual como una posición fija de atención; el próximo previsto refleja la regla intercalada incluso si corresponde a otra página. El formulario familiar también identifica las inscripciones del día.

## Migración y pruebas

`20261109000500_presencial_fila_intercalada` añade la clasificación, contactos presenciales, autoría de registro y contador de prioridad. Hace opcional el apoderado de la inscripción y el correo de la evaluación. Las relaciones existentes se conservan; no se borran ni reasignan pacientes, inscripciones o evaluaciones. Las restricciones exigen un contacto y autoría para inscripciones nuevas sin cuenta y mantienen el contador entre cero y tres.

Aplicar con `npm run db:deploy`, regenerar con `npx prisma generate` y reiniciar el desarrollo. No usar `db push` ni `migrate reset`.

`npm test` verifica secuencia 3:1, umbral exacto de treinta minutos, prioridad de mayor espera, desempates, grupos vacíos y validación de registro presencial. `npm run test:families` recorre además: dos profesionales compartiendo proporción, mismo número y QR tras reintentos, permisos, contactos sin apropiarse de una cuenta, cupos previos protegidos, último cupo disputado entre web y recepción, clasificación web del día, fallos transaccionales, correo recuperable y evaluación sin correo. Usa base y proveedor de correo locales; no utiliza la base configurada ni envía mensajes reales.

Se conservan las comprobaciones `npm run test:events`, `npm run test:http`, `npm run lint`, `npx tsc --noEmit` y `npx prisma validate`. Ejecutar las suites HTTP por separado. Antes del evento, probar dispositivos y carga con PostgreSQL real; PGlite no reproduce toda su concurrencia. La compilación de producción conserva la verificación pendiente por la restricción de Turbopack documentada en etapas anteriores.

Verificación de esta etapa: diecinueve pruebas unitarias, recorrido integral de familias/recepción/kinesiología/presencial, suites HTTP de eventos y acceso, TypeScript, ESLint y validación Prisma correctos. Ejecutar TypeScript después de cerrar los servidores temporales, ya que Next regenera sus archivos de tipos al iniciar. La migración se aplicó a la base configurada después del ensayo local, sin introducir datos ficticios ni enviar correos reales.

## Fuera de esta etapa

No se agregaron reasignación supervisada, cancelación de reservas, recuperación de cupos de ausentes, lista de espera con evento lleno ni vinculación de registros presenciales al portal familiar. La política 3:1 y el umbral de treinta minutos son constantes del sistema en esta entrega; aún no se editan por evento desde administración.
