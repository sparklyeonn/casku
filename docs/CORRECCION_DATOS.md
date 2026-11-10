# Corrección de datos de bebés y apoderados

## Uso y permisos

Recepción y administración tienen **Datos de familias** en su menú (`/datos-familias`). Recepción también puede abrir **Corregir datos del bebé o apoderado** desde una inscripción encontrada. Seleccionar evento y buscar por número o QR del comprobante; confirmar presencialmente qué ficha corresponde a la familia antes de editar.

Solo esos dos perfiles pueden consultar, corregir y revisar el historial de datos personales. Kinesiología no utiliza esta pantalla y administración no adquiere permiso para consultar medidas, diagnósticos ni recomendaciones. Las familias no acceden a estas APIs del equipo. Todas las respuestas son privadas y sin caché.

La corrección se realiza sobre una inscripción identificada, sin un directorio global de RUT ni búsqueda pública por identidad. Las fichas históricas sin inscripción, las fusiones y los cambios supervisados de apoderado siguen pendientes de su flujo específico.

| Sección | Datos corregibles | Alcance |
| --- | --- | --- |
| Bebé | Nombre, nacimiento y RUT opcional | La misma ficha permanente, visible en todas sus inscripciones. |
| Apoderado con cuenta | Nombre, RUT opcional y teléfono | El perfil compartido por sus bebés e inscripciones. El correo de acceso verificado permanece protegido. |
| Contacto presencial sin cuenta | Nombre, teléfono y correo de contacto | Solo esa inscripción. Corregir un correo no crea una cuenta ni asigna propiedad del bebé. |

Cambiar el correo verificado requiere verificar la nueva dirección mediante un proceso de cambio de acceso, todavía no disponible aquí. Tampoco se cambia quién es propietario del paciente ni se reasigna la inscripción desde esta pantalla.

## Conservación y controles

La operación actualiza los registros existentes: conserva IDs de bebé/apoderado/inscripción, número, QR, origen, cupo, llegadas, orden y estado de fila, autoría y mediciones de evaluaciones. No crea otra ficha para aplicar una corrección.

- El nacimiento debe ser una fecha real, desde 1900 y no futura según el día de Chile; los RUT se normalizan y validan con su dígito verificador.
- Un RUT de bebé que ya esté en otra ficha, o datos coincidentes con otro bebé de la cuenta o del evento, requieren revisión. No se fusionan ni reasignan registros para resolver el conflicto. Se comprueban variantes de RUT con y sin puntos y nombres normalizados.
- El RUT del apoderado que figure en otra cuenta también requiere revisión. Una coincidencia de nombre o correo de contacto nunca concede acceso.
- No se corrige la identidad del bebé mientras tenga una atención activa, incluso en otro evento. Primero debe finalizarse o devolverse a la fila. El llamado de kinesiología comparte el bloqueo del paciente para evitar una carrera con la corrección.
- Cada ficha/contacto tiene una revisión. Un formulario antiguo no sobrescribe un cambio posterior; debe recargarse. Un reintento que ya coincide no duplica cambios ni auditoría.
- Una vinculación inconsistente se detiene para revisión. Los códigos de vinculación aún pendientes se revocan cuando se corrige bebé o contacto; recepción debe generar y entregar uno nuevo. Las vinculaciones ya aceptadas se conservan.

El formulario exige un motivo administrativo de entre 10 y 300 caracteres. Usar **Descartar cambios y recargar** para recuperar los datos actuales después de un conflicto. No incluir información clínica en el motivo.

## Auditoría y formularios familiares

`CambioDatos` registra entidad, ID estable, revisión, cuenta/perfil responsable, momento, motivo y valores anteriores/nuevos. La pantalla presenta este historial con paginación. El cambio y la auditoría se guardan en una transacción: si falla cualquiera, se revierte también la otra parte y las revisiones.

Los cambios del perfil realizados por la propia familia al confirmar una inscripción también quedan registrados como tales. La inscripción comprueba la revisión actual antes de modificar un perfil ya completado. Una corrección del bebé invalida la revisión del formulario familiar asociado, para impedir que un formulario anterior vuelva a registrar su identidad antigua como otro bebé.

La web familiar envía la revisión del perfil y, al actualizar datos corregidos, reinicia los campos de inscripción sin guardar. Los clientes antiguos sin revisión deben recargar después de una corrección del equipo. Reutilizar un bebé mediante su ID conserva la ficha corregida al inscribirlo en otro evento.

## Publicaciones y correos

Los resultados ya publicados y sus correos conservan su copia original. Las correcciones no modifican medidas ni recomendaciones, no vuelven a publicar y no envían mensajes automáticamente. Los borradores y futuras evaluaciones usan la identidad actual de la ficha.

Las órdenes de confirmación guardan también nombre del bebé, destinatario y si el comprobante correspondía a una cuenta al prepararse. Un reintento conserva el cuerpo original y su clave aunque se corrija después el nombre del bebé. El portal y el QR consultados siguen utilizando la ficha actual.

Al corregir un correo de contacto presencial se prepara una nueva versión de confirmación, conservando la inscripción y la orden. Recepción dispone de **Reintentar correo del comprobante** debajo de la ficha, mostrando el contacto guardado; usa la dirección corregida y una nueva clave de envío. Administración delega este envío en recepción. No se intenta retirar un correo que el proveedor ya aceptó. Si hay un envío en curso, la corrección del correo se bloquea hasta que termine; así no se cambia el destinatario debajo de un envío activo. Borrar el contacto no habilita envíos a la dirección anterior. Si posteriormente se vincula la cuenta familiar, se prepara una copia para su correo verificado con una nueva clave y reintento manual; un comprobante en curso debe terminar antes de aceptar el código.

## Migración y pruebas

`20261110000200_correccion_datos` añade revisiones, auditoría y la identidad preparada de las confirmaciones anteriores. No modifica datos de fichas, propiedad, inscripciones, filas o evaluaciones ni estados previos de envío; no inventa auditorías históricas. Aplicar con `npm run db:deploy`, regenerar con `npx prisma generate` y reiniciar desarrollo. No usar `db push` ni `migrate reset`.

`npm test` verifica entradas, protección de correo verificado, campos ignorados y copia preparada de identidad. `npm run test:families` comprueba permisos, misma ficha y relaciones, identidad en atención, formularios antiguos, coincidencias de nombre/RUT, perfil compartido, publicación inmutable, conservación del cuerpo de correo, contacto corregido con una nueva versión, códigos anteriores revocados, envíos en curso, correcciones simultáneas y rollback de auditoría. La migración se ensaya además sobre ficha, apoderado, inscripción y confirmación previos, verificando su conservación.

Los ensayos usan PostgreSQL temporal y correo ficticio. Conservar las suites de eventos y acceso, ESLint, TypeScript y validación de Prisma. Ejecutar las suites HTTP por separado y TypeScript al terminar. La compilación de producción mantiene pendiente la comprobación del proceso auxiliar de estilos de Turbopack documentada en etapas anteriores.
