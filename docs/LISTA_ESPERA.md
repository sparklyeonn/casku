# Lista de espera de cupos

Las familias con correo verificado pueden solicitar un cupo para cada bebé cuando un evento abierto está lleno. Los eventos llenos siguen visibles en `/inscripcion`, con acceso a la lista desde `/familias`. Si aún hay solicitudes pendientes, una vacante sigue reservada a la lista antes de ofrecerse a inscripciones nuevas.

## Funcionamiento

1. La familia elige evento y bebé existente o registra otro. Debe aceptar expresamente que la reserva se confirme automáticamente al llegar su turno. No hay un plazo posterior para aceptar una oferta.
2. La solicitud recibe un orden permanente, generado bajo bloqueo del evento. No consume capacidad, no genera número de inscripción ni QR y no agrega al bebé a la fila de atención. La cuenta muestra su posición actual entre las solicitudes pendientes.
3. Al cancelar una inscripción, el mismo cambio transaccional libera el cupo y confirma la primera solicitud elegible. También se procesa la lista al aumentar capacidad, abrir inscripciones, guardar una solicitud o retirarse de la lista. Las inscripciones nuevas web y presenciales no pueden adelantar solicitudes pendientes.
4. La reserva confirmada reutiliza la ficha y la cuenta verificadas. Genera el siguiente número de inscripción del evento y un QR normal; aparece en Mis inscripciones y se prepara un correo de confirmación que explica su origen en la lista.
5. La familia todavía debe confirmar su llegada en recepción. La categoría previa/del día se determina por el día de confirmación del cupo, según Chile. La prioridad clínica sigue la política 3:1 existente; el orden de espera de cupos no determina el orden de atención.

Cerrar el formulario impide nuevas solicitudes, pero conserva el compromiso con quienes ya esperan: sus cupos pueden confirmarse hasta finalizar el día del evento. No se asignan cupos para eventos pasados. Las solicitudes históricas se conservan; una familia puede retirar una pendiente aunque el formulario esté cerrado.

## Retirada, historial y permisos

Una familia solo consulta y retira sus propias solicitudes pendientes. La retirada queda registrada, no borra al bebé y no cancela otras reservas. Si vuelve a anotarse, ocupa un nuevo lugar al final. Repetir un envío no crea solicitudes, fichas ni números adicionales. Una solicitud por bebé y evento puede estar pendiente a la vez, con índice único parcial en PostgreSQL.

Una solicitud asignada conserva su relación con la inscripción. Para liberar ese cupo se cancela la inscripción desde su comprobante, con los permisos y controles existentes. No se reactiva una inscripción cancelada del mismo bebé y evento desde la lista.

Administración y recepción consultan la lista del evento seleccionado, pendientes e historial, nombre del bebé y contacto familiar. Pueden procesar capacidad disponible por orden, pero no seleccionar ni adelantar personas. Kinesiología no accede a esta gestión. Las familias no ven solicitudes ni contactos ajenos; las respuestas de cancelación tampoco revelan a quién se asignó el cupo liberado.

Si la cuenta está inactiva, la vinculación del bebé cambió o ya hay una inscripción del mismo bebé en el evento, la solicitud se registra como no elegible, con fecha, motivo y origen de la resolución. No se cambian propietarios ni se fusionan fichas para asignar el cupo. Se continúa con la siguiente solicitud elegible.

La fecha de un evento con solicitudes históricas queda protegida, igual que cuando ya tiene inscripciones. Nombre, lugar y capacidad siguen los permisos, revisiones y auditoría existentes. Los correos toman una copia de los datos vigentes al confirmar la reserva, que se conserva para sus reintentos.

## Recuperación y correo

El correo se intenta después de confirmar la transacción. Un error de envío no revierte el cupo ni lo entrega a otra familia: la orden queda guardada y admite el reintento del comprobante. El remitente verificado sigue pendiente de Casku; no se omite la verificación de cuenta ni se inventa un remitente.

El procesamiento usa transacciones cortas por lotes. Las cancelaciones asignan dentro de su transacción y después recuperan capacidad restante; las ampliaciones guardan primero la configuración y luego procesan la lista. Ante un fallo posterior, solicitudes y orden se conservan y ninguna inscripción nueva los adelanta. Recepción y administración tienen **Procesar cupos disponibles** para recuperar vacantes pendientes. No hay tarea programada de correo ni trabajador permanente en esta etapa. Un lote de recuperación procesa hasta 400 solicitudes; si aún quedan vacantes y pendientes puede repetirse. Las pantallas consultan cambios cada quince segundos mientras están visibles.

## API y migración

- `GET/POST /api/familias/lista-espera`: solicitudes propias paginadas / alta con los datos habituales de inscripción y `aceptaAsignacion: true`.
- `POST /api/familias/lista-espera/[id]/retirar`: retirada propia idempotente; una asignada requiere cancelar su inscripción.
- `GET/POST /api/lista-espera/[eventoId]`: consulta paginada / procesamiento FIFO para administración y recepción.

La migración `20261110000400_lista_espera` añade solicitudes, estados, contador de orden e índices y restricciones. No modifica reservas, cancelaciones, fichas, evaluaciones, fila ni órdenes de correo anteriores; tampoco anota ni asigna familias automáticamente durante la migración. Aplicar con `npm run db:deploy`, regenerar Prisma y reiniciar desarrollo.

`npm run test:families` incluye migración conservadora, consentimiento, aislamiento, FIFO, idempotencia, retirada y regreso al final, cancelación y ampliación, comprobante privado, correo fallido recuperable, bloqueo de adelantamientos, cancelaciones simultáneas, elegibilidad y rollback completo ante fallo de asignación. Se utilizan exclusivamente base y correo simulados locales. Las suites HTTP se ejecutan secuencialmente y TypeScript después de detenerlas. La compilación de producción conserva la comprobación pendiente de Turbopack documentada en etapas anteriores.
