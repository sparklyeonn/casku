# Vinculación de inscripciones presenciales

## Flujo para recepción y familias

1. Recepción busca la inscripción por número o QR, o termina de crear el registro presencial. En **Vincular con la cuenta familiar** confirma con el apoderado el bebé y el correo de su cuenta.
2. Genera el código y QR de vinculación y los entrega directamente a esa persona. No se envían por correo: la entrega presencial y la verificación del correo son comprobaciones distintas.
3. La familia entra con ese correo verificado a `/familias`, abre **Vincular inscripción presencial** y escribe el código o escanea su QR. Revisa nombre, nacimiento, evento y número antes de confirmar.
4. Al aceptar, la inscripción y la ficha existente quedan vinculadas. Se conserva el mismo bebé, evaluaciones, número, comprobante QR, cupo y estado/orden de fila. La ficha se puede elegir para una inscripción futura sin volver a registrar al bebé.
5. La kinesióloga recarga el borrador guardado, revisa y publica el resultado. Entonces aparece en la cuenta familiar y se intenta enviar al correo verificado, según [RESULTADOS.md](RESULTADOS.md). Vincular no publica ni envía resultados por sí solo.

El registro en recepción sigue funcionando sin correo. El remitente verificado de Resend continúa pendiente de Casku; sin él no se envían los códigos de acceso ni los resultados reales. La vinculación no omite la verificación de acceso.

## Códigos y recuperación

El código vence a las 24 horas y admite una sola aceptación. Un reintento de la familia que ya lo aceptó devuelve esa misma vinculación. Recepción puede revocar un código pendiente; generar uno nuevo invalida el anterior, incluso si cambió el correo confirmado. No puede revocar una vinculación aceptada ni cambiar el propietario desde esta pantalla.

**Mostrar código vigente** recupera el mismo código para la recepcionista que lo emitió. Otra recepcionista puede sustituirlo generando una invitación nueva, después de confirmar los datos. Un reintento del mismo envío conserva código y caducidad. No se guardan códigos en URLs, almacenamiento del navegador ni texto sin proteger en la base. Rotar `AUTH_SECRET` exige renovar las invitaciones pendientes.

El QR de vinculación usa `CASKU:VINCULACION:` y es distinto del comprobante `CASKU:INSCRIPCION:`. Conocer el número, QR de inscripción, correo de contacto o RUT no concede propiedad. El código se trata como una credencial y se entrega solo a la familia verificada presencialmente.

## Permisos y datos

Solo recepción emite, consulta el estado o revoca invitaciones. Solo una cuenta familiar activa y con el correo exacto de la invitación puede previsualizarla y aceptarla. El servidor toma la identidad de la sesión; ignora propietarios enviados por el navegador. Las APIs son privadas y sin caché.

La aceptación actualiza en una transacción el propietario del paciente y de la inscripción, y registra quién aceptó y cuándo. No sobrescribe nombre, nacimiento, RUT, contactos, perfil familiar ni contenido clínico. Mantiene la orden de confirmación y prepara una nueva versión para la cuenta verificada, con otra clave de envío y sin enviar automáticamente; si no había orden crea una recuperable. La familia puede reintentar esa copia desde su portal. Un envío de comprobante en curso debe terminar antes de aceptar la vinculación. La publicación clínica usa exclusivamente la cuenta verificada vinculada.

Existe una sola invitación pendiente por inscripción. Las operaciones bloquean evento, paciente e invitación; se comprueba nuevamente vigencia y propiedad antes de aceptar. Hay un límite persistido de diez consultas/aceptaciones por cuenta cada quince minutos, incluidos códigos inexistentes. Los códigos ajenos o vencidos producen una respuesta genérica sin datos del bebé.

Si ya hay una ficha con el mismo nombre normalizado y nacimiento en la cuenta, se solicita revisión de Casku. No se duplican ni fusionan fichas para resolver ese conflicto. Tampoco se reasignan registros de otra familia. Este flujo cubre inscripciones creadas por recepción; las fichas históricas sin inscripción presencial y los cambios supervisados de apoderado requieren un proceso posterior.

## Migración y comprobaciones

`20261109000800_vinculacion_presencial` añade únicamente la tabla de invitaciones, índices y relaciones. No asigna registros existentes por correo o RUT ni cambia evaluaciones. Aplicar con `npm run db:deploy`, ejecutar `npx prisma generate` y reiniciar `npm run dev`; no usar `db push` ni `migrate reset`.

`npm test` valida entradas y separación de los QR. `npm run test:families` verifica permisos, contacto sin propiedad automática, aceptación con correo correcto, reintentos y concurrencia, conservación de ficha/fila/número/QR, publicación de una evaluación previa, correo al propietario verificado, revocación, reemplazo, vencimiento, fichas coincidentes, límites y rollback ante un fallo de escritura. Usa PostgreSQL temporal y correo local ficticio; no modifica la base configurada ni envía mensajes reales.

Ejecutar las suites HTTP por separado y TypeScript al terminar. Se mantienen las comprobaciones de eventos, acceso, ESLint y Prisma. Antes de operar, comprobar la cámara en los dispositivos del evento y ensayar concurrencia con PostgreSQL real. La compilación de producción conserva la verificación pendiente del proceso auxiliar de estilos de Turbopack documentada en las entregas anteriores.
