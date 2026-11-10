# Implementación por etapas

El código actual es la continuación del proyecto de Downloads, copiado a Documents/ChatGPT/casku con los cambios locales que ya existían. El original no se modifica. Durante la entrega inicial no se migró la base ni se escribieron pacientes. Los incrementos de eventos e inscripciones se describen en EVENTOS.md y FAMILIAS.md.

## Etapa 1 — Acceso del equipo y formulario existente (implementada)

- Inicio/cierre de sesión individual mediante Auth.js y contraseñas derivadas con scrypt. Sin credenciales de demostración.
- Tres permisos de servidor: KINESIOLOGO, RECEPCION y ADMIN. Administración no hereda permisos clínicos.
- Formulario existente en /evaluacion, exclusivo de kinesiología. Conserva sus reglas de cálculo y aspecto.
- La API verifica sesión y perfil, valida datos y recalcula el resultado; ignora diagnósticos y nombre profesional enviados por el navegador.
- Paciente y evaluación se guardan dentro de una transacción; los conflictos de identidad se revisan antes de vincular resultados.
- No se envían resultados automáticamente en esta etapa. La interfaz solo confirma el guardado. Publicación y correo se integran en la etapa 4.
- Historial por RUT deshabilitado. Los datos anteriores permanecen en la base; el RUT no prueba la identidad de un apoderado.
- Recepción y administración tienen accesos separados y muestran qué está disponible y qué falta, sin datos clínicos.

### Ejecutar y habilitar al equipo

La gestión visual del equipo está implementada en `/administracion/cuentas`: creación, edición, perfiles, desactivación/reactivación y contraseñas, con auditoría y sesiones invalidadas. Consultar [CUENTAS_EQUIPO.md](CUENTAS_EQUIPO.md). El asistente `npm run account:create` queda reservado para preparar el acceso inicial antes de la primera importación.

Ejecutar `npm run dev` y abrir /login. El perfil depende de la cuenta; no se elige desde el navegador. La sección Familias permite verificar el correo cuando el remitente esté configurado.

Conservar DATABASE_URL en la configuración privada. Las cuentas iniciales se importan una sola vez conservando IDs y hashes. Después, solo la base decide el acceso y los cambios se realizan en el panel; modificar la lista antigua del entorno no restaura accesos.

### Comprobaciones

`npm test`, `npx tsc --noEmit`, `npm run lint` y `npm run build`. Las pruebas automatizadas no escriben en la base configurada ni envían correos reales. Las suites HTTP utilizan cuentas efímeras y PostgreSQL local temporal; deben ejecutarse por separado.

En la entrega inicial pasaron las cinco pruebas unitarias, TypeScript, ESLint y `npm run test:http` (ingreso, permisos, apertura de pantalla y cierre de sesión de los tres perfiles). La compilación de producción quedó bloqueada por `Operation not permitted` al abrir el proceso auxiliar de estilos de Turbopack en este entorno. No se verificó el guardado contra la base real. En aquella entrega inicial no se aplicaron migraciones; las entregas posteriores se documentan por separado.

Antes de publicar en internet: configurar HTTPS, AUTH_URL y AUTH_SECRET; usar almacenamiento compartido para limitar intentos si hay varias instancias; las cuentas del equipo ya son persistentes y se gestionan desde administración. El límite actual es por cuenta y proceso (5 intentos / 15 minutos). Las fórmulas clínicas existentes se conservaron sin validar ni alterar sus umbrales médicos.

## Etapa 2 — Familias, eventos e inscripciones

Primer incremento implementado: creación y selección de eventos en administración, con persistencia por cuenta y migración aditiva. Consultar [EVENTOS.md](EVENTOS.md). El segundo incremento implementa el acceso familiar por código, bebés propios, inscripción atómica, número y QR, y confirmación por correo con reintento manual. Consultar [FAMILIAS.md](FAMILIAS.md). El remitente verificado está pendiente; no se enviaron correos reales.

- Modelar apoderado, bebé, evento e inscripción por separado; un apoderado puede tener varios bebés.
- Sustituir el acceso familiar por verificación real de correo con códigos de un solo uso, expiración y límite de intentos.
- Los datos históricos permanecen sin asignar. Su vinculación exige una revisión de identidad adicional; nunca se realiza automáticamente por conocer un RUT.
- Asignar el número por evento con restricción única y operación atómica. La inscripción no es un turno.
- Confirmación y QR opaco implementados; se registra aceptación del proveedor, no entrega efectiva al buzón. Pendientes: remitente verificado y seguimiento mediante webhooks.
- Migración ensayada con pacientes y evaluaciones anteriores ficticios, verificando que sus datos se conservan.

## Etapa 3 — Recepción y fila

Primer incremento implementado: evento por cuenta de recepción, búsqueda por número o QR, confirmación de llegada y fila de espera persistida sin duplicados. Consultar [RECEPCION.md](RECEPCION.md). Segundo incremento implementado: llamado exclusivo por profesional, formulario precargado, devolución a espera y guardado vinculado que finaliza la atención. Consultar [KINESIOLOGIA.md](KINESIOLOGIA.md).

- Inscripción del día en recepción y fila intercalada implementadas; consultar [PRESENCIAL_Y_PRIORIDAD.md](PRESENCIAL_Y_PRIORIDAD.md). Ausencias y reincorporación implementadas; consultar [AUSENCIAS.md](AUSENCIAS.md). La reasignación supervisada sigue pendiente.
- Fila común con proporción fija 3:1 y prioridad por mayor espera a partir de treinta minutos. Su configuración visual y la validación operativa de capacidad siguen pendientes.
- Reserva atómica y una atención activa por profesional implementadas, incluso entre eventos.
- Formulario existente vinculado a la inscripción, con identidad y profesional del servidor, y guardado sin duplicados implementados.
- Reincorporación implementada con categoría conservada y espera reiniciada. La cancelación y recuperación de cupos siguen pendientes de definición.

## Etapa 4 — Publicación, resultados y seguimiento

Primer incremento implementado: borradores revisables por su autora, copia publicada inmutable, consulta familiar y correo con recuperación manual. Consultar [RESULTADOS.md](RESULTADOS.md).

- Autoría clínica verificada y cambios auditados de borrador implementados. Las correcciones después de publicar y la revisión supervisada siguen pendientes.
- Solo el apoderado verificado y actualmente vinculado accede a resultados publicados. La vinculación de presenciales está implementada con código entregado por recepción y aceptación de la cuenta verificada (ver VINCULACION.md). La revisión de históricos y la resolución supervisada de fichas coincidentes siguen pendientes.
- Correo idempotente con estado de aceptación y reintento manual implementado. Pendientes: remitente, webhooks de entrega y reintento programado.
- Administración visual de accesos implementada (ver CUENTAS_EQUIPO.md). Resumen administrativo por evento implementado (ver RESUMEN_ADMINISTRATIVO.md). Pendientes: edición de eventos, reportes adicionales y seguimiento de familias con permisos específicos.
- Definir quién contacta a las familias y qué datos necesita antes de construir seguimiento.
