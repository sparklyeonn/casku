# Cuentas del equipo

## Uso desde administración

En **Administración → Cuentas del equipo** (`/administracion/cuentas`) se puede buscar por nombre o correo, crear cuentas, editar nombre/correo/perfil, desactivar o reactivar y establecer una nueva contraseña. La lista incluye cuentas desactivadas y se pagina de veinte en veinte.

Los perfiles son `ADMIN`, `RECEPCION` y `KINESIOLOGO`. Administración no concede permiso clínico. Este panel no modifica cuentas familiares ni asigna la autoría de evaluaciones anteriores a una persona distinta.

Las contraseñas tienen entre 12 y 128 caracteres y se guardan con scrypt y sal individual. Al crear una cuenta, administración define la contraseña inicial y la entrega directamente al titular por un medio seguro. Para cambiarla, completa los dos campos de contraseña en la edición; dejarlos vacíos conserva la actual. No se muestran claves anteriores, hashes ni secretos en la lista, respuestas o auditoría. No hay recuperación por correo ni cambio obligatorio en el primer ingreso en esta entrega.

Guardar un cambio incrementa la versión de la cuenta e invalida sus sesiones anteriores. La desactivación impide ingresar; reactivar no restaura sesiones antiguas. Los cambios requieren que el titular vuelva a entrar. Si administración edita su propia cuenta, la pantalla vuelve al acceso después de guardar cambios efectivos. Un envío sin cambios no cierra sesiones.

## Protecciones

- Solo administración accede a las APIs. La identidad y el perfil se leen de la sesión y de la base; el navegador no puede elegir el actor ni enviar hashes de contraseña.
- No se permite desactivarse ni quitarse el propio perfil de administración. Los cambios se serializan y se comprueba que siempre quede un administrador activo, incluso ante solicitudes simultáneas.
- No se cambia el perfil ni se desactiva a una profesional con una atención abierta. Primero debe guardarla, devolverla a la fila o marcar la ausencia según corresponda. La reserva de una nueva atención comparte el bloqueo de la cuenta y vuelve a comprobar su acceso.
- Las ediciones exigen la versión leída; una versión antigua produce conflicto y pide actualizar. Los correos son únicos, normalizados y reservados también mientras la cuenta esté desactivada.
- Los reintentos de una creación con el mismo identificador y datos devuelven la misma cuenta. No se crean dos personas por perder una respuesta.
- Las cuentas se desactivan, no se eliminan. Los identificadores de autoría y movimientos permanecen estables.
- `CambioCuentaEquipo` registra actor, cuenta, hora, valores anteriores/nuevos y si cambió la contraseña. La auditoría se guarda en la misma transacción y no contiene contraseñas ni hashes; su pantalla de consulta sigue pendiente.

Las respuestas son privadas y sin caché. El límite de intentos del equipo ya usa PostgreSQL compartido. La pantalla permite cerrar las sesiones de otras cuentas con auditoría; cada integrante gestiona las propias desde Seguridad y sesiones (ver SEGURIDAD_EQUIPO.md).

## Transición desde la configuración anterior

La migración `20261109000900_cuentas_equipo` añade `CuentaEquipo`, `RegistroEquipo` y `CambioCuentaEquipo`; no altera pacientes, evaluaciones ni movimientos.

Después de aplicarla y reiniciar, la primera consulta autenticada del equipo importa de forma transaccional `CASKU_TEAM_ACCOUNTS`, conservando IDs, nombres, correos, perfiles, estados y hashes. Debe existir al menos una cuenta administradora activa. Un marcador único impide repetir la importación en reinicios o entre instancias. Después, la base es la fuente de acceso: cambiar el entorno no restaura una contraseña ni reactiva una cuenta.

Las sesiones anteriores a esta transición requieren volver a iniciar sesión. No eliminar la configuración inicial antes de que la importación termine correctamente. Una vez importada, no es necesario seguir manteniendo esa lista para gestionar usuarios.

`npm run account:create` queda reservado para preparar el acceso inicial de una instalación todavía no importada, con migraciones aplicadas. El asistente comprueba el marcador y, si ya está importada, dirige al panel sin modificar la configuración. No proporciona una puerta alternativa para recuperar cuentas desactivadas. La recuperación si se pierde todo acceso administrador requiere intervención autorizada fuera del panel y no se resuelve agregando cuentas al entorno.

Aplicar con `npm run db:deploy`, regenerar con `npx prisma generate` y reiniciar desarrollo. No usar `db push` ni `migrate reset`.

## Comprobación

`npm test` verifica validación de perfiles, estados, versiones, contraseñas y campos ignorados. `npm run test:families` también verifica importación, permisos de cuentas, creación idempotente, edición, cambio de perfil, desactivación/reactivación, contraseñas, revocación de sesiones, atención activa, protección de administradores y rollback de auditoría. Todo se ejecuta en PostgreSQL temporal con correo ficticio.

Las suites `test:events` y `test:http` comprueban los recorridos existentes con la autenticación persistida. La suite de acceso ahora utiliza una base local temporal porque validar las cuentas requiere consultar la base. Ejecutar las suites HTTP por separado y TypeScript al finalizar. Se conservan ESLint y validación de Prisma; la compilación de producción sigue pendiente por la restricción del proceso auxiliar de estilos de Turbopack documentada en etapas anteriores.

## Contraseñas y recuperación

Las nuevas cuentas y las claves asignadas desde administración son temporales. Su titular debe cambiarlas antes de utilizar las funciones del equipo. La propia contraseña se cambia desde Cambiar contraseña, indicando la actual. Ver [CLAVES_EQUIPO.md](CLAVES_EQUIPO.md); los envíos reales de recuperación siguen pendientes de Brevo. Esta política actualiza el comportamiento de contraseñas descrito en la etapa inicial de cuentas.
