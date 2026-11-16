# Gestión administrativa de correos

## Acceso y alcance

Administración dispone de **Correos** en el menú del equipo, en `/administracion/correos`. Recepción, kinesiología y familias no acceden a estas consultas ni a sus acciones. El servidor comprueba el perfil en cada solicitud y vuelve a verificar cuenta, versión, contraseña temporal y sesión vigente en la transacción de escritura. Los cambios requieren el origen del portal configurado.

La pantalla permite filtrar por evento, tipo, estado de envío/entrega y seguimiento administrativo. Consulta entregas, fallos, rebotes temporales y definitivos, quejas y mensajes para revisión. Lista y detalle son de solo lectura; actualizar o cambiar un filtro no crea envíos ni marcas de revisión.

**Los envíos reales permanecen desactivados.** No se modificaron variables privadas, remitente, credenciales ni sus interruptores de activación. No se llamó a Brevo real. El panel no contiene acciones para activar proveedores, aprobar protocolos clínicos o levantar supresiones.

## Registros y privacidad

La proyección `VistaCorreoAdministracion` unifica:

- Confirmaciones de inscripción, con evento y número.
- Órdenes clínicas por etapa y versiones, incluidas las bloqueadas.
- Resultados antiguos que todavía no tengan una orden equivalente.
- Solicitudes de recuperación, incluidas las que aún no han generado un envío.
- Otros registros transaccionales, incluidos códigos de acceso y confirmaciones históricas.

Un envío relacionado con una confirmación, recuperación u orden no vuelve a contarse como transaccional separado. Las confirmaciones de versiones anteriores conservan el evento y número de inscripción cuando la referencia técnica permite relacionarlas. Los códigos y recuperaciones no reciben un evento inventado; se incluyen en la consulta global.

Se muestran estados, intentos, motivo operativo, fechas, referencia del registro y, cuando existe, referencia técnica del proveedor para la revisión en Brevo. Esta última no es la dirección del destinatario. No se muestran nombres de bebés, contactos, correos destinatarios, cuerpos, medidas, diagnósticos, recomendaciones, códigos, enlaces de recuperación, QR ni huellas privadas. El historial utiliza motivos predefinidos, sin un campo libre para introducir información clínica o tokens.

La aceptación por el proveedor y la entrega al buzón se presentan por separado, junto al estado del proceso de origen. Un cierre administrativo no convierte un envío incierto en aceptado ni un rebote en entregado. Las notificaciones muestran tipo y fechas de eventos ya aplicados al mensaje, sin el payload externo completo. La consulta no hace llamadas a la API de Brevo para inferir una aceptación desconocida.

## Acciones

- **Marcar en revisión:** registra el seguimiento operativo y su responsable.
- **Cerrar revisión:** exige confirmación y motivo. Conserva los estados de envío, entrega y bloqueo del destinatario.
- **Reabrir revisión:** permite retomar un caso cerrado o con novedades posteriores.
- **Reintentar confirmación:** solo para una confirmación de inscripción con fallo conocido y recuperable, cuando el transporte está completamente configurado y habilitado. Con los envíos desactivados, se bloquea sin tocar los intentos del proveedor.

El reintento conserva destinatario, contenido congelado y clave de entrega del flujo existente. No se ofrece para códigos, recuperaciones, correos clínicos ni confirmaciones históricas separadas. No reenvía aceptaciones conocidas, mensajes con recepción incierta, rebotes/quejas con supresión, reservas canceladas, envíos en curso o intentos que todavía deban esperar o hayan agotado su límite. Los códigos y enlaces nuevos se solicitan en sus pantallas públicas, con sus límites y verificación correspondientes.

La intención de reintento queda auditada y confirmada antes de llamar al proveedor, fuera de la transacción. Un identificador de operación repetido no vuelve a ejecutar el envío. Si se pierde la respuesta o el proceso se interrumpe, se debe consultar el estado antes de continuar; no se presume que el proveedor recibió el mensaje. El registro puede representar una solicitud cuyo envío no llegó a ejecutarse. La protección de `EnvioTransaccional` y los bloqueos del flujo de confirmación siguen vigentes.

Se fija la revisión de contenido comprobada al registrar la intención. Si cambia antes de reclamar el envío, el reintento se detiene: no se envía otra versión bajo una decisión administrativa anterior. La prueba HTTP induce ese cambio después de auditar para comprobar la protección.

## Concurrencia e historial

Cada registro tiene seguimiento y revisión administrativa. La acción aporta la revisión leída y una huella de sus estados actuales. Una pestaña obsoleta recibe conflicto y debe actualizar. Dos acciones diferentes sobre la misma revisión no pueden aplicar dos cambios. Reutilizar un identificador con otros datos también se rechaza.

Una incidencia posterior a un cierre aparece como **Novedad posterior al cierre**. Notificaciones repetidas que no cambian estados ni intentos no reabren casos por actualizar una fecha técnica. Un caso cerrado puede seguir mostrando un rebote o una queja; conserva la evidencia del proveedor y la supresión, aunque ya no requiera seguimiento humano pendiente.

`CambioGestionCorreo` registra identificador de operación, actor y nombre del equipo, acción, motivo, revisión, huella, antes/después y fecha. La escritura de gestión y el historial son atómicos: si falla la auditoría, no cambia la gestión ni se llama al proveedor. Un disparador de base rechaza modificaciones o eliminaciones del historial; la aplicación no ofrece borrado.

Las solicitudes de recuperación con gestión administrativa conservan sus metadatos para mantener accesible el historial. Su dirección cifrada se elimina al terminar igual que antes; no se recupera desde el panel. La limpieza omite registros auditados y usa bloqueos para no competir con una acción en curso. El resto de solicitudes conserva la retención acotada anterior.

## API y paginación

Se mantiene `GET /api/administracion/correos?eventoId=...` para el resumen por evento existente. La nueva interfaz usa:

- `GET /api/administracion/correos/mensajes`: filtros `tipo`, `eventoId`, `estado`, `seguimiento`, `pagina`; veinte resultados por página y totales del filtro.
- `GET /api/administracion/correos/mensajes/[tipo]/[id]`: detalle, veinte acciones y veinte notificaciones por página; `paginaHistorial` y `paginaEventos` permiten continuar.
- `POST` sobre el mismo detalle: acción, identificador único, motivo predefinido, revisión, huella y confirmación explícita cuando corresponda. Actor y permisos provienen de la sesión, no del formulario.

Las respuestas son privadas y sin caché. Los contadores describen dimensiones distintas y no deben sumarse como si fueran categorías excluyentes: un mensaje aceptado puede tener después una queja.

## Migración y activación

La migración `20261115000200_gestion_correos` añade la referencia opaca administrativa de los registros transaccionales, las tablas de seguimiento/historial y una vista operativa. No reinterpreta resultados, crea campañas, reintenta correos ni cambia estados anteriores.

Queda preparada, sin aplicarse a la base del sistema en esta entrega. Antes de usar el panel en la instalación correspondiente, ejecutar `npm run db:deploy`, regenerar Prisma y reiniciar. Los envíos, la automatización clínica y la recepción de webhooks conservan sus controles de activación independientes. Configurar el proveedor y hacer pruebas de mensajes reales permanece pendiente de Casku y del despliegue.

## Comprobaciones

- `npm test`: filtros, referencias, motivos, versiones y confirmación obligatoria.
- `npm run test:mail-admin`: consulta unificada, privacidad, paginación, seguimiento, idempotencia, conflictos, rollback, permisos y conservación del historial sobre base temporal.
- `npm run test:mail-admin:http`: permisos por perfil, filtros, origen, reintento simulado único, espera, cambio de versión durante la acción y bloqueos por rebote/queja.
- `npm run test:http`: consulta y revisión con Brevo desactivado; reintento bloqueado.
- `npm run check`: batería integral, compilación de producción y tipos.
- `npm run test:postgres -- --mail-admin-only --skip-build`: acciones y concurrencia sobre PostgreSQL real en una base nueva aislada, que se elimina al terminar.
- `npm run test:mail-admin:devices`: compilación, HTTP y pantalla en Chromium/WebKit con perfiles de computador, Android e iPad. `--skip-build` solo reutiliza una compilación vigente.

Los navegadores son independientes del Chrome personal y utilizan datos ficticios. Los perfiles móviles son emulados; no sustituyen la aceptación de dispositivos físicos del evento.

## Validación de esta entrega · 15 de noviembre de 2026

`npm run check` terminó correctamente: lint, 53 pruebas unitarias, infraestructura de correo, recuperación, gestión administrativa, eventos, seguridad, HTTP, recorridos familiares, compilación de producción y tipos. Se repitieron lint y tipos después del control final de revisión de contenido.

El recorrido HTTP focalizado comprobó que cambiar el contenido de una confirmación después de auditar la intención no envía otra versión. La batería de producción y los cuatro perfiles de navegador ejercitaron filtros, detalle, cierre/reapertura y bloqueos, sin excepciones de página ni desbordamiento horizontal. Se guardaron capturas con datos ficticios en `test-results/mail-admin/`.

`npm run test:postgres -- --mail-admin-only --skip-build` terminó correctamente en una base PostgreSQL real nueva y aislada, con dos clientes: idempotencia, acciones concurrentes, pestañas obsoletas, rollback auditado, reintento único, conservación de históricos y revalidación de sesión/perfil. La base temporal se eliminó al terminar. Los mensajes se simularon; no se modificó la configuración privada ni se aplicó la migración a la base del sistema.
