# Inscripción familiar

## Recorrido

1. Administración crea el evento y abre sus inscripciones en `/administracion`. Crear o seleccionar no abre inscripciones automáticamente.
2. La familia consulta `/inscripcion`, elige evento y verifica su correo desde `/login?portal=familias`.
3. Un código de seis dígitos permite ingresar sin contraseña. Vence en diez minutos, admite cinco intentos y se consume una sola vez. Solicitar otro invalida el anterior.
4. En `/familias` registra al bebé o selecciona uno propio, completa el nombre del apoderado y confirma. RUT del bebé, RUT del apoderado y teléfono son opcionales; los RUT ingresados deben tener dígito válido.
5. La inscripción reserva un cupo y asigna un número único dentro del evento. Cada bebé tiene su propia inscripción. El número no representa una hora ni una posición en la fila.
6. El comprobante queda disponible en el portal y se intenta enviar por correo con fecha, lugar, número y QR PNG adjunto e integrado en el mensaje.

## Correo pendiente de habilitar

Casku debe entregar un remitente de dominio verificado para configurar `RESEND_FROM` junto con `RESEND_API_KEY`. `AUTH_URL` debe apuntar al portal correcto (HTTPS al publicar). **El remitente sigue pendiente; no se enviaron mensajes reales durante la implementación.**

Sin remitente no se envían códigos ni se omite la verificación. No hay códigos públicos, sesiones de demostración ni remitente de prueba automático. `npm run test:families` usa un proveedor HTTP local ficticio, permitido solo en desarrollo con el modo de pruebas explícito; sobrescribe las credenciales y la conexión a la base.

La inscripción y su correo pendiente se guardan en una transacción. Un fallo de correo conserva el cupo, número y comprobante. El botón **Reintentar correo** respeta una pausa de un minuto; una reserva temporal de envío impide solicitudes duplicadas simultáneas y permite recuperar envíos interrumpidos. Se reutiliza la clave de idempotencia del proveedor mientras este la conserve. No existe todavía un proceso automático de reintento ni webhooks: `ENVIADO` significa aceptación del proveedor, no entrega al buzón. Se necesita monitoreo y reintento programado para operación desatendida.

## Datos y permisos

- La cuenta familiar corresponde al correo verificado, con sesión de ocho horas. Desactivarla o cambiar `versionSesion` revoca su acceso.
- Las consultas, los QR y los reintentos verifican la propiedad en el servidor; otra familia no obtiene el comprobante. El QR contiene solo un identificador aleatorio opaco, sin RUT, nombre, correo ni resultados clínicos.
- Paciente y apoderado son entidades separadas. Los bebés históricos permanecen sin dueño; conocer un RUT no concede acceso. Un RUT ya registrado requiere revisión de Casku antes de vincularlo.
- No se publican resultados clínicos en el portal familiar durante esta etapa. Recepción ya busca por QR o número, confirma llegadas y agrega a la fila de espera (ver RECEPCION.md). Kinesiología ya llama al siguiente paciente y abre su formulario con los datos registrados (ver KINESIOLOGIA.md).
- Los límites de códigos se guardan en PostgreSQL: uno por minuto y cinco por hora por correo, y veinte por hora por dirección de cliente. La infraestructura debe proporcionar cabeceras de IP confiables y retirar las enviadas por el visitante. Cada apoderado tiene además un límite de treinta inscripciones por hora.
- Códigos y secretos del navegador se guardan como HMAC con `AUTH_SECRET`; no se guardan códigos en claro. Los registros de límite usan claves derivadas. Debe programarse la limpieza de desafíos y límites vencidos antes de operar de forma prolongada.

## Persistencia y comprobación

La migración `20261109000200_inscripcion_familiar` añade cuentas, desafíos, límites, inscripciones y estados de correo. Añade contadores al evento y relaciones opcionales al paciente, y permite un RUT nulo. Conserva los valores y las evaluaciones anteriores. No vincula pacientes históricos ni crea eventos o familias de prueba en la base configurada.

La asignación bloquea el evento dentro de una transacción, verifica apertura, fecha y cupos y actualiza número, contador, bebé e inscripción juntos. Las restricciones únicas cubren número por evento y bebé por evento; la clave de envío permite repetir una solicitud sin otra reserva.

La migración se aplicó correctamente a la base configurada después de las pruebas aisladas; no se crearon familias ficticias ni se enviaron correos reales.

En otros entornos, ejecutar `npm run db:deploy` para aplicar migraciones y `npx prisma generate` para actualizar el cliente. Reiniciar el desarrollo después. No usar `db push` ni `migrate reset`.

`npm run test:families` comprueba el acceso por código, permisos, bebés sin RUT, varios bebés, números por evento, reintentos, QR privado, correo recuperable, dos solicitudes al último cupo y conservación de datos clínicos anteriores. Usa PGlite y correo locales; no utiliza Neon. Su multiplexación de conexiones no sustituye una prueba de carga con PostgreSQL real antes del evento.

Ejecutar también `npm test`, `npm run test:events`, `npm run test:http`, `npm run lint` y `npx tsc --noEmit`. Las pruebas HTTP deben ejecutarse por separado porque comparten `.next-tests`.

Verificación de esta etapa: doce pruebas unitarias, tres suites HTTP, TypeScript, ESLint y validación Prisma correctos. La compilación de producción continúa bloqueada en este entorno: el proceso de estilos de Turbopack no puede abrir su puerto local, incluso al repetir con permisos ampliados. Debe verificarse la compilación en el entorno de despliegue antes de publicar.
