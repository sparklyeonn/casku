# Adaptación visual del equipo

Recepción, kinesiología y administración comparten los colores, tipografías y controles de la base visual de Casku. El diseño utiliza las variables existentes de `globals.css` y estilos específicos en `team.css`; no añade dependencias.

## Navegación y acceso

`TeamShell` mantiene el marco del servidor y entrega al componente visual solamente nombre y perfil. No serializa el objeto de sesión. Los permisos y la autenticación continúan verificándose en las páginas y en sus API.

En computador se muestra una barra lateral con enlaces según el perfil y la página activa. En pantallas menores de 1100 px, el botón «Menú del equipo» permite desplegar y cerrar la navegación. El contenido sigue disponible con teclado, foco visible y enlace para saltar al área de trabajo. Los identificadores de controles se generan con `useId`, para evitar conflictos entre pantallas que Next.js conserva ocultas al navegar.

## Pantallas

- **Recepción:** evento de trabajo, búsqueda por número/QR, verificación de llegada, inscripción presencial y fila. La lista de espera de cupos y la cancelación se consultan en secciones desplegables. Las autorizaciones y la reincorporación siguen disponibles en el registro.
- **Kinesiología:** evento y prioridad del próximo llamado, atención activa destacada, formulario de craneometría, revisión y publicación/retiro de resultados. Se conservaron cálculos, cuatro medidas actualmente implementadas y bloqueos de atención. Los campos del formulario tienen etiquetas asociadas y se apilan en celulares estrechos.
- **Administración:** evento seleccionado, resumen con métricas adaptables, lista/creación/edición de eventos, cuentas, correos, datos familiares, trazabilidad y seguridad. Los resúmenes de correos y lista de espera quedan desplegables, después del resumen principal.

Las superficies, campos y bordes se adaptan al modo oscuro. Los mensajes conservan su contenido y los estados de error, advertencia, éxito y desactivación. La presentación no modifica cupos, alternancia, ausencias, consentimiento ni las acciones permitidas.

## Validación

`npm run test:team:devices` compila y recorre las pantallas sobre el servidor de producción, con base temporal y proveedor de correo local simulado. Incluye Chromium de escritorio, perfil Android Pixel 7, WebKit de escritorio, perfil iPad y Chromium de 320 px en modo oscuro y movimiento reducido.

Recepción y kinesiología prueban búsqueda por número/QR, cámara denegada, respuesta perdida sin duplicar, confirmación, ausencia/reincorporación, formulario precargado, guardado y revisión del borrador. Administración prueba creación/apertura del evento, resumen, creación de cuenta temporal, navegación entre sus secciones, teclado y permisos clínicos denegados. Se comprueban desbordamientos y errores JavaScript; las capturas quedan en `test-results/devices/` y `test-results/team-admin/`, ignoradas por Git.

`npm run check` mantiene la batería técnica integral. `npm run test:mail-admin:devices` comprueba además acciones auditadas en la gestión de correos.

Los perfiles emulados no reemplazan la aceptación en equipos físicos, especialmente cámara, teclado, suspensión y conectividad del evento. No se requieren migraciones ni cambios de variables de entorno; no se activan correos reales ni se despliega el sitio. El logo oficial continúa pendiente.
