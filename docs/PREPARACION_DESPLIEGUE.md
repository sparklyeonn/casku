# Preparación de hosting y despliegue de Casku

## Estado y decisión pendiente

La web institucional continúa en Wix. No hay un proyecto de alojamiento del sistema creado ni un despliegue publicado. No se contrataron servicios, cambiaron DNS, configuraron servicios externos ni aplicaron migraciones sobre la base real. Los cambios anteriores de seguridad de Next.js y esta preparación están pendientes del commit habitual en la carpeta principal.

La aplicación existente utiliza Next.js 16.4.6 con servidor Node.js, NextAuth, Prisma y PostgreSQL. No es un sitio estático: exportar HTML o subir archivos al editor Wix no conserva las API, las sesiones, las colas y los datos.

Wix dispone también de Headless administrado, pero su alojamiento de servidores exige un resultado compatible con Cloudflare Workers. El proyecto actual está preparado y probado con Node.js, no con ese adaptador. Usar Wix Headless sería una adaptación que requiere evaluar y verificar Next.js, Prisma, conexiones PostgreSQL, criptografía, sesiones y procesos privados. No se cambió la arquitectura para asumir esa compatibilidad.

La vía directa es crear un proyecto independiente en un alojamiento compatible con Next.js/Node.js, manteniendo Wix y conectando después el subdominio. Vercel ofrece integración específica con Next.js; para este uso de Casku debe elegirse un plan adecuado para uso comercial, pues Hobby es personal/no comercial. Render ofrece un servicio Node.js y cron por comandos. La cuenta, la titularidad y el plan deben confirmarse antes de crear o contratar el servicio.

## Preparado en código

- `deploy/ensayo.env.example`: inventario de variables sin credenciales, con correo y servicios desactivados.
- `npm run deploy:check -- --stage ensayo`: comprueba las variables suministradas al proceso. No carga automáticamente `.env` ni `.env.local`, no conecta a PostgreSQL y no envía correos.
- `npm run deploy:check -- --stage produccion`: exige activación explícita del correo general, además de las otras comprobaciones. No modifica ninguna bandera.
- Las comprobaciones dan errores por variables faltantes, origen incorrecto, conexión remota sin SSL, secretos reutilizados, simuladores habilitados y configuraciones incoherentes de recuperación/webhook. Nunca imprimen sus valores.

Para comprobar un archivo privado concreto, después de completarlo y revisarlo:

```sh
node --env-file=/ruta/privada/hosting.env --experimental-strip-types scripts/verificar-despliegue.mjs --stage ensayo
```

Node conserva la prioridad de variables ya presentes en el proceso. Ejecutar con un entorno limpio para no mezclar configuraciones. Un resultado `variablesValidas: true` verifica formato y coherencia: no acredita acceso al proveedor, destino correcto de la base, migraciones aplicadas, un administrador creado, trabajos programados, entrega de correo ni aceptación clínica.

## Primera publicación de ensayo

1. Confirmar proveedor y cuenta propiedad de Casku, plan y acceso al repositorio `sparklyeonn/casku`. Subir primero los cambios revisados; importar el repositorio no incluye cambios locales sin commit.
2. Crear el proyecto de ensayo y reservar su URL HTTPS estable. Usar esa URL antes de disponer del subdominio; no inferirla de encabezados enviados por visitantes.
3. Crear una base PostgreSQL de ensayo separada y vacía, sin copiar pacientes ni cuentas reales. Confirmar nombre y entorno en el proveedor y conservar la conexión SSL privada. La comprobación de variables no demuestra ese aislamiento.
4. Introducir las variables del ejemplo mediante el gestor privado del hosting. `AUTH_URL` debe ser el origen exacto; si se usa `NEXTAUTH_URL`, debe coincidir. `AUTH_TRUST_HOST=true` se utiliza detrás del proxy confiable del alojamiento. No exponer secretos mediante variables `NEXT_PUBLIC_*`, commits o capturas.
5. Crear secretos independientes para esa base de ensayo y conservarlos en sus futuros despliegues. No reemplazar los secretos estables de producción: protegen sesiones, enlaces, idempotencia, supresiones y el cifrado de solicitudes.
6. Ejecutar la comprobación de variables. El modo inicial sin correo sirve para revisar el equipo; el acceso familiar por código no funciona con correo desactivado. Para probar familias, cargar la integración Brevo ya verificada, mantener `CASKU_MAIL_MODE=pruebas` y restringir los destinatarios a los dos correos autorizados. No ampliar la lista ni activar envíos generales con este procedimiento.
7. Revisar y aplicar `npm run db:deploy` únicamente contra la base nueva de ensayo. No ejecutar migraciones en `postinstall`, `prebuild` ni en cada despliegue Preview. La migración inicial y las siguientes se ejecutan como operación de liberación con destino confirmado.
8. Preparar el administrador inicial con el procedimiento privado de [CUENTAS_EQUIPO.md](CUENTAS_EQUIPO.md). El asistente actual prepara la configuración de importación; no crea por sí solo una cuenta directamente en la base. No copiar las cuentas reales para poblar el ensayo. Una vez importado el acceso inicial, gestionar el resto desde el panel.
9. Instalar con `npm ci`; compilar con `npm run build`. El `prebuild` genera Prisma y no migra datos. Conservar Node compatible con `.nvmrc` y `engines`; si el alojamiento selecciona por versión mayor, usar Node 22.x compatible.
10. En un servidor Node.js, iniciar con `npm run start`, respetando el `PORT` que asigne el proveedor. En Vercel, seleccionar el framework Next.js y su despliegue nativo, sin convertirlo en exportación estática.
11. Probar inicio/cierre de sesión, perfiles, una inscripción ficticia, QR, recepción, llamada, seis medidas, guardado, revisión y consulta familiar. Verificar los estados y permisos, no solo una respuesta HTTP 200. Las pruebas reales de correo siguen limitadas a los destinatarios autorizados.

## Procesos privados y conexiones externas

La recuperación de contraseñas no depende de visitas. `npm run recovery:process` invoca por POST la ruta `/api/interno/recuperaciones/procesar`, con un Bearer privado. Necesita programación frecuente, por ejemplo cada minuto, tiempo de ejecución suficiente para el lote y supervisión de fallos. Ese comando carga `.env.local` si existe: en el servidor usar únicamente las variables de su entorno y no subir el archivo local.

En un alojamiento con cron por comandos, programar el comando existente. Vercel Cron invoca rutas GET; no configurar directamente la ruta POST como si fuera compatible. La preparación de Vercel incluye un adaptador GET autenticado para recuperaciones, descrito en [DESPLIEGUE_VERCEL.md](DESPLIEGUE_VERCEL.md). Su programación está en una plantilla inactiva, pendiente de confirmar cuenta, plan y activación. La recuperación permanece desactivada hasta verificar el procesamiento.

Los webhooks de Brevo irán a `/api/webhooks/brevo`, con su Bearer privado. Confirmar antes el alcance de la cuenta de ensayo, las notificaciones de proveedor y la protección del despliegue; no desviar los webhooks reales de Casku por este ensayo. La automatización clínica sigue en `CASKU_MAIL_AUTOMATION=0`, independientemente del hosting.

Calendly mantiene su integración de lectura y las confirmaciones de inscripción pendientes. No se importan ni vinculan bebés por coincidencia de nombre o correo.

## Subdominio y apertura oficial

Al recibir permisos de Wix, se elegirá el subdominio y se agregará únicamente el registro indicado por el hosting. Después se comprobarán DNS y HTTPS. La dirección temporal seguirá siendo un ensayo hasta decidir su apertura oficial.

Cambiar `AUTH_URL` al subdominio definitivo, revisar cualquier `NEXTAUTH_URL`, enlaces de recuperación, acceso familiar, webhook y programadores. Los enlaces ya enviados apuntan a su origen original; no cambiar de dirección mientras haya recuperaciones activas sin plan de transición.

La apertura oficial requiere además confirmar base y cuentas, respaldos/restauración, acceso del equipo, privacidad, dominio, ejecución periódica y activación explícita de correos. No contratar, cambiar al modo produccion ni migrar una base real como efecto secundario de conectar GitHub. Conservar el despliegue anterior para volver al código previo; un rollback de código no deshace migraciones ni revierte datos.

## Referencias

- [Wix: frameworks y servidores admitidos](https://dev.wix.com/docs/go-headless/wix-managed-headless/about-supported-frameworks).
- [Next.js: opciones de despliegue](https://nextjs.org/docs/app/getting-started/deploying).
- [Auth.js: despliegue y proxy](https://authjs.dev/getting-started/deployment).
- [Vercel: Next.js](https://vercel.com/docs/frameworks/full-stack/nextjs) y [uso del plan Hobby](https://vercel.com/docs/plans/hobby).
- [Vercel: cron y autenticación](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs).
- [Render: Next.js](https://render.com/docs/deploy-nextjs-app) y [cron por comandos](https://render.com/docs/cronjobs).
