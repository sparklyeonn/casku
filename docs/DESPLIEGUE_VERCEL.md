# Despliegue de Casku en Vercel

## Estado

Preparación local, sin cuenta de Casku conectada, suscripción activada, publicación, DNS, migración real ni envíos. La cuenta personal de la desarrolladora existe, pero la titularidad del proyecto sigue pendiente. Se recomienda un equipo bajo control de Casku con accesos individuales, separado de LKS.

`vercel.json` configura Next.js, `npm ci` y `npm run build`. No contiene secretos, migraciones ni cron activo. `.vercelignore` excluye archivos de entorno y respaldos si se usa CLI; las variables privadas se introducen en el panel y nunca en Git.

## Cuenta y plan

1. Casku debe designar quién conservará la propiedad y la facturación.
2. Esa persona crea su acceso a Vercel y un equipo para Casku. La desarrolladora puede ser invitada con su usuario existente; no se comparten contraseñas ni se mueve LKS.
3. Revisar antes de aceptar: Pro tiene una base de US$20/mes, un asiento de despliegue y US$20 de crédito de consumo incluidos; cada asiento adicional de despliegue suma US$20/mes, más impuestos y posibles consumos. Si ambas personas necesitan permisos de despliegue, presupuestar ambos asientos. Los usuarios de la aplicación no son asientos de Vercel. Los espectadores de solo lectura tienen un rol distinto y no pueden desplegar.
4. No activar una prueba o suscripción sin acordar el costo y su renovación. Hobby no debe utilizarse como alojamiento oficial de este sistema comercial. Se puede preparar el código sin contratar nada.

## Importar el repositorio

Con la titularidad y el plan definidos, entrar al equipo correcto y usar Add New → Project → importar `sparklyeonn/casku`. Autorizar solo el repositorio necesario. No desplegar desde otra carpeta ni olvidar que los cambios locales deben estar en GitHub para aparecer.

Seleccionar Next.js, directorio raíz del repositorio, Node 22.x compatible con engines y .nvmrc. Mantener salida automática del framework; no usar exportación estática. Los comandos están declarados en vercel.json. No ejecutar `db:deploy` como parte del build.

Antes de pulsar Deploy, configurar las variables privadas del entorno de ensayo siguiendo [PREPARACION_DESPLIEGUE.md](PREPARACION_DESPLIEGUE.md) y `deploy/ensayo.env.example`. Usar un proyecto/base separados con datos ficticios. La base real de Neon se conserva intacta.

## Variables y aislamiento

Usar un dominio HTTPS estable para AUTH_URL y, si existe, el mismo NEXTAUTH_URL. Conservar secretos propios y estables por entorno. No copiar toda .env.local ni utilizar variables NEXT_PUBLIC para secretos.

El alcance Production de Vercel significa la rama principal del proyecto, no autorización para usar pacientes o envíos generales: un proyecto de ensayo puede tener VERCEL_ENV=production y debe seguir usando base ficticia y destinatarios restringidos. Las ramas Preview necesitan su propia conexión de ensayo, no la conexión real.

Mantener recuperación, automatización clínica, webhook y Calendly desactivados inicialmente. Para acceso familiar de ensayo, habilitar únicamente el transporte Brevo restringido a los dos destinatarios autorizados. El preflight no envía mensajes ni confirma la identidad de una base.

Las migraciones de una base nueva se aplican por separado con destino comprobado. No cambiar los secretos de la base real para preparar el ensayo. La región de ejecución se decide considerando la ubicación de Neon; no se fija una región arbitraria en el repositorio.

## Recuperaciones y cron

La nueva ruta GET `/api/interno/recuperaciones/cron`:
- autentica con CRON_SECRET, con comparación de tiempo constante;
- solo procesa cuando VERCEL_ENV=production y CASKU_PASSWORD_RECOVERY_ENABLED=1;
- exige que el secreto del cron y CASKU_PASSWORD_RECOVERY_WORKER_SECRET sean distintos y válidos;
- reutiliza internamente el POST existente y sus bloqueos, límites e idempotencia, sin llamadas HTTP externas;
- tiene duración máxima de 120 segundos, no cachea respuestas y no devuelve claves ni detalles de excepciones.

No se añade un cron clínico ni se habilitan correos por añadir esta ruta.

Después de confirmar Pro y verificar el ensayo, integrar el contenido de `deploy/vercel.pro.cron.json.example` en vercel.json. El ejemplo programa solo recuperaciones cada minuto; no está activo. Crear CRON_SECRET como variable privada Production del proyecto correspondiente, diferente de todos los demás secretos. Vercel la incorpora al Authorization del cron. Mantener habilitada la exposición de variables de sistema de Vercel para VERCEL_ENV y VERCEL.

Configurar las claves y habilitar la recuperación solo al verificar el transporte y el procesamiento. Redeploy tras modificar variables y comprobar en los registros del cron su respuesta y procesamiento de una recuperación ficticia. Pro admite la frecuencia del ejemplo; Hobby no permite esa programación. El GET protegido por sí solo no crea una programación.

Las invocaciones frecuentes pueden mantener Neon despierto aun con la cola vacía. Antes de dejar el trabajo activo permanentemente, revisar el consumo del plan Free (100 CU-horas/mes) y medir este efecto. No reducir la seguridad ni retrasar silenciosamente las recuperaciones para ahorrar cómputo.

La protección de acceso del despliegue debe permitir el cron y los webhooks autenticados que realmente se activen, sin quitar las comprobaciones de autorización de la aplicación.

## Aceptación y subdominio

Verificar compilación, inicio/cierre de sesión, perfiles, inscripción ficticia y QR, recepción, fila concurrente, evaluación, publicación y consulta familiar. Probar envío, recuperación de un solo uso y cron en el ensayo restringido. No considerar una portada con HTTP 200 como aceptación completa.

En Settings → Domains añadir el subdominio aprobado por Casku y utilizar exactamente los registros DNS que Vercel indique en Wix. Conservar raíz, www y registros de correo existentes. Verificar resolución y HTTPS antes de cambiar AUTH_URL, enviar enlaces o habilitar acceso oficial.

El seguimiento clínico conserva sus pendientes. Calendly no se vincula automáticamente por nombre o correo. La apertura oficial sigue requiriendo las verificaciones y acuerdos del proyecto.

Configurar alertas de consumo y decidir expresamente si se acepta una pausa del servicio por presupuesto; los controles no son un tope instantáneo garantizado. No habilitar extras de pago ni almacenar datos privados en logs.

## Fuentes

- [Next.js en Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Plan Pro y asientos](https://vercel.com/docs/plans/pro-plan)
- [Condiciones de Hobby](https://vercel.com/legal/terms)
- [Autenticación del cron](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs)
- [Frecuencias del cron](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)
- [Control de consumo](https://vercel.com/docs/spend-management)
