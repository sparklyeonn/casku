# Base visual y portal familiar

La referencia acordada es la web de Casku: turquesa #00899A, acción oscura #004E58, celeste #BBDDE0 y marfil #FFFEF8; Montserrat para la interfaz y Playfair Display para los mensajes de bienvenida. Las fuentes se sirven desde el proyecto, con sus licencias OFL, sin solicitudes del navegador a Google.

## Alcance

- Variables compartidas de color y tipografía en `globals.css`, con superficies y contraste adaptados al modo oscuro del dispositivo.
- Identificador tipográfico provisional `CaskuBrand`: pendiente reemplazar por el archivo de logo oficial. No es una reproducción del logotipo.
- Acceso para familias y equipo; catálogo público de eventos.
- Encabezado, navegación activa y pie comunes a inscripciones, resultados y autorizaciones familiares.
- Comprobantes con número, QR privado y estado de inscripción; formulario adaptable, vinculación presencial y lista de espera.
- Conservación de los flujos de autorizaciones, cancelación, publicación/retiro y consulta de resultados. No se modifica el protocolo clínico.
- Base de tipografía/color compartida con el equipo. La adaptación de recepción, kinesiología y administración se documenta en [VISTAS_EQUIPO_CASKU.md](VISTAS_EQUIPO_CASKU.md).

## Adaptación y accesibilidad

Las columnas se apilan en pantallas estrechas. La navegación y las acciones se distribuyen en varias líneas; el correo admite saltos. Campos de al menos 16 px, botones de al menos 44 px, foco visible, enlace para saltar al contenido, página activa anunciada y movimiento reducido. El QR conserva fondo blanco y código negro incluso en modo oscuro.

La inscripción sigue sin equivaler a una hora de atención: recepción confirma la llegada. Las casillas opcionales de resultados y seguimiento no aparecen preseleccionadas.

## Comprobación reproducible

`npm run test:families:devices` compila y comprueba el portal sobre el servidor de producción con base temporal y proveedor de correo simulado. Recorre acceso con código, selección del evento solicitado, inscripción con consentimiento mínimo, QR privado, resultados vacíos y publicados tras una evaluación de prueba, autorizaciones, error recuperable y cierre de sesión. Incluye Chromium de escritorio, perfil Pixel 7, WebKit de escritorio, perfil iPad y Chromium de 320 px en modo oscuro y movimiento reducido. También comprueba un área útil equivalente a ampliar al 200 %, recursos locales, errores de página y desbordamiento horizontal.

Capturas locales: `test-results/families/` (ignoradas por Git). Los perfiles de navegador no sustituyen la aceptación en dispositivos físicos, especialmente cámara y teclado.

No requiere migraciones ni cambios de variables de entorno. No activa envíos reales ni publica el sitio.
