# Implementación por etapas

El código actual es la continuación del proyecto de Downloads, copiado a Documents/ChatGPT/casku con los cambios locales que ya existían. El original no se modifica. La base de datos no se migró ni se escribieron pacientes durante las pruebas.

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

Desde esta carpeta, ejecutar `npm run account:create`. El asistente pide correo, nombre, perfil y una contraseña de al menos 12 caracteres que no se muestra. Guarda el hash en `.env.local`, crea AUTH_SECRET si no existe y no imprime contraseñas. Repetir por cada integrante; reiniciar el servidor después de cambios.

Ejecutar `npm run dev` y abrir /login. El perfil depende de la cuenta; no se elige desde el navegador. La sección Familias indica que la verificación por correo llegará en la siguiente etapa.

Conservar DATABASE_URL en la configuración privada. Para desactivar una cuenta, poner `active: false` en su entrada de CASKU_TEAM_ACCOUNTS y reiniciar. Cambiar contraseña o perfil invalida las sesiones anteriores. Los perfiles se administran por configuración en esta etapa, no desde una pantalla pública.

### Comprobaciones

`npm test`, `npx tsc --noEmit`, `npm run lint` y `npm run build`. Las pruebas automatizadas no escriben en la base ni envían correos. Las pruebas HTTP de acceso deben usar cuentas efímeras y limitarse a operaciones que terminan antes de acceder a la base.

En esta entrega pasaron las cinco pruebas unitarias, TypeScript, ESLint y `npm run test:http` (ingreso, permisos, apertura de pantalla y cierre de sesión de los tres perfiles). La compilación de producción quedó bloqueada por `Operation not permitted` al abrir el proceso auxiliar de estilos de Turbopack en este entorno. No se verificó el guardado contra la base real. No se aplicaron migraciones.

Antes de publicar en internet: configurar HTTPS, AUTH_URL y AUTH_SECRET; usar almacenamiento compartido para limitar intentos si hay varias instancias y trasladar la provisión del equipo a cuentas persistentes/invitaciones. El límite actual es por cuenta y proceso (5 intentos / 15 minutos). Las fórmulas clínicas existentes se conservaron sin validar ni alterar sus umbrales médicos.

## Etapa 2 — Familias, eventos e inscripciones

- Modelar apoderado, bebé, evento e inscripción por separado; un apoderado puede tener varios bebés.
- Sustituir el acceso familiar por verificación real de correo con códigos de un solo uso, expiración y límite de intentos.
- Relacionar datos históricos con el apoderado solo después de verificar identidad; nunca por conocer un RUT.
- Asignar el número por evento con restricción única y operación atómica. La inscripción no es un turno.
- Confirmación, QR con identificador opaco y registro del estado de entrega del correo. Definir dominio remitente y datos del evento.
- Preparar migración aditiva y ensayarla con datos de prueba antes de aplicarla a la base existente.

## Etapa 3 — Recepción y fila

- Confirmar llegada, inscripción del día, ausencias y reincorporaciones.
- Fila común con proporción configurable y prioridad por espera. Los ejemplos 3:1 y 30 minutos están pendientes de validar con capacidad y tiempos reales.
- Reserva atómica al llamar para impedir que dos profesionales atiendan la misma inscripción.
- Abrir el formulario existente con los datos de la inscripción, sin volver a escribir bebé, correo o profesional.
- Definir la política de cupos, atrasos y reincorporación antes de automatizarla.

## Etapa 4 — Publicación, resultados y seguimiento

- Borrador, publicación explícita, autoría clínica y trazabilidad de correcciones.
- Solo el apoderado verificado accede a sus bebés y resultados publicados.
- Cola de correo/reintentos, persistencia del estado de entrega e idempotencia para evitar evaluaciones duplicadas.
- Configuración visual de eventos, accesos, reportes operativos y seguimiento de familias con permisos específicos.
- Definir quién contacta a las familias y qué datos necesita antes de construir seguimiento.
