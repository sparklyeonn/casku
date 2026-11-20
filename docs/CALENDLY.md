# Integración de Calendly

## Confirmaciones de operación

La responsable confirmó que `https://calendly.com/contacto-casku/new-meeting` corresponde a las craneometrías de Expo Bebé y que la hora elegida representa una **cita con hora de atención**. No debe convertirse silenciosamente en un turno sin horario. La asignación de profesionales, tolerancia de atrasos y convivencia con inscripciones presenciales deben quedar definidas antes de automatizar la admisión a la fila.

## Primera etapa implementada

Administración tiene la opción **Calendly**, en `/administracion/calendly`. El servidor valida la sesión y el perfil ADMIN tanto al abrir la página como al acceder a `/api/administracion/calendly`. Familias, recepción y kinesiología no pueden consultar esta API.

La apertura del panel comprueba únicamente la configuración local. El botón **Consultar tipos de cita** realiza dos consultas GET: obtiene la cuenta autenticada en `/users/me` y consulta sus propios tipos de cita en `/event_types`, con paginación. Presenta nombre, zona horaria de la cuenta, duración, estado, enlace de reserva y las preguntas activas del formulario. No consulta participantes ni expone el correo de la cuenta, notas internas, respuestas, clave privada o carga completa del proveedor.

El cliente utiliza el origen fijo `https://api.calendly.com`, no sigue redirecciones y valida los identificadores y enlaces recibidos. Los enlaces de reserva deben pertenecer a `calendly.com`. Los cursores viajan únicamente al endpoint fijo; no se sigue `next_page` como una URL arbitraria. Las solicitudes tienen tiempo de espera limitado y los errores 401/403, 429, red y respuestas inválidas se presentan mediante mensajes propios, sin copiar el cuerpo del proveedor. El servidor y el navegador no guardan estas respuestas en caché.

Esta etapa no modifica reservas de Calendly, inscripciones, bebés, cupos, consentimientos, eventos, selección del evento ni la fila de Casku. No envía correos. El token permanece en el servidor.

## Configuración privada

En `.env.local`, excluido de Git:

```env
CALENDLY_ENABLED=0
CALENDLY_API_TOKEN=
```

Crear un token de acceso personal propio de la aplicación, con nombre `Casku - Sistema` y permisos `users:read` y `event_types:read`. Calendly indica la ruta **Perfil → Developer → Personal access tokens**; las cuentas que aún no tengan ese menú pueden acceder mediante **Integraciones → API y webhooks**. Guardar la clave solamente en `CALENDLY_API_TOKEN`; después cambiar `CALENDLY_ENABLED=1` y reiniciar el servidor si no recarga el archivo. Nunca usar el prefijo `NEXT_PUBLIC_`, subir `.env.local` ni enviar el token por el chat.

Con la cuenta conectada, localizar el tipo de cita de Expo Bebé y revisar sus preguntas reales. En esta fase no se solicita acceso de escritura ni permisos de cancelación. La consulta futura de reservas necesitará además `scheduled_events:read`.

## Siguientes etapas pendientes

1. Vincular explícitamente el tipo de cita de Calendly con el evento o jornada de Casku, respetando la fecha y la zona horaria. No asignarlo por coincidencia del nombre.
2. Revisar cómo se capturan nombre del bebé, fecha de nacimiento, apoderado, contacto y posibles reservas para más de un bebé. Un correo no identifica por sí solo una ficha infantil.
3. Preparar una importación con vista previa, identidad externa estable por invitado y controles de duplicados. Las reservas incompletas deben quedar en revisión. No inferir consentimientos ni propiedad de una cuenta familiar a partir de una reserva externa.
4. Conservar la hora de la cita y adaptar recepción y fila para respetarla. No aplicar automáticamente las reglas actuales de intercalado y espera máxima a reservas con horario sin definir su convivencia con las llegadas presenciales.
5. Integrar altas, cancelaciones y reprogramaciones mediante notificaciones autenticadas y una conciliación de reservas anteriores. Una reprogramación genera tanto creación como cancelación; deben manejarse duplicados y llegada fuera de orden sin perder la inscripción ni su historia clínica.
6. Configurar el endpoint público HTTPS, verificar la suscripción y ejecutar las pruebas con reservas ficticias. Mantener los correos de Brevo limitados a las dos direcciones autorizadas durante estas pruebas.

## Pruebas

- `npm test`: configuración, consultas propias de solo lectura, minimización de datos, paginación, límites, credenciales rechazadas, red, respuestas inválidas y enlaces ajenos.
- `node tests/production-http.mjs --calendly-only`: compilación aislada, recursos, permisos por perfil y administración en Chrome, Android, WebKit, iPad y pantalla pequeña. La vista de Calendly usa datos interceptados exclusivamente dentro del navegador de prueba para comprobar consulta manual, preguntas, paginación y recuperación después de un límite del proveedor.
- Los procesos de pruebas y GitHub Actions fuerzan `CALENDLY_ENABLED=0` y una clave vacía. No usan credenciales reales ni consultan Calendly. La simulación del navegador no forma parte del código de la aplicación.

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
