# Autenticación compartida y sesiones del equipo

## Intentos de ingreso

El acceso `equipo` sustituye el contador en memoria por reservas atómicas en PostgreSQL, usando `LimiteSolicitud`. Todos los servidores que usan la misma base y `AUTH_SECRET` comparten la protección. Reiniciar un servidor no reinicia el bloqueo.

- Cinco intentos fallidos o todavía en verificación por correo normalizado, dentro de una ventana fija de quince minutos. Alcanzado el límite, ni una contraseña correcta inicia sesión hasta que venza la ventana. El bloqueo no es permanente ni se prolonga con cada intento rechazado.
- Un ingreso correcto libera únicamente su reserva, sin borrar fallos anteriores ni simultáneos. La liberación y la creación de la sesión se confirman juntas.
- Límite global de sesenta intentos por minuto para el acceso del equipo, incluidos los correctos, que acota el uso de contraseñas y la creación de claves de correos inventados. Cuando se alcanza, todos los ingresos del equipo esperan al siguiente vencimiento; las sesiones existentes y el acceso familiar siguen operativos.
- Reloj de PostgreSQL para ventanas y vencimientos. Las claves son HMAC; los contadores no almacenan correos, contraseñas ni direcciones IP. La limpieza de contadores vencidos está acotada y vuelve a comprobar su vencimiento antes de borrar.
- Las cuentas inexistentes o desactivadas realizan una comprobación scrypt ficticia; las respuestas de error son genéricas y no confirman la existencia de una cuenta. Entradas incompletas, desproporcionadas o con correo inválido se rechazan antes de comprobar contraseñas.
- Un error de base impide autenticar; no existe respaldo permisivo en memoria. No se confían cabeceras de IP reenviadas para conceder excepciones. El límite global no sustituye la protección de tráfico del alojamiento.

Los límites del acceso familiar ya permanecían en base de datos y conservan sus reglas. Este cambio no incorpora recuperación ni cambio inicial obligatorio de contraseña; corresponden al pendiente siguiente de contraseñas.

## Sesiones revocables

Se conserva Auth.js con JWT cifrado y cookies protegidas por sus reglas predeterminadas. Cada nuevo ingreso del equipo también crea una fila `SesionEquipo`. Un secreto aleatorio viaja únicamente en el JWT; la base conserva su HMAC y la API devuelve un identificador público distinto, sin el secreto. Se usan los callbacks JWT y el evento de cierre descritos en la [referencia oficial de Auth.js](https://authjs.dev/reference/core).

Cada consulta autenticada valida cuenta activa, versión de la cuenta y sesión vigente en la base. `getTeamUser` mantiene además la comprobación de perfil y versión antes de permitir las operaciones del equipo. Actualizar la sesión desde el navegador no permite cambiar su identidad, perfil, secreto ni plazo.

- Ocho horas máximas desde el ingreso, aunque se renueve la cookie o se consulte continuamente. El vencimiento devuelto por la API tampoco supera este plazo.
- Treinta minutos sin solicitudes autenticadas. Las consultas automáticas de recepción, resultados y otras pantallas cuentan como actividad; no es un detector de teclado ni de presencia física.
- Hasta cinco sesiones activas por cuenta. Un ingreso adicional cierra las más antiguas bajo bloqueo de la cuenta; los ingresos simultáneos no eluden el máximo.
- Cierre normal y remoto registrado en el servidor: copiar una cookie no permite reutilizar una sesión cuya revocación se confirmó.
- Los cambios administrativos de cuenta, contraseña, perfil o estado revocan sus sesiones dentro de la misma transacción, además de incrementar la versión existente.

Cerrar o vencer una sesión conserva la fila, reservas de atención y evaluaciones guardadas. No devuelve ni reasigna una atención automáticamente y no recupera mediciones sin guardar. Esa recuperación mantiene su pendiente separado. Las filas de sesión se limpian en lotes al iniciar sesión, cuando llevan más de siete días desde su vencimiento; no hay un proceso permanente de limpieza.

Las cookies del equipo anteriores a esta entrega no tienen una sesión registrada y dejan de autorizar: se requiere volver a ingresar. Las sesiones familiares conservan su funcionamiento anterior.

## Pantallas y permisos

**Seguridad y sesiones** (`/seguridad`) está disponible para los tres perfiles del equipo. Muestra fechas de ingreso, última actividad, vencimiento y cuál es la sesión actual. Permite cerrar una sesión propia o todas, incluida la actual. No se recopilan nombres de dispositivo, navegador ni IP para etiquetarlas.

`GET /api/equipo/sesiones` solo devuelve sesiones propias vigentes; `POST` recibe `CERRAR_UNA` con `sesionId`, `CERRAR_ACTUAL`, o `CERRAR_TODAS`. Se exige JSON y sesión del equipo; una sesión ajena no se cierra. El cierre de la sesión actual redirige a ingreso. El botón normal del encabezado confirma la revocación antes de cerrar la cookie; si no puede confirmarse, no anuncia un cierre exitoso.

En **Administración → Cuentas del equipo**, **Cerrar sus sesiones** cierra los accesos de otra cuenta sin cambiar su contraseña ni perfil. `POST /api/administracion/cuentas/[id]/sesiones` exige administración y la versión actual de la cuenta. Incrementa esa versión y registra actor y cambio en la auditoría; una versión antigua no se aplica silenciosamente. La propia cuenta se gestiona desde su pantalla de seguridad. Cerrar sesiones permite volver a ingresar con la contraseña vigente; no reemplaza un cambio de contraseña cuando corresponda.

Las respuestas son privadas y sin caché. Se conservan los controles CSRF de Auth.js y no se sustituyen sus validaciones de contraseña por datos enviados desde el cliente.

## Migración y verificación

`20261110000500_seguridad_equipo` añade únicamente la tabla de sesiones y sus restricciones e índices. No cambia contraseñas, perfiles, versiones, cuentas familiares, registros clínicos ni reservas existentes. Aplicar `npm run db:deploy`, regenerar Prisma y reiniciar desarrollo. Los límites del equipo empiezan una nueva ventana compartida; no hay traslado de los anteriores contadores en memoria.

`npm run test:security` ejecuta dos servidores Next con directorios temporales separados y una base PostgreSQL local efímera. Verifica migración, límites simultáneos entre procesos y tras reinicio, normalización, vencimiento, ingreso correcto sin borrar otros fallos, protección CSRF, propiedad de sesiones, secretos almacenados como HMAC, cierres remotos y normales, copia de cookie, vencimiento absoluto e inactividad, máximo de sesiones, revocación administrativa auditada, cambios de sesión manipulados y errores de base sin acceso. No usa la base configurada ni envía correos. El transporte de prueba mantiene unidos los mensajes de cada consulta y transacción para evitar la limitación del multiplexor de PGlite con portales sin nombre; no simula conexiones independientes de PostgreSQL real.

Ejecutar secuencialmente `test:security`, `test:families`, `test:events` y `test:http`, porque comparten el directorio primario de pruebas. Al terminar, ejecutar TypeScript; conservar las pruebas unitarias, ESLint y validación de Prisma. La compilación de producción conserva su pendiente de Turbopack y no se declara resuelta por estas pruebas de desarrollo. El ensayo con PostgreSQL temporal no sustituye las pruebas de carga y de conexión con PostgreSQL real previstas en los pendientes técnicos.
