# Gestión de eventos

Administración puede crear y seleccionar eventos en `/administracion`. Los campos son nombre, fecha, lugar y cupos totales. Crear selecciona automáticamente el nuevo evento para la cuenta que lo creó. Un evento seleccionado no se abre a inscripciones ni inicia la atención automáticamente.

## Persistencia y permisos

- `Evento` almacena los datos del evento y el identificador del administrador creador.
- `EventoSeleccionado` guarda un evento de trabajo por cuenta. Se conserva al recargar o volver a ingresar, sin cambiar la selección de otros administradores.
- Las operaciones de `/api/eventos` y `/api/eventos/seleccion` exigen una sesión ADMIN, incluso si se llaman directamente. Recepción y kinesiología aún no gestionan este contexto.
- El usuario de la selección se toma exclusivamente de la sesión, nunca del formulario. Las respuestas son privadas y no se almacenan en caché.
- La fecha es un día calendario PostgreSQL DATE, presentado con zona UTC para evitar cambiar de día en Chile.
- Los cupos son enteros entre 1 y 100.000, validados en cliente, servidor y mediante restricción SQL. Son cupos totales. Se muestra también el recuento de inscripciones y los cupos disponibles.
- Crear y seleccionar ocurre en una transacción. Una clave UUID de envío evita duplicar el evento al repetir una petición; reutilizarla para otros datos se rechaza.

## Actualización de la base

La migración `20261109000100_eventos` crea dos tablas, sus índices y una relación. No modifica `Paciente` ni `Evaluacion`, ni asigna eventos a evaluaciones anteriores. Se ensaya automáticamente conservando un paciente y una evaluación ficticios anteriores a la migración.

Después de comprobar la conexión de destino, aplicar con `npm run db:deploy` y regenerar con `npx prisma generate`. No usar `migrate reset` ni `db push` para esta entrega. Prisma CLI carga `.env.local` antes de `.env`, respetando las variables ya definidas en el proceso.

## Inscripciones y fila

La inscripción familiar tiene una relación obligatoria con `Evento.id`, independiente de la ficha permanente del bebé. El número es único dentro de cada evento. La futura fila consultará únicamente sus inscripciones presentes. Cada operación enviará y validará el evento explícitamente; no se usará una selección global que cambie silenciosamente el contexto de otros usuarios.

Administración abre o cierra inscripciones por evento; crear o seleccionar un evento no las abre. No se permite abrir un evento pasado (día de Chile). Consultar FAMILIAS.md. La edición de eventos, la prioridad de la fila y la reserva de pacientes siguen pendientes.

## Pruebas

- `npm test`: validación de campos, fechas reales, UUID y cupos, además de las pruebas anteriores.
- `npm run test:events`: PostgreSQL efímero y servidor Next.js temporal en puerto 3118. Ensaya migración, permisos, creación, reintentos, selección por cuenta, persistencia al volver a ingresar, restricciones SQL y rollback ante fallo de selección. Nunca utiliza Neon.
- `npm run test:http`: conserva las pruebas de acceso y formulario de los tres perfiles.
- `npx tsc --noEmit` y `npm run lint`.

Los servidores temporales usan `.next-tests` para no compartir el bloqueo de `.next` con el desarrollo normal. Las pruebas HTTP se ejecutan por separado porque comparten esa carpeta. PGlite se usa exclusivamente para pruebas, no como base de la aplicación.

## Verificación de esta entrega

Se verificaron las ocho pruebas unitarias, la prueba integral de eventos con PostgreSQL temporal, la validación del esquema, TypeScript y ESLint. La migración aditiva se aplicó correctamente a la base configurada después de ensayarla en aislamiento. No se cargaron eventos ficticios en esa base.

La compilación de producción volvió a encontrar una restricción del entorno: el proceso auxiliar de estilos de Turbopack no pudo abrir un puerto (`Operation not permitted`). Las pruebas de desarrollo del panel sí completaron sus operaciones. Reiniciar `npm run dev` después de regenerar Prisma para que el proceso cargue el cliente con los modelos nuevos.
