# Consentimiento, trazabilidad y privacidad

## Autorizaciones por bebé y evento

La inscripción y la lista de espera requieren una aceptación expresa del texto vigente para registrar los datos y realizar la evaluación. Ninguna casilla viene aceptada. Cada autorización pertenece al bebé, evento y apoderado; no se hereda por coincidencias de correo, RUT o nombre. Cambiar de evento o bebé limpia la elección en el formulario.

Hay tres opciones separadas:

- Datos y evaluación: necesaria para nuevas inscripciones y operaciones clínicas.
- Resultados por correo: opcional; los resultados publicados siguen disponibles en la cuenta aunque se rechace.
- Seguimiento clínico por correo: opcional, requiere las dos opciones anteriores. Guarda la decisión para los futuros correos a la semana y al mes; esta entrega no programa esos envíos.

Los códigos de acceso y comprobantes de inscripción son mensajes operativos separados. Las reglas clínicas de selección de destinatarios se implementarán con el alcance clínico confirmado; aceptar correos no implica enviar una campaña a todos.

## Gestión por perfil

En `/familias/privacidad` la cuenta verificada consulta sus autorizaciones por bebé y evento, cambia opciones, retira permisos y revisa el historial paginado. Cada escritura incluye la revisión que se vio en pantalla: un formulario antiguo no puede restaurar silenciosamente permisos retirados desde otra pantalla.

Recepción y administración pueden consultar el estado de la autorización de una inscripción y registrar una declaración documentada del apoderado, indicando su nombre y la referencia del documento. El documento se conserva por el procedimiento de Casku; no se sube una imagen en esta entrega. El equipo solo registra la autorización de datos: no puede conceder nuevos permisos de correo por la familia. Después de una retirada no se admite reutilizar una referencia documental anterior para reactivar el permiso.

La inscripción presencial y las evaluaciones independientes requieren esta evidencia. Al vincular una inscripción presencial, la familia confirma sus propias opciones desde su cuenta verificada. Administración sigue sin tener acceso clínico.

## Retirada y registros anteriores

Sin autorización vigente de datos se bloquean nuevas llegadas, llamados elegibles, guardados, correcciones de borradores y publicaciones. Una atención activa no desaparece: puede devolverse o marcarse ausente. La retirada conserva inscripción, número, cupo, ficha, evaluación y resultado histórico; no equivale a cancelación ni a eliminación de datos.

La migración añade relaciones opcionales: los registros anteriores quedan pendientes de autorización y no se generan aceptaciones retroactivas. Se puede regularizar desde la cuenta familiar o mediante documentación revisada por recepción. Si cambia la versión del texto, la anterior no habilita nuevas operaciones que requieren aceptación vigente.

## Correos clínicos

Antes de reservar un envío y antes de enviarlo se comprueban la propiedad actual, la autorización de datos, la versión y el permiso de resultados; el propósito de seguimiento exige además su permiso específico. Una retirada cancela órdenes pendientes o fallidas con motivo de privacidad. Volver a aceptar permite recuperar órdenes existentes sin enviar una segunda copia de un mensaje ya enviado.

Un mensaje ya enviado o en curso no se puede retirar del buzón. No se realizan envíos reales durante las pruebas. El remitente verificado, los reintentos programados, los avisos del proveedor y el calendario de seguimiento siguen en el pendiente 4.

## Registro de cambios y accesos

Cada cambio guarda versión y copia de los textos aceptados, opciones anteriores y nuevas, revisión, fecha, actor, perfil y canal. Cuando procede, guarda declarante y referencia documental. La autorización y su historial se escriben en la misma transacción; un fallo del historial revierte también el cambio y sus efectos sobre correos pendientes.

Se registran consultas relevantes de resultados, listas clínicas, formularios asignados y fichas, además de guardados, publicaciones y autorizaciones. La auditoría de accesos guarda identificadores, actor, perfil, acción y fecha, sin copiar mediciones, diagnósticos, contactos o QR. No pretende ser un registro de todas las peticiones HTTP. Si no puede registrarse una consulta clínica auditada, no se entrega su contenido.

`/administracion/privacidad` muestra metadatos paginados de acceso. La cuenta familiar solo consulta sus autorizaciones e historial, sin los datos internos de otros actores. Dos tablas de historial incorporan protección de base de datos contra modificaciones y borrados ordinarios. Una cuenta con privilegios de propietario de la base puede alterar estos controles: las credenciales y copias de respaldo requieren gestión separada.

## Verificación y límites

`npm run test:families` usa una base y un proveedor ficticios. Comprueba falta de aceptación, versiones, permisos, aislamiento, cambios simultáneos, retirada durante una atención, publicación sin correo, recuperación sin duplicados, errores de auditoría, documentación presencial, historial paginado y conservación de registros anteriores.

Esta implementación es un control técnico, no una certificación jurídica. Antes del uso oficial Casku debe aprobar los textos, el procedimiento de representación del bebé, el canal de solicitudes y sus plazos de conservación y eliminación. No hay borrado automático de historias clínicas ni se inventa un plazo. El aviso público está en `/privacidad`.
