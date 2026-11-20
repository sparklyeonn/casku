# Integración de Calendly

## Confirmaciones de operación

La responsable confirmó que `https://calendly.com/contacto-casku/new-meeting` corresponde a las craneometrías de Expo Bebé y que la hora elegida representa una **cita con hora de atención**. No debe convertirse silenciosamente en un turno sin horario. La admisión requiere confirmación de recepción. La convivencia con la fila está implementada en la sección de vinculación; no se asigna una profesional específica ni se aplica tolerancia automática de atrasos.

## Primera etapa implementada

Administración tiene la opción **Calendly**, en `/administracion/calendly`. El servidor valida la sesión y el perfil ADMIN tanto al abrir la página como al acceder a `/api/administracion/calendly`. Familias, recepción y kinesiología no pueden consultar esta API.

La apertura del panel comprueba únicamente la configuración local. El botón **Consultar tipos de cita** realiza dos consultas GET: obtiene la cuenta autenticada en `/users/me` y consulta sus propios tipos de cita en `/event_types`, con paginación. Presenta nombre, zona horaria de la cuenta, duración, estado, enlace de reserva y las preguntas activas del formulario. No consulta participantes ni expone el correo de la cuenta, notas internas, respuestas, clave privada o carga completa del proveedor.

El cliente utiliza el origen fijo `https://api.calendly.com`, no sigue redirecciones y valida los identificadores y enlaces recibidos. Los enlaces de reserva deben pertenecer a `calendly.com`. Los cursores viajan únicamente al endpoint fijo; no se sigue `next_page` como una URL arbitraria. Las solicitudes tienen tiempo de espera limitado y los errores 401/403, 429, red y respuestas inválidas se presentan mediante mensajes propios, sin copiar el cuerpo del proveedor. El servidor y el navegador no guardan estas respuestas en caché.

El panel de configuración no modifica reservas de Calendly, inscripciones, bebés, cupos, consentimientos, eventos, selección del evento ni la fila de Casku. No envía correos. El token permanece en el servidor.

## Configuración privada

En `.env.local`, excluido de Git:

```env
CALENDLY_ENABLED=0
CALENDLY_API_TOKEN=
```

Crear un token de acceso personal propio de la aplicación, con nombre `Casku - Sistema` y permisos `users:read`, `event_types:read` y `scheduled_events:read`. Calendly indica la ruta **Perfil → Developer → Personal access tokens**; las cuentas que aún no tengan ese menú pueden acceder mediante **Integraciones → API y webhooks**. Guardar la clave solamente en `CALENDLY_API_TOKEN`; después cambiar `CALENDLY_ENABLED=1` y reiniciar el servidor si no recarga el archivo. Nunca usar el prefijo `NEXT_PUBLIC_`, subir `.env.local` ni enviar el token por el chat.

Con la cuenta conectada, localizar el tipo de cita de Expo Bebé y revisar sus preguntas reales. En esta fase no se solicita acceso de escritura ni permisos de cancelación. La agenda y la comprobación de reservas necesitan `scheduled_events:read`.

## Pendientes de sincronización automática

1. La jornada ya puede vincularse de forma persistente a la agenda Expo de ese día, con una sola jornada por fecha. Queda pendiente ampliar a otros tipos de cita si Casku los necesita.
2. Confirmar con Casku el formulario definitivo de Calendly y el caso de más de un bebé por reserva. Mientras tanto, recepción confirma expresamente un bebé por invitado; no se infiere desde el nombre reservado.
3. La reserva logística anticipada ya importa las referencias y horarios sin crear bebés ni cuentas. Sigue pendiente un eventual formulario definitivo de inscripción previo en Calendly; la identidad y la autorización se confirman en recepción.
4. Conciliar altas, cancelaciones y reprogramaciones posteriores a una llegada mediante notificaciones autenticadas y recuperación histórica. Una reprogramación debe conservar la inscripción y el historial; actualizar la agenda por sí solo no modifica una atención ya admitida.
5. Configurar y verificar el endpoint público HTTPS y la suscripción cuando se implemente esa sincronización. La vinculación actual mediante lectura de API funciona también en el dominio de Vercel y no requiere webhooks.

## Pruebas

- `npm test`: configuración, consultas propias de solo lectura, minimización de datos, paginación, límites, credenciales rechazadas, red, respuestas inválidas y enlaces ajenos.
- `node tests/production-http.mjs --calendly-only`: compilación aislada, recursos, permisos por perfil y administración en Chrome, Android, WebKit, iPad y pantalla pequeña. La vista de Calendly usa datos interceptados exclusivamente dentro del navegador de prueba para comprobar consulta manual, preguntas, paginación y recuperación después de un límite del proveedor.
- GitHub Actions parte con `CALENDLY_ENABLED=0` y una clave vacía. Solo el proceso específico de pruebas de vinculación habilita una clave ficticia con un interceptor explícito de pruebas hacia un servidor local. Nunca consulta el proveedor externo. Los interceptores no forman parte del código de la aplicación.

## Referencias oficiales

- [Tokens de acceso personal](https://developer.calendly.com/docs/authentication/how-to-authenticate-with-personal-access-tokens).
- [Cuenta autenticada y permiso users:read](https://developer.calendly.com/api-docs/calendly-api/users/get-current-user).
- [Tipos de cita, preguntas y permiso event_types:read](https://developer.calendly.com/api-docs/calendly-api/event-types/list-event-types).
- [Notificaciones de reprogramación](https://developer.calendly.com/docs/api-guides/see-how-webhook-payloads-change-when-invitees-reschedule-events).

## Conexión real verificada · 18 de noviembre de 2026

La responsable guardó el token de Calendly en `.env.local` y habilitó la consulta. Se verificó la cuenta **Casku 3D**, zona horaria **America/Santiago**, mediante dos solicitudes GET al proveedor. Se encontró el tipo de cita activo **Craneometría Gratis ExpoBebé Casku 3D**, de **10 minutos**, con el enlace de reserva confirmado. La única pregunta adicional activa y obligatoria devuelta es **Teléfono**. El proveedor incluye un salto de línea en esa etiqueta; el lector lo normaliza para su presentación.

La responsable aclaró que el campo de nombre puede corresponder al padre o al bebé y prefirió confirmar con Casku cómo completar los datos faltantes. Por tanto, **la importación y asociación automática de reservas permanece pendiente de esa definición**. No se asignan bebés ni se fusionan fichas a partir de ese nombre ambiguo. No se han consultado participantes, importado reservas, enviado correos, creado fichas o modificado horarios ni la fila mediante esta integración.

La consulta real queda habilitada localmente. No se ha creado una suscripción de webhook ni modificado la cuenta externa. Los identificadores y las credenciales reales no forman parte de los datos de prueba versionados.

Validación técnica: 63 pruebas unitarias, lint, tipos y compilación con el recorrido administrativo en cinco perfiles de navegador y pantalla. Las comprobaciones de servidor verifican acceso anónimo, los tres perfiles del equipo y configuración ausente. Las pruebas automáticas usan credenciales vacías y datos ficticios, incluso cuando la configuración local real está presente.


## Agenda de citas en Vercel · 19 de noviembre de 2026

La vista `/agenda` y la API `/api/calendly/agenda` permiten consultar las citas del enlace confirmado de Expo Bebé desde administración, recepción y kinesiología. No dependen del subdominio de Wix: funcionan con el HTTPS estable de Vercel. Las familias y visitantes anónimos no acceden a esta API. El panel administrativo conserva su consulta de tipos de cita y añade un enlace a la agenda.

Se identifica el tipo de cita mediante la URL de reserva confirmada `https://calendly.com/contacto-casku/new-meeting` entre los tipos pertenecientes a la cuenta del token. No se selecciona por nombre. Si no existe una única coincidencia se informa un error, sin mostrar otras reservas. El token necesita `users:read`, `event_types:read` y `scheduled_events:read`.

En Vercel configurar `CALENDLY_ENABLED=1` y la misma clave privada autorizada en `CALENDLY_API_TOKEN`, con alcance del despliegue elegido. Volver a desplegar el código actualizado. No usar NEXT_PUBLIC para la clave, añadir suscripciones ni habilitar correo como parte de esta operación. Conservar todas las banderas de correo en 0 durante el ensayo.

La consulta es manual y de solo lectura: el botón Consultar citas/Actualizar agenda vuelve a leer Calendly. No hay actualización en tiempo real, cron ni webhook nuevo. Se muestran inicio y fin en America/Santiago, nombre de la reserva y estado activo/cancelado/reprogramado. El nombre podría ser del padre o del bebé; no se trata como identidad infantil verificada. El equipo clínico no recibe correos de contacto; administración y recepción sí pueden usarlos para revisar la reserva. No se devuelven teléfonos, respuestas del formulario, notas, enlaces de cancelación/reprogramación, datos de pago o claves.

La API filtra por el día completo de Santiago, incluyendo cambios de horario de verano, y por la cuenta del token. Solo se consultan participantes de citas del tipo y día esperados. Se valida la pertenencia de cada participante a su cita. La paginación utiliza tokens contra rutas fijas de api.calendly.com, sin seguir URLs recibidas. Cada página solicita 10 eventos y hasta 100 participantes por evento; la concurrencia se limita a tres consultas de participantes. La vista indica páginas pendientes y ofrece Cargar más citas; buscar afecta únicamente las páginas ya cargadas. Si una cita tiene más participantes que el límite de su respuesta, se marca como incompleta. Los errores no se convierten en un listado vacío: se informa el fallo y se identifica la vista anterior conservada.

Todas las respuestas son privadas y no-store; no se persisten las reservas en Neon, no se aplican migraciones y no se envían correos. La autenticación conserva sus controles habituales de sesión y actividad. Los datos reales de Calendly permanecen separados de las fichas ficticias de ensayo.

### Alcance pendiente

Esta agenda muestra horarios, pero no convierte reservas en inscripciones, no crea bebés, no confirma llegadas, no consume cupos locales y no asigna profesionales. La admisión desde Calendly a la fila necesita identificación del bebé y autorizaciones; no se deducen por nombre/correo. Una cita cancelada o reprogramada en Calendly cambia en la siguiente consulta, sin cancelar automáticamente una inscripción o evaluación de Casku.

### Verificación

Las pruebas unitarias utilizan un proveedor simulado y comprueban selección del tipo, fecha chilena/invierno/verano/salto de medianoche, paginación, cancelación/reprogramación, datos ajenos, privacidad por perfil, credenciales y límites. Las pruebas HTTP verifican rechazo anónimo y acceso del equipo sin token real. Las pruebas de navegador cubren horario, páginas, búsqueda, estados y errores conservando los datos anteriores, con interceptación ficticia del proveedor. Ninguna prueba automática usa las credenciales de Calendly o Neon reales.

Referencias: [citas](https://developer.calendly.com/api-docs/calendly-api/scheduled-events/list-scheduled-events), [participantes](https://developer.calendly.com/api-docs/calendly-api/scheduled-events/list-event-invitees).


## Vinculación y llegada desde recepción (19 de noviembre)

Recepción entra a **Agenda de citas**, consulta el día y pulsa **Confirmar bebé y llegada** en una reserva activa. Selecciona explícitamente el evento de la misma fecha de Santiago; confirma nombre y nacimiento del bebé, apoderado y contacto. El nombre de Calendly nunca se interpreta automáticamente como nombre del bebé. El apoderado presente marca la autorización de datos. Esta operación no habilita correos ni verifica la propiedad de una cuenta familiar.

Si ya existe una inscripción del bebé, recepción ingresa su número: se conservan paciente, número, QR, contacto y autorizaciones. Una posible ficha repetida, un apoderado distinto, un permiso retirado o una reserva ya vinculada a otro bebé detienen la operación para revisión. No se fusionan fichas por correo. Una ficha de otro evento requiere revisión; este flujo no la duplica ni cambia su propietario.

El servidor relee la cita y su invitado, comprueba el tipo Expo y la cuenta propietaria, estado activo y horario. Solo registra llegadas el día de la cita. La transacción bloquea el evento y verifica la cuenta de recepción; el invitado tiene una referencia única. Los reintentos y dos recepcionistas no crean dos números ni dos entradas. No se superan cupos locales ni se adelanta la lista de espera: administración debe configurar los eventos diarios y su capacidad considerando las reservas de Calendly.

La entrada conserva inicio y fin UTC y los muestra en Santiago. Antes del inicio queda esperando su horario; desde la hora puede ser llamada, en orden de cita. Se conserva la protección de 30 minutos de las familias sin cita y la alternancia 3:1 entre los grupos sin cita. Una familia marcada ausente debe reincorporarse por el flujo existente: su espera vuelve a contar desde el regreso y no recupera prioridad por la hora perdida. No se promete una hora exacta ni se interrumpe una atención.

Las inscripciones creadas desde Calendly pueden usar después la invitación familiar verificada existente. No se asocian cuentas ni se activan correos automáticamente. La nueva operación no crea `CorreoInscripcion` ni llama a Brevo.

**Alcance de sincronización:** Calendly se comprueba al confirmar la llegada. Una cancelación o reprogramación posterior a esa llegada requiere revisión operativa; actualizar la agenda no cancela ni mueve una atención ya iniciada. La edición/reconciliación automática de citas vinculadas queda fuera de esta etapa.

### Base y despliegue

Migración aditiva: `20261119000200_vincular_citas_calendly`. Agrega campos opcionales y unicidad de invitado, sin cambiar evaluaciones ni registros anteriores. Amplía la restricción de contacto exclusivamente para reservas previas verificadas en recepción, conservando contacto y responsable obligatorios. Aplicar primero en la base de ensayo, con su conexión explícita y verificada; nunca usar `migrate dev`, `reset` ni `db push` sobre datos reales. Después desplegar el código. No se ejecutan migraciones automáticamente durante la compilación de Vercel.

### Pruebas

`npm run test:production` incluye las pruebas de vinculación HTTP con proveedor simulado y base temporal, además de los recorridos existentes. Focalizado: `node tests/production-http.mjs --calendly-link-only`. PostgreSQL real aislado: `npm run test:postgres -- --calendly-link-only`; requiere la conexión administrativa de pruebas habitual y crea/elimina únicamente una base marcada temporal. Nunca usa reservas, credenciales ni mensajes reales.


## Protección anticipada de cupos

En **Agenda de citas → Cupos reservados en Calendly**, administración o recepción elige la jornada de la misma fecha, confirma que corresponde a Expo y pulsa **Activar protección de cupos**. Un día solo puede quedar asociado a una jornada. La fecha queda protegida aunque todavía no existan inscripciones locales. No se activa esta vinculación solo por visitar la agenda.

La sincronización recorre todas las páginas, guarda únicamente referencias externas, horario y estado en `ReservaCupoCalendly` y registra la acción del funcionario. No crea bebés, cuentas, números, consentimientos ni correos. Una página incompleta, repetida o fallida nunca publica media actualización. Las reservas ausentes de una consulta conservan su protección: solo un estado cancelado explícito libera ese cupo logístico.

**Disponibilidad compartida:** capacidad del evento menos inscripciones vigentes menos reservas activas de Calendly todavía no cubiertas por una inscripción vigente. El mismo cálculo protege la web, la recepción presencial, las promociones FIFO, la disponibilidad pública, los resúmenes y la reducción de cupos. Si las reservas superan la capacidad local, se conservan todas y se bloquean nuevas admisiones hasta que administración revise los cupos; no se descartan reservas para hacerlas encajar.

Al confirmar el bebé y su llegada, una referencia única vincula el cupo con su inscripción dentro de la transacción del evento. No se consume un segundo cupo; una cita protegida conserva su reserva aunque haya lista de espera. Los reintentos y dos recepcionistas simultáneas mantienen una sola inscripción y fila. Una inscripción previa ya vinculada se reconoce al sincronizar y no se cuenta por duplicado.

Cancelar una inscripción local no libera una cita que sigue activa en Calendly: el cupo se mantiene protegido hasta que se confirme su cancelación externa. Si Calendly cancela una cita que ya tiene inscripción, la sincronización conserva la ficha, inscripción y atención; su gestión sigue requiriendo revisión local. No se promueve la lista de espera ni se llama a Brevo desde esta sincronización.

**Actualización y límites:** se actualiza cada dos minutos únicamente mientras este panel esté abierto y visible. La disponibilidad general se bloquea tras cinco minutos desde el inicio de la última consulta completa correcta, durante una sincronización pendiente o ante un fallo. Las reservas ya protegidas pueden confirmar la llegada mediante su comprobación individual vigente. Un proceso vencido puede reintentarse sin permitir que su respuesta tardía sobrescriba la actualización posterior. No se ha configurado todavía un webhook o una tarea de servidor permanente; el panel debe mantenerse abierto durante recepción o actualizarse manualmente. Las nuevas reservas externas hechas entre consultas solo se incorporan en la siguiente consulta; esta integración no modifica los límites ni la disponibilidad del Calendly externo.

Migración aditiva: `20261119000300_reserva_cupos_calendly`, con dos tablas nuevas, sin modificar filas anteriores. Probar y aplicar exclusivamente en ensayo antes del despliegue; la activación por jornada es una acción posterior y separada.

Prueba focalizada: `node tests/production-http.mjs --calendly-holds-only`. PostgreSQL real aislado y dos servidores: `npm run test:postgres -- --calendly-holds-only`. El recorrido normal de producción también incluye estas pruebas. Los cinco perfiles de navegador comprueban activación, cupos antes de la llegada, actualización sin duplicación y ausencia de desbordamiento. Las pruebas nunca usan Neon ni envían correos reales.
