# Contraseñas temporales y recuperación del equipo

## Cuentas nuevas y claves reasignadas

Las cuentas creadas desde administración reciben una contraseña temporal. Cuando administración asigna otra contraseña a una persona, también se marca como temporal y se cierran sus sesiones anteriores. Los valores enviados por el navegador no pueden desactivar esa marca.

La persona ingresa con la clave recibida y se dirige a `/equipo/cambiar-clave`. Debe confirmar la contraseña actual y elegir otra de entre 12 y 128 caracteres. Hasta completar ese cambio, el servidor bloquea las API del equipo y redirige sus páginas privadas a ese formulario. Cambiar una dirección web o manipular los datos de sesión no concede acceso.

El cambio propio está disponible también para las cuentas con clave definitiva, desde el menú del equipo. Cierra todas sus sesiones y exige ingresar nuevamente. Conserva perfil, estado de la cuenta, fichas, evaluaciones y atención asignada. Administración no cambia su propia contraseña desde el editor de cuentas: utiliza este formulario e indica la actual.

El asistente inicial de cuentas guarda la marca de contraseña temporal para nuevas configuraciones. Las configuraciones y cuentas anteriores sin marca se conservan como estaban: la migración no presume que todas sus claves son temporales, no cambia hashes ni fuerza cierres masivos. Para reasignar una clave de una cuenta anterior, administración entrega una nueva temporal por el procedimiento autorizado.

## Recuperación por enlace

La pantalla `/recuperar-clave` está enlazada desde el acceso del equipo. Las cuentas familiares mantienen su acceso por código y no usan contraseñas del equipo.

La solicitud devuelve el mismo mensaje para direcciones conocidas, inexistentes o desactivadas, para el transporte no disponible y cuando se alcanza un límite. No devuelve token, identificador de cuenta ni información sobre si existe la dirección. Los POST requieren el origen configurado en `AUTH_URL` o `NEXTAUTH_URL`; un encabezado Host o destino enviado por el cliente no determina el enlace.

Un enlace contiene 32 bytes aleatorios y vence a los 30 minutos. El secreto va en el fragmento `#token=...`, no en parámetros que se transmitan al servidor al abrir la página. La pantalla lo guarda solo en memoria y limpia el fragmento del navegador; no lo almacena en almacenamiento local. Abrir el enlace no consume el token. Si se recarga la pantalla, puede ser necesario volver a abrir el enlace del correo.

La base guarda únicamente su HMAC, cuenta, versión, estado y fechas. La confirmación exige una contraseña nueva y coincidente, diferente de la actual. No permite escoger otra cuenta, perfil o estado. La persona debe volver a iniciar sesión después; no se crea una sesión automáticamente.

Solo hay un enlace activo por cuenta. Uno nuevo sustituye al anterior después de que el transporte confirme su aceptación. Si falla el envío, el enlace anterior válido se conserva. Una respuesta incierta o una interrupción antes de activar el nuevo enlace puede dejarlo inutilizable: la persona solicitará otro, sin que su contraseña cambie por recibir un correo.

Los cambios administrativos, desactivaciones, versiones de cuenta nuevas y cambios de contraseña invalidan los enlaces anteriores. La confirmación se bloquea por cuenta y comprueba vigencia con el reloj de PostgreSQL. Dos confirmaciones simultáneas del mismo token solo pueden aplicar un cambio.

## Estado de los envíos reales

**La recuperación está conectada a Brevo, con envíos reales desactivados hasta disponer de clave de API y remitente verificado.** En una instalación real, la solicitud muestra el mensaje genérico y no crea enlaces de recuperación ni usa Resend como sustituto. Mientras tanto, otro administrador habilitado puede reasignar una contraseña temporal a quien lo necesite.

El transporte está separado en `src/lib/team-passwords/delivery.ts` y utiliza el adaptador compartido de Brevo. Ver [BREVO_TRANSACCIONAL.md](BREVO_TRANSACCIONAL.md). La simulación integrada se limita a desarrollo, dirección de loopback y clave ficticia. Las pruebas del servidor compilado interceptan explícitamente el proveedor con un archivo exclusivo de pruebas y ejercitan la solicitud y el enlace recibidos; no insertan tokens para sustituir este recorrido ni habilitan un acceso alternativo en producción.

La solicitud actual espera al transporte; antes de habilitar envíos reales debe evaluarse el procesamiento desacoplado para evitar diferencias de tiempo que permitan inferir cuentas. La respuesta pública es genérica, pero no se declara un tiempo de respuesta constante. Las pruebas de esta etapa usan únicamente el proveedor simulado; la validación de entrega real sigue pendiente.

## Límites y sesiones

Los límites viven en PostgreSQL y se comparten entre procesos. Se aplican 60 operaciones por minuto por clase de operación, tres solicitudes por correo cada 15 minutos, cinco confirmaciones por token y cinco intentos de cambio propio por cuenta cada 15 minutos. En recuperación se añade un límite de 20 operaciones por red cada 15 minutos. La señal de red es complementaria; no reemplaza los límites globales ni por cuenta/token.

Las reservas se confirman antes de comprobar las credenciales: una operación fallida o revertida no borra el intento. Al cambiar correctamente una contraseña se aumenta la versión de cuenta, se revocan todas sus sesiones y se invalidan otros enlaces. También se limpia el bloqueo de acceso de esa cuenta para permitir ingresar con su nueva clave; el límite global permanece.

Las filas caducadas de límites se limpian en lotes acotados. Los tokens con más de siete días desde su vencimiento se eliminan en lotes durante solicitudes de prueba con transporte disponible. El despliegue posterior debe confirmar su ejecución periódica y retención; el historial de cambios de credencial se conserva separado de esos tokens.

## Auditoría, migración y pruebas

El cambio de clave, la marca temporal, la revocación de sesiones, la invalidación/consumo de enlaces y la auditoría se guardan en una transacción. Si falla el historial, no cambia la contraseña ni se consume el enlace. La auditoría contiene acción y versiones, sin contraseñas, hashes de contraseña o tokens.

La migración añade el estado y la tabla de recuperación sin modificar las contraseñas, perfiles, versiones o sesiones existentes. Después de aplicar migraciones y generar Prisma, reiniciar el servidor local para cargar el cliente actualizado.

`npm test` valida formularios. `npm run test:families` cubre claves temporales en los tres perfiles, cambio propio, respuestas genéricas, expiración, reemplazo, fallo de envío, uso único, carreras, cuentas desactivadas, invalidación y rollback auditado. `npm run test:security` añade migración conservadora, bloqueo no manipulable, límites entre dos servidores, cambios concurrentes y revocación de cookies en ambos. `npm run test:production` comprueba el servidor compilado y que el transporte real siga desactivado. Todo utiliza datos ficticios y bases temporales.
