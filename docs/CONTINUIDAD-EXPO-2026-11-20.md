# Continuidad de Casku — Expo Bebé, 20 de noviembre de 2026

Este documento permite retomar el trabajo si termina la sesión. No contiene claves ni datos identificables de familias. Actualizar el estado antes de cerrar el trabajo.

## Reglas de trabajo y carpeta correcta

- Repositorio activo: `/Users/constanzagonzalezlizama/Downloads/casku` (la carpeta Documents/ChatGPT/casku es una copia antigua de iCloud).
- El usuario hace TODOS los commits y push manualmente. Nunca ejecutar git add/commit/push, reset ni reescribir historial.
- Sitio publicado: https://casku-craneometrias.vercel.app/ . La base cuyo archivo local se llama `.env.vercel-ensayo` YA TIENE DATOS REALES del uso en Expo: tratarla como base operativa, no como fixture. No borrar ni restablecer datos.
- `.env.local` contiene proveedor Brevo y PAT Calendly; su DATABASE_URL es otra base y NO debe usarse por omisión para operaciones del sitio publicado.
- Guard de conexión histórica: `/private/tmp/casku-ensayo-verified.json` contiene SHA de la conexión publicada. Compararlo antes de cualquier operación autorizada; no imprimir conexiones.
- Node 22.14: `/Users/constanzagonzalezlizama/.nvm/versions/node/v22.14.0/bin/node`. Ante npm, agregar su carpeta al PATH.
- Leer AGENTS.md y documentación instalada de Next antes de cambios. No hay candidatos pendientes de feedback de Next en este trabajo.

## Solicitud actual y decisiones confirmadas

1. Fórmulas: CVA = abs(diagonal izquierda - derecha); CVAI = CVA / diagonal MAYOR * 100; CI = biparietal/AP *100, mostrar UN decimal; DPOE = abs(distancia POE-trago derecho - izquierdo), REEMPLAZA max de desviaciones anterior.
2. Usar tabla FINAL de Casku para plagiocefalia: CVA <3 /3–6 /7–12 /13–18 />18; CVAI <1,5 /1,5–3,5 /3,6–6 /6,1–8 />8; DPOE 0–5 /5–10 /10–15 /15–20 />20. NO usar la otra escala de interpretación habitual citada antes por la usuaria.
3. Clasificar indicadores separados; límites compartidos, huecos decimales y clasificación conjunta NO quedaron definidos. No inventar criterios ni tratamientos.
4. Conservar todos los históricos. Nuevo protocolo `casku-craneometria-v2`: nuevos campos de distancias completas; v1 conserva desviaciones y usa su interpretación original. No copiar v1 automáticamente a v2.
5. Resultados: editar borradores y poder enviarlos. ÚLTIMA DECISIÓN DEL USUARIO: permitir ENVÍO SIN CUENTA FAMILIAR, con CONFIRMACIÓN DEL DESTINATARIO Y AUTORIZACIÓN DEL APODERADO. ESTA AMPLIACIÓN AÚN ESTÁ PENDIENTE. Lo implementado hasta este checkpoint sigue exigiendo cuenta verificada para publicación actual. No darla por resuelta.
6. Crear Día 2, 21/11/2026, 150 cupos, Metropolitan Santiago: YA HECHO Y SINCRONIZADO, 31 reservas activas protegidas, 119 libres, cero evaluaciones anteriores alteradas. Disponible para seleccionar en administración, recepción y kinesiología. No crear duplicado.
7. Administración puede inscribir presencialmente sin adquirir permisos clínicos ni los otros accesos de recepción: implementado, pendiente comprobaciones finales y despliegue.
8. Recordatorios autorizados para sábado 21 y domingo 22 a las 09:00 America/Santiago (12:00 UTC), cada familia solo su día y horas. No requieren nueva aprobación del usuario para programar esos lotes exactos. Nunca convertir una fecha vencida en envío inmediato.
9. Brevo: usuario guardó variables en Vercel paso a paso, SIN redeploy todavía. Se le pidió mantener CASKU_MAIL_AUTOMATION=0. Seguimientos de semana/mes siguen apagados.

## Estado del código (sin commit)

- Fórmulas y snapshots v2, campos y vistas con separación histórica, CI1decimal, CVAI real y DPOE diferencia: implementados.
- `src/lib/results/protocol.ts` conserva compatibilidad de históricos de CUATRO medidas: editables/publicables/corregibles con fórmulas originales, sin inventar DPOE ni etiquetarlos v2. Seis medidas v1 requieren recaptura para adoptar v2.
- `ResultEditor`, resultados/listas, respuesta publicar, estado y reintentos de correo: mejoras implementadas. Correo presencial SIN cuenta todavía pendiente por nueva decisión del usuario.
- ADMIN/RECEPCION permiso exclusivo presencial: `onsite-access.ts`, API presencial GET/POST con origen validado, revalidación interna y `AdminOnsiteRegistration` integrado en EventManager. KINESIOLOGO no tenía inscripción presencial; no se le amplió sin autorización adicional.
- Propósito RESULTADO en `mail/brevo.ts`: sustituido bloqueo permanente por `CASKU_CLINICAL_MAIL_ENABLED=1` explícito, conservando consentimiento y restricciones de destinatario. Automatización sigue 0.
- `scripts/configurar-brevo.mjs`: prepara archivo privado, inspecciona remitente/cuenta/webhooks y permite crear/verificar webhook autenticado. Respuesta Brevo 400 document_not_found al listar webhooks significa que aún no hay ninguno; script ya la reconoce.
- `scripts/programar-recordatorios-jornadas.mjs`, `scripts/lib/daily-reminders.mjs`, `src/lib/event-reminders/daily.mjs`: nueva programación segura independiente del lote histórico18, planes por día, agrupación por correo, revalidación de TODAS las citas antes del primer POST, claves estables, supresión, recibos nativos durables antes de aceptación DB y protección ante resultados inciertos. 17 pruebas focales correctas.
- npm test ampliado a tests/*.test.ts y tests/*.test.mjs; no se eliminaron pruebas.

## Recordatorios: ESTADO CRÍTICO AL RETOMAR

- Plan sábado: 30 correos, 31 reservas. Hash `a63312c1229224fc7f81e407e80a722c838d8e4723b61b3f50d48d746dae7cb6`.
- Plan domingo: 26 correos, 26 reservas. Hash `9d3525e0ed89939987ffc33bf5612faa68649b2d99560bd791a130d0edd41b51`.
- Planes privados y recibos: `test-results/event-reminders-daily/` (ignorado por Git/Vercel, modo privado).
- SÁBADO COMPLETADO: 30 aceptados y 30 en cola VERIFICADA en Brevo, programados 21/11/2026 09:00 Santiago. Log `/private/tmp/casku-daily-saturday-schedule.log`. No volver a programarlos.
- DOMINGO COMPLETADO: 26 aceptados y 26 en cola VERIFICADA en Brevo, programados 22/11/2026 09:00 Santiago. Log `/private/tmp/casku-daily-sunday-schedule.log`. No volver a programarlos.
- Si el proceso termina, revisar log final. Si se interrumpe, revisar recibos antes de reintentar: ATTEMPTING sin aceptación nativa requiere revisión, NO repetir POST a ciegas. El CLI bloquea ese caso.
- Programación (tras verificar estado, no ejecutar paralelamente mismo lote):
  `node --experimental-strip-types scripts/programar-recordatorios-jornadas.mjs --schedule --approve HASH --database-env .env.vercel-ensayo`
- El CLI revalida el día completo antes de enviar; si cambió una reserva, detener y preparar/revisar plan nuevo, sin cambiar el payload de una clave ya aceptada.
- La programación usa la clave local y una excepción de destinatarios LIMITADA al lote aprobado. No convierte .env.local a modo producción ni abre otros envíos locales.

## Brevo y Vercel

- Remitente real contacto@casku.cl verificado activo.
- La clave inicialmente devolvía403 permission_denied en cuenta/remitentes/webhooks, mientras SMTP daba200. La usuaria editó permisos en Brevo: transaccional Todo, webhooks Lectura/escritura, cuenta Lectura. Comprobado después: senders200 activo, account200, webhooks400 document_not_found (sin webhooks).
- Archivo privado `.env.brevo-activacion`, modo600, contiene SOLO variables de correo y nunca DATABASE_URL/AUTH_URL. No imprimirlo ni incorporarlo al commit. .env.local no se cambió de modo pruebas.
- Variables que se indicó guardar para Production: CASKU_MAIL_ENABLED=1; BREVO_SENDER_EMAIL=contacto@casku.cl; BREVO_SENDER_VERIFIED=1; CASKU_MAIL_MODE=produccion; CASKU_CLINICAL_MAIL_ENABLED=1; CASKU_MAIL_DELIVERY_SECRET; CASKU_MAIL_SUPPRESSION_SECRET; BREVO_WEBHOOK_SECRET; BREVO_WEBHOOK_ENABLED=1; BREVO_API_KEY. Las cuatro claves se copian del archivo privado, jamás al chat.
- BREVO_SENDER_NAME es opcional: valor por defecto Casku.
- CASKU_MAIL_AUTOMATION debe seguir0; no activar seguimientos pendientes.
- NO hay acceso por CLI/conector de Vercel. El usuario debe subir manualmente el código y comprobar Ready. Solo después verificar el webhook con --verify y crear con --create. No fingir despliegue ni webhook activo antes.
- Configuración del webhook propuesta: POST https://casku-craneometrias.vercel.app/api/webhooks/brevo, Bearer secreto privado, eventos delivered/hardBounce/softBounce/spam, sin claves en URL. Prueba inocua {event:casku.health} con autorización válida debe200, inválida401; no crea correo ni evento clínico.

## Pruebas y continuación

- Pruebas focales de clínica, UI y permisos pasan; primera npm test con nuevos *.mjs:125 correctas (se añadieron más después, repetir al finalizar).
- Primer `npm run check`: log `/private/tmp/casku-expo-day2-check.log`, sesión6932; FALLÓ linking-checks:68 por una nueva guarda que bloqueaba legacy4. Corregido DESPUÉS en protocolo/helper. No afirmar todavía check completo aprobado.
- Correcciones de fixtures nuevas capturas: `privacy-checks.mjs`, browser-queue inputs v2. Mantener históricos4 y snapshots reales sin convertir.
- Reejecutar `npm run check` tras integración final. Probar PostgreSQL real temporal y navegadores para administración, resultados y clínica; nunca ejecutar tests contra base operativa.
- Runner temporal existente `/private/tmp/casku-hooks-postgres.mjs` arranca PostgreSQL local independiente. Adaptar copias con flags; no utilizar por omisión DATABASE_URL real. Puerto3180, cleanup de su propio clúster.
- Evitar compilar dos procesos a la vez en .next-production-tests. Los agentes no hacen builds ni sirven la app; el agente principal coordina.
- Agentes auxiliares actuales (se pueden retomar): Harvey presencial `01a1fbba-6ae2-7d12-877c-41e942840f10`; Darwin resultados UI `01a1fbba-903f-7bd0-9855-cbecc072a54c`; Heisenberg protocolo/resultados store `01a1fbbb-2148-7410-9909-e654c5bbef0f`; Chandrasekhar recordatorios `01a1fbbc-07bb-7300-b57e-7f3eef503e70`. Todos terminaron la fase asignada antes de este checkpoint.

Siguiente prioridad: terminar programación sábado/domingo y registrar evidencia; implementar envío de resultados SIN cuenta con confirmación y autorización; pruebas completas; usuario commit/push; verificar Brevo real tras despliegue. No tocar datos clínicos previos ni activar seguimientos.

## Actualización posterior al primer checkpoint

- Envío sin cuenta fue asignado a Darwin para IMPLEMENTAR, no solo documentar: nueva tabla aditiva ResultadoContacto/flujo separado, snapshot de revisión, correo de contacto guardado (nunca destino arbitrario), repetir correo y dos confirmaciones del apoderado, consentimiento específico versionado, autoría clínica, datos autorizados, envío Brevo idempotente. Sin crear cuenta ni afectar publicaciones familiares. Pendiente implementación y pruebas. No desplegar hasta integrarlo.
- Agente clínico fue informado para revisar seguridad después; no hay nuevas tareas de cálculo.

- Estado confirmado de ambos lotes: SÁBADO30 y DOMINGO26 en COLA_VERIFICADA; no volver a ejecutar envíos salvo conciliación explícita sin nuevo POST.
- Última npm test (antes de nuevo flujo contacto): 170 pruebas correctas, log /private/tmp/casku-day2-unit-final-stage.log. El check completo sigue pendiente de repetición por el fix legacy4 y nuevo flujo contacto.

## Retomado el 21 de noviembre de 2026, madrugada de Santiago

- Se verificó el checkpoint y se retomaron los archivos sin repetir recordatorios ni crear otro Día 2.
- UI y API de envío sin cuenta ya existen: `ResultContactMail`, `contact-store/policy/http/message`, ruta `/api/kinesiologia/resultados/[id]/contacto`. Las casillas y repetición del correo se exigen con contexto de revisión/contacto/autorización vigente; solo destino guardado y autor clínico.
- Nueva migración aditiva `20261121000100_resultados_contacto`: tabla ResultadoContacto y triggers de copia/consentimiento inmutables. TODAVÍA NO APLICADA a la base operativa. Prisma Client local generado.
- Correcciones de integración: soltar transacción de evaluación antes de llamar al ledger independiente (funciona con un solo slot); clave única evaluación/revisión/contexto permite correo corregido con nueva autorización y motivo; `contact-publication.ts` evita duplicado al publicar posteriormente para una cuenta familiar, incluyendo aceptación recuperada del ledger.
- Contenido de correo directo usa encuadre explícito CONTACTO en `resultMessage`; no reemplaza cadenas dentro de datos del bebé, ni promete cuenta ni enlace.
- `previousContactMail` incorporado al publicar: si ya fue aceptada copia idéntica (misma revisión, correo y snapshot), registra evidencia y no envía otro correo; aceptación incierta impide duplicado automático.
- Segunda ejecución de check completo (`/private/tmp/casku-expo-resume-check.log`, sesión25400) encontró un error en el reset de la clave del límite de pruebas: faltaba prefijo `limit:`. CORREGIDO en el test, sin cambiar el límite real12/10min. No declarar check completo aprobado todavía.
- Se ejecuta de nuevo `npm run test:families`: `/private/tmp/casku-contact-families-http.log`, sesión94962. Después ejecutar check completo y PostgreSQL real temporal con navegadores; no compilar simultáneamente.
- Pruebas focales: 19 de store/migración/protocolo y10 de UI correctas; npm test previo182 correctas (antes de últimas pruebas adicionales).
- Harvey mantiene `tests/result-contact-checks.mjs` y su integración; Darwin terminó UI; principal tiene ownership de contact-store/schema/migración y deduplicación familiar. Heisenberg revisión de seguridad terminada con3 hallazgos corregidos por principal.
- Vercel sigue pendiente de commit/push MANUAL del usuario y Ready. Webhook Brevo externo NO creado ni verificado aún tras despliegue. Variables ya guardadas por usuario; no volver a pedirlas salvo fallo real. Los recordatorios NO dependen de ese despliegue.

### Últimos ajustes de verificación (21/11)

- Se corrigió el índice de `RevisionEvaluacion`, que por una sustitución local había recibido contexto por error. Solo ResultadoContacto usa único evaluación/revisión/contexto. Prisma generate terminó correctamente DESPUÉS del arreglo. Ningún esquema incorrecto fue aplicado a la base operativa.
- HTTP focal `node tests/families-http.mjs --result-contact-only` aprobado, incluyendo copia sin cuenta, solicitud doble sin duplicados y posterior cuenta familiar sin correo adicional. El flag no reemplaza la batería completa.
- Migración y store focos19 correctos, UI10 correctas, última npm test193 correctas antes de agregar el formato de fecha estable.
- Primer check final (`/private/tmp/casku-final-expo-check.log`, sesión74164) compiló pero falló Safari WebKit con React418. Causa COMPROBADA: Intl devuelve hora/literales distintos entre Node y Safari ("21 de noviembre de 2026, 6:00 a. m." frente a "21 de noviembre de 2026 a las 6:00 a.m."). Se resolvió con `results/date-format.ts` construyendo texto estable desde partes, hora24 y zona Santiago. No se ocultaron errores ni se desactivaron aserciones.
- Nueva ejecución completa en curso: `/private/tmp/casku-final-verified-check.log`, sesión70703. No afirmar éxito final hasta exit0.
- `ResultList` distingue copia de contacto aceptada, copia anterior y envío por confirmar; conserva estado de publicación familiar separado.
- Runner PostgreSQL nativo aislado listo `/private/tmp/casku-expo-native-final.mjs` (usa --skip-build, puerto3180). EJECUTAR SOLO después de que el build actualizado esté listo. No compilar simultáneamente.
- Base operativa: todavía SIN aplicar migración ResultadoContacto. Recordatorios56 siguen programados y no se repiten. Deploy/Ready y alta/verificación de webhook Brevo siguen pendientes de acción manual del usuario tras entregar código probado.

### Verificación final retomada (21/11, mañana)

- Los runs `/private/tmp/casku-final-verified-check.log` y `/private/tmp/casku-expo-native-final.log` fallaron al crear el quinto caso de navegador: la sesión API original había sido revocada al superar el límite real de sesiones. Los cuatro perfiles anteriores, incluido Safari/iPad, pasaron. Se corrigió SOLO la preparación: crear los cinco casos antes de abrir sesiones de navegador. No se debilitó la seguridad ni se eliminó ningún perfil.
- Nuevo `npm run check` en curso: `/private/tmp/casku-expo-complete-check.log`, sesión28721.
- Nuevo PostgreSQL nativo temporal con dispositivos: `/private/tmp/casku-expo-native-complete.log`, sesión73351. No toca la base operativa.
- Migración operativa sigue pendiente de aplicar con el guard `/private/tmp/casku-contact-migrate.mjs --apply`, únicamente tras ambas comprobaciones completas exitosas. El guard verifica el destino previamente marcado y compara siete tablas antes/después.

- PostgreSQL nativo de sesión73351 pasó todos los casos nuevos de contacto y concurrencia entre instancias, pero falló después en WebKit fila: la interceptación de Playwright para perder una respuesta afectaba un fetch RSC `/evaluacion`. Se reemplazaron las dos interceptaciones por un wrapper fetch que ejecuta el POST real, consume su respuesta y lanza el fallo una sola vez. Mantiene la prueba de respuesta perdida/idempotencia sin interceptar otras navegaciones. Repetir native completo después del build en curso.

- `npm run check` sesión28721 TERMINÓ exit0: `/private/tmp/casku-expo-complete-check.log`. Incluye build producción/TypeScript y recorridos completos, cinco perfiles de contacto y recuperación, y Calendly. Unit194/194. Se retiró después solo import sin uso en test; lint limpio (`/private/tmp/casku-final-lint.log`) y unit194/194 de nuevo (`/private/tmp/casku-final-194-unit.log`).
- Native sesión26435 falló antes de la ausencia en WebKit tras recargar: no apareció respuesta/estado y la atención continuaba activa. Se agregó esperar networkidle tras reload y afirmar explícitamente HTTP200 del POST de ausencia. Nuevo native completo `/private/tmp/casku-expo-native-confirmed.log`, sesión62431. Mantiene todos los perfiles, sin reintentar acciones a ciegas ni relajar aserciones.

- Safari quedó estable al restaurar window.fetch inmediatamente después del único fallo simulado (y no envolver peticiones posteriores). Native `/private/tmp/casku-expo-native-clean-fetch.log` PASÓ los cinco perfiles completos de fila y los cinco de contacto. Luego falló la preparación de administración por HTTP429 de acceso familiar: más de20 familias distintas simuladas compartían la misma IP local.
- `family()` ahora asigna direcciones documentales198.51.100.x a clientes ficticios independientes, solo al solicitar su código. `challenge()` sin dirección alternativa permanece igual para los casos explícitos de límites. No cambia ningún límite ni código de producción.
- Native completo final en curso: `/private/tmp/casku-expo-native-isolated-families.log`, sesión51287. Esperar exit0 antes de migrar/entregar.

## ESTADO FINAL VERIFICADO — 21/11/2026, mañana (prevalece sobre pendientes anteriores)

- IMPLEMENTACIÓN TERMINADA y cambios sin commit. El usuario hace commit/push manualmente; nunca hacerlo por él.
- Clínica v2: CVA diferencia absoluta, CVAI diferencia/diagonal mayor×100, CI un decimal, DPOE diferencia absoluta de distancias completas POE–tragus. Se preservan evaluaciones históricas y no se inventan datos para convertirlas. Clasificación separada; bordes ambiguos y clasificación conjunta siguen pendientes de validación clínica.
- Borradores editables y copia clínica sin cuenta: autoría, destinatario guardado/repetido, dos confirmaciones explícitas, consentimiento versionado, motivo de nuevas copias, snapshots inmutables, idempotencia y protección frente a aceptación incierta. Vincular/publicar después no duplica una copia idéntica ya aceptada.
- Administración permite inscripción presencial; conserva restricciones clínicas y de otros permisos.
- Día2 YA creado:21/11/2026,150cupos, Metropolitan Santiago, sincronizado con Calendly. NO duplicarlo.
- Recordatorios YA programados y verificados en Brevo: sábado21 a09:00 Santiago30correos/31reservas; domingo22 a09:00 Santiago26correos/26reservas. NO repetir ni reprogramar. Recibos privados en test-results/event-reminders-daily.
- `npm run check` EXIT0: /private/tmp/casku-expo-complete-check.log (lint,194unitarias,seguridad,correo ficticio,HTTP,familias,build producción,TypeScript,Calendly y perfiles de contacto/recuperación).
- Última limpieza de importación: unit194/194 EXIT0 en /private/tmp/casku-final-194-unit.log. Lint final limpio EXIT0 en /private/tmp/casku-final-clean-lint.log. git diff --check limpio.
- PostgreSQL NATIVO temporal completo EXIT0: /private/tmp/casku-expo-native-isolated-families.log, sesión51287. Dos instancias, concurrencia real, llegada/QR/ausencias/reincorporación/guardado/resultados/contacto/administración/recuperación; cinco perfiles Chrome,Android,WebKit escritorio,iPad y320oscuro. Base/clúster temporal eliminados. Sin datos ni envíos reales. Emulación no sustituye hardware físico.
- Fallos previos fueron corregidos en fixtures sin bajar controles: precrear casos antes de revocación por máximo de sesiones; restaurar fetch inmediatamente tras un fallo simulado; esperar carga tras recarga y afirmar POST200 de ausencia; direcciones documentales distintas para familias ficticias, conservando los casos explícitos de límites.
- MIGRACIÓN OPERATIVA APLICADA EXIT0:20261121000100_resultados_contacto mediante guard de destino/SQL revisado. Resultado: siete tablas previas comparadas e INTACTAS, tabla nueva vacía,0correos. No repetir. Prisma Client ya generado; ninguna migración clínica destructiva.

### Próximo paso manual del usuario

1. Usuario commit/push; Vercel despliega la rama. Esperar Ready con el código nuevo. Variables Brevo YA copiadas por usuario; no volver a pedirlas. Mantener CASKU_MAIL_AUTOMATION=0.
2. Tras Ready: verificar receptor autenticado con `node scripts/configurar-brevo.mjs --verify`; después crear/configurar webhook real con `--create`. Todavía NO creado ni verificado contra el despliegue actualizado. Estas acciones no mandan correos. No afirmar Brevo totalmente activado antes de eso.
3. Prueba controlada de edición/envío con autorización del apoderado; los correos clínicos son acción manual explícita. No activar seguimiento semanal/mensual automáticamente ni repetir recordatorios.
4. Subdominio Wix sigue pendiente de permisos. El dominio actual de Vercel continúa.

Todo lo necesario para retomar está en este documento. No guardar secretos en Git ni copiar .env locales al commit.

## Actualización22/11 — resumen administrativo, selector y conteos (terminado, pendiente push manual)

- Día3 existente fue sincronizado con Calendly usando el servicio real y comprobación de integridad:28reservas activas,100cupos,72libres, automático=true. No se crearon fichas ni enviaron correos ni se alteraron evaluaciones/reservas de otros días.
- Hallazgo de SOLO LECTURA en base publicada: Día1 tiene22reservas activas y24evaluaciones/24bebés SIN inscripción; Día2 tiene34reservas y42evaluaciones/42bebés SIN inscripción; Día3 tiene28reservas y0evaluaciones sin inscripción. Los tres eventos tienen0inscripciones formalizadas y0presenciales. No inferir que las66evaluaciones sean66presenciales: pueden incluir personas de Calendly. No asignarlas automáticamente por fecha/nombre/correo.
- Código nuevo: `listEventsFor` cuenta inscripciones vigentes reales, presenciales y reservas activas aún sin vínculo, sin duplicar las ya vinculadas; no modifica contadores ni datos. El resumen añade participación y agregado separado de evaluaciones/bebés sin inscripción por fecha Santiago, sin atribuirlos a un evento. Mantiene los estados operativos originales de fila.
- UI: selector «Jornada de Casku» habilitado en administración y cambia el evento de trabajo/resumen; lista se actualiza cada15segundos y al volver a la ventana. Evita que una consulta antigua sobrescriba una selección/operación nueva. Lista muestra inscritos+reservas/cupos y desglose de formalizados, reservas y presenciales. Resumen muestra presenciales vigentes/canceladas y evaluaciones sin inscripción del día por separado.
- Pruebas nuevas: reservas vinculadas/canceladas sin duplicados, contador auxiliar desactualizado, privacidad, lectura sin envíos, límite local de fechas en Santiago; navegador cambia jornada y ve una inscripción de otra pantalla aparecer automáticamente.
- Verificación EXIT0: lint `/private/tmp/casku-admin-summary-lint-final.log`;194unitarias `/private/tmp/casku-admin-summary-unit-final.log`; HTTP focal `/private/tmp/casku-admin-summary-http.log`; build producción+TypeScript+HTTP y administración en Chrome/Android/WebKit/iPad/320oscuro `/private/tmp/casku-admin-summary-production.log`; recorrido COMPLETO familias/recepción/fila/clínica/resultados/privacidad/cuentas `/private/tmp/casku-admin-summary-families-utc-final.log`. git diff --check limpio.
- Dos ajustes SOLO DE PRUEBAS: reloj de recordatorios ficticios fijado antes de las fechas del lote (validación Brevo real sigue bloqueando fechas vencidas); runner familias usaUTC para sincronizar PGlite con Date.now. Diagnóstico previo: estado transitorio REVISION en doble envío con reloj SQL desfasado; focal UTC y posterior recorrido completo pasaron, sin modificar la lógica de correo productiva. El primer intento paralelo compartió puerto3120 y se corrigió ejecutando familias en3140.
- No hay migración nueva. Se conservaron todos los datos reales y no se enviaron correos. NO se hizo commit/push. Usuario debe subir cambios y esperar Ready.
- Webhook Brevo sigue PENDIENTE: usuario había pedido verificar/configurar tras el despliegue anterior, pero priorizó sincronizar Día3 y estos ajustes. No asumirlo creado ni activar seguimientos; no repetir lotes programados.
