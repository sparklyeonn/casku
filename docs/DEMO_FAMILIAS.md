# Acceso local de apoderado para pruebas

Ejecutar `npm run dev:familias` con la versión de Node del proyecto. Abre un servidor independiente en `http://127.0.0.1:3125/login?portal=familias` y un buzón simulado en `http://127.0.0.1:3126`.

Usar `apoderado@example.com`, solicitar el código en el acceso familiar y actualizar el buzón para copiarlo. El código mantiene los controles reales: seis dígitos, diez minutos, un uso y asociación al navegador que lo solicitó. No se utiliza contraseña ni se omite la verificación.

El correo es ficticio: no se crea una casilla externa. El buzón local solo acepta envíos para esa dirección y no llama a Brevo. Las credenciales ficticias y todas las direcciones de conexión se pasan únicamente al proceso hijo. No modifica `.env`, la base configurada, las cuentas del equipo ni los controles de producción.

La base PGlite es temporal y se descarta al detener con Ctrl+C. Contiene un apoderado de prueba y un evento abierto; permite probar el registro del bebé desde la propia web. Usar solo datos ficticios. El acceso por `127.0.0.1` mantiene sus cookies separadas de una aplicación abierta en `localhost`.

Cerrar esta demo antes de ejecutar otras pruebas: utiliza la carpeta compilada secundaria de los ensayos de desarrollo. `npm run dev:familias -- --check` verifica automáticamente código, sesión y permisos y detiene los servidores al terminar. Para reiniciar, ejecutar de nuevo el comando normal; los datos anteriores no se conservan.
