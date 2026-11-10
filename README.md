# Casku · Atención y eventos

Web de craneometrias, para expo niño y bebé.

Administración permite crear eventos con nombre, fecha, lugar y cupos, y seleccionar el evento de trabajo por cuenta. También permite abrir o cerrar inscripciones. Las familias verifican su correo, eligen evento y registran a sus bebés; reciben un número por evento y un comprobante con QR. Recepción busca por número o QR, confirma llegadas y consulta la fila de espera.

## Uso local

1. Instalar dependencias con `npm ci` si no existen.
2. Configurar `DATABASE_URL` con la conexión existente y comprobar el destino. Para habilitar las tablas de eventos e inscripciones ejecutar `npm run db:deploy` y `npx prisma generate`. La nueva migración conserva los registros anteriores, añade relaciones opcionales al paciente y permite bebés sin RUT.
3. En una instalación nueva, ejecutar `npm run account:create` para preparar al menos una cuenta administradora. Tras el primer ingreso, gestionar el equipo desde **Administración → Cuentas del equipo**. Ver [CUENTAS_EQUIPO.md](docs/CUENTAS_EQUIPO.md).
4. Configurar `AUTH_SECRET`, `AUTH_URL`, `RESEND_API_KEY` y `RESEND_FROM` en la configuración privada. El remitente verificado está pendiente de Casku: sin él no se envían códigos ni se permite omitir la verificación.
5. Ejecutar `npm run dev`. Administración abre inscripciones desde `/administracion`; las familias comienzan en `/inscripcion` y consultan sus comprobantes en `/familias`.

Perfiles disponibles: `KINESIOLOGO`, `RECEPCION`, `ADMIN`. No hay contraseñas de demostración. Las cuentas se guardan en la base. La lista privada de `.env.local` se usa solo para la importación inicial.

## Verificación

- `npm test`: contraseñas, permisos, cuentas y validación de evaluaciones.
- `npm run test:http`: inicio/cierre de sesión y permisos mediante servidor temporal en el puerto 3117, con cuentas efímeras y PostgreSQL local temporal. No utiliza la base configurada ni envía correos.
- `npm run test:events`: migración y gestión de eventos con PostgreSQL temporal aislado. No utiliza la base real de Casku.
- `npm run test:families`: acceso por código, inscripciones, cupos, aislamiento familiar, QR, correo, recepción y kinesiología (llegadas, reservas, formularios, guardado y permisos), publicación de resultados, vinculación presencial, gestión de cuentas del equipo, resumen y edición de eventos, con base y proveedor locales ficticios. No envía correos reales. Ejecutar las pruebas HTTP por separado.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.

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
