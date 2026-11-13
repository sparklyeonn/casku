# Casku · Atención y eventos

Web de craneometrias, para expo niño y bebé.

Administración permite crear eventos con nombre, fecha, lugar y cupos, y seleccionar el evento de trabajo por cuenta. También permite abrir o cerrar inscripciones. Las familias verifican su correo, eligen evento y registran a sus bebés; reciben un número por evento y un comprobante con QR. Recepción busca por número o QR, confirma llegadas y consulta la fila de espera.

## Uso local

1. Usar la versión de Node indicada en `.nvmrc` (`nvm use`, si se utiliza nvm). Instalar dependencias con `npm ci` si no existen.
2. Configurar `DATABASE_URL` con la conexión existente y comprobar el destino. Para habilitar las tablas de eventos e inscripciones ejecutar `npm run db:deploy` y `npx prisma generate`. La nueva migración conserva los registros anteriores, añade relaciones opcionales al paciente y permite bebés sin RUT.
3. En una instalación nueva, ejecutar `npm run account:create` para preparar al menos una cuenta administradora. Tras el primer ingreso, gestionar el equipo desde **Administración → Cuentas del equipo**. Ver [CUENTAS_EQUIPO.md](docs/CUENTAS_EQUIPO.md).
4. Configurar `AUTH_SECRET`, `AUTH_URL`, `RESEND_API_KEY` y `RESEND_FROM` en la configuración privada. Casku informó `contacto@casku.cl` y utiliza Brevo; la integración y verificación se realizarán después del punto 7. El transporte anterior sigue en código. Sin un transporte y remitente configurados no se envían códigos ni se permite omitir la verificación.
5. Ejecutar `npm run dev`. Administración abre inscripciones desde `/administracion`; las familias comienzan en `/inscripcion` y consultan sus comprobantes en `/familias`.

Perfiles disponibles: `KINESIOLOGO`, `RECEPCION`, `ADMIN`. No hay contraseñas de demostración. Las cuentas se guardan en la base. La lista privada de `.env.local` se usa solo para la importación inicial.

## Verificación

- `npm test`: contraseñas, permisos, cuentas y validación de evaluaciones.
- `npm run test:security`: límites de acceso y sesiones del equipo con dos servidores simultáneos y base temporal. No utiliza datos reales.
- `npm run test:http`: inicio/cierre de sesión y permisos mediante servidor temporal en el puerto 3117, con cuentas efímeras y PostgreSQL local temporal. No utiliza la base configurada ni envía correos.
- `npm run test:events`: migración y gestión de eventos con PostgreSQL temporal aislado. No utiliza la base real de Casku.
- `npm run test:families`: acceso por código, inscripciones, cupos, aislamiento familiar, QR, correo, recepción y kinesiología (llegadas, reservas, formularios, guardado y permisos), publicación de resultados, vinculación presencial, gestión de cuentas del equipo, resumen y edición de eventos y corrección de datos familiares, cancelaciones y lista de espera FIFO, con base y proveedor locales ficticios. No envía correos reales. Ejecutar las pruebas HTTP por separado.
- `npm run test:mail`: planificación, reintentos, recuperación y eventos de correo con base y transporte ficticios.
- `npm run test:production`: compila una copia aislada y reutiliza permisos y recorridos familiares sobre el servidor de producción, con base y correo temporales.
- `npm run check`: ejecuta todas las comprobaciones anteriores en serie y termina verificando los tipos.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` (incluye generación del cliente Prisma).

Consulta [el plan de implementación](docs/IMPLEMENTACION.md) para conocer el alcance, las etapas pendientes y las condiciones antes de publicar.

La [gestión de eventos](docs/EVENTOS.md) describe el modelo, la selección por administrador y cómo se relacionarán las futuras inscripciones y la fila.

Consulta [la inscripción familiar](docs/FAMILIAS.md) para configurar el correo y conocer los límites de esta etapa.

Consulta [recepción y fila](docs/RECEPCION.md) para confirmar llegadas, usar la cámara y consultar las familias en espera.

La vista de [kinesiología](docs/KINESIOLOGIA.md) permite llamar al siguiente bebé, reservar su atención y abrir el formulario con los datos registrados. Guardar finaliza la atención sin enviar resultados automáticamente.

La [inscripción presencial y prioridad](docs/PRESENCIAL_Y_PRIORIDAD.md) permite registrar en recepción el día del evento, compartir cupos y llamar tres previas por una del día, con prioridad por espera desde treinta minutos.

La [gestión de ausencias](docs/AUSENCIAS.md) permite marcar a quien no responde y reincorporarlo desde recepción con la misma inscripción, reiniciando su espera al regresar.

La [publicación de resultados](docs/RESULTADOS.md) incorpora revisión de borradores, publicación explícita, consulta en la cuenta familiar y correo con reintento. Las inscripciones presenciales sin vinculación verificada quedan pendientes de ese proceso antes de publicar resultados clínicos.

La [vinculación presencial](docs/VINCULACION.md) permite que recepción entregue un código a la familia y que esta acepte desde su cuenta verificada, conservando bebé, inscripción, fila y evaluaciones.

La [gestión de cuentas](docs/CUENTAS_EQUIPO.md) permite crear y editar usuarios del equipo, asignar perfiles, desactivar accesos y cambiar contraseñas desde administración, con revocación de sesiones y auditoría.

El [resumen administrativo](docs/RESUMEN_ADMINISTRATIVO.md) muestra por evento inscritos, atendidos, en espera, ausentes y resultados pendientes de publicación, con actualización automática y contadores complementarios, sin exponer datos clínicos.

La [edición de eventos](docs/EDICION_EVENTOS.md) permite corregir nombre, lugar y capacidad, y cambiar la fecha antes de recibir inscripciones, con revisión de conflictos y auditoría. Conserva números, QR, fila y copias ya preparadas de confirmación.

La [corrección de datos familiares](docs/CORRECCION_DATOS.md) permite a recepción y administración corregir identidad y contactos con motivo e historial, conservando fichas, inscripciones y evaluaciones. El correo de acceso verificado permanece protegido.

La [cancelación de inscripciones](docs/CANCELACIONES.md) permite liberar capacidad con permisos y motivo, conservando número, QR e historial. Bloquea reingresos con comprobantes cancelados y protege las atenciones y evaluaciones existentes.

La [lista de espera](docs/LISTA_ESPERA.md) permite solicitar cupos en eventos llenos, consultar posición y retirarse; las cancelaciones y ampliaciones confirman reservas por orden, con número, QR y correo recuperable.

La [seguridad del equipo](docs/SEGURIDAD_EQUIPO.md) incorpora límites compartidos, sesiones con vencimiento y cierre remoto, y revocación administrativa auditada.

El [listado prioritario de pendientes](docs/PENDIENTES.md) distingue las entregas implementadas de la validación final para producción.

La [privacidad y las autorizaciones](docs/CONSENTIMIENTO_PRIVACIDAD.md) incorpora opciones separadas para datos, resultados y seguimiento, retirada desde la cuenta familiar, evidencia presencial y trazabilidad de accesos.

La [validación de producción](docs/VALIDACION_PRODUCCION.md) explica cómo repetir las comprobaciones, su aislamiento y los límites pendientes del protocolo clínico.

La [infraestructura de correos](docs/INFRAESTRUCTURA_CORREOS.md) prepara los tres momentos de envío, reintentos y notificaciones. Permanece desactivada hasta las aprobaciones y la integración posterior de Brevo.

La [corrección y el retiro de publicaciones](docs/VERSIONES_RESULTADOS.md) permite a la autora conservar versiones y motivos, actualizar la vista familiar y detener los correos de la copia anterior.

La [gestión de contraseñas del equipo](docs/CLAVES_EQUIPO.md) incorpora claves temporales obligatorias, cambio propio con contraseña actual y recuperación por enlaces de un uso. Los correos reales de recuperación permanecen pendientes de Brevo; administración puede reasignar una clave temporal. Reiniciar el servidor después de regenerar Prisma.
