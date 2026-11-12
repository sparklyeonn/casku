# Compilación de producción y pruebas técnicas

## Ejecutar la validación

El proyecto se validó con Node 22.14.0; `.nvmrc` selecciona esa versión. `engines` declara los mínimos admitidos por Prisma instalado. Si se usa nvm, ejecutar `nvm use` antes de instalar o comprobar el proyecto.

- `npm run build`: genera el cliente de Prisma mediante `prebuild` y compila la aplicación oficial en `.next`. No aplica migraciones.
- `npm run test:production`: genera Prisma, compila en `.next-production-tests` y ejecuta las pruebas HTTP y los recorridos familiares contra `next start` con `NODE_ENV=production`.
- `npm run check`: revisión de código, pruebas unitarias, eventos, seguridad compartida, permisos HTTP, recorridos familiares en desarrollo, compilación y recorridos en producción, y comprobación final de tipos. Las pruebas con servidores se ejecutan en serie.

Las pruebas requieren poder abrir puertos locales (3117, 3120, 3130 y 3131), además de puertos temporales para base y correo. Cada proceso termina sus servidores al finalizar. No ejecutarlas simultáneamente con otra copia de las mismas pruebas. Las carpetas de prueba están separadas de `.next` y excluidas de Git y ESLint. Next añade sus tipos al archivo de TypeScript.

## Aislamiento

La prueba de producción compila con una dirección de base local sin servicio y valores ficticios de autenticación y correo. Después arranca servidores con una base temporal, aplica allí las migraciones e introduce únicamente datos ficticios. No usa Neon, no aplica migraciones a la base configurada y no envía mensajes reales.

El simulador de correo de la aplicación permanece limitado a desarrollo. Para el proceso de prueba compilado se carga explícitamente `tests/production-mail-preload.mjs` con `--import`: intercepta únicamente el endpoint de envío de Resend y bloquea otras peticiones fetch externas. Este archivo no se importa desde la aplicación ni habilita un modo de correo ficticio en el despliegue oficial. No se debe usar esa opción al ejecutar el servidor oficial.

La base temporal PGlite tiene un solo backend. El transporte de producción usa el control de ciclos del protocolo ya utilizado por las pruebas compartidas de autenticación, y admite conexiones de los módulos compilados del servidor. Esta adaptación de la prueba no modifica la conexión real de la aplicación ni demuestra capacidad de carga de PostgreSQL.

## Cobertura

El listado público de eventos espera la petición antes de consultar la fecha y la base; sus cupos no se fijan durante la compilación ni se consultan allí. Se verifica su actualización después de una inscripción.

Se comprueban HTML, CSS y JavaScript compilados, ingreso y cierre de sesión por perfil, permisos de las API, bloqueo de códigos sin remitente, verificación familiar por código, inscripciones y QR, cupos, recepción, fila intercalada, atención, ausencias, resultados, vinculación presencial, edición de eventos, correcciones de datos, cancelaciones, lista de espera, cuentas del equipo, consentimiento y trazabilidad. Se comprueban también errores, reintentos y conservación de datos históricos mediante las pruebas existentes reutilizadas sobre el servidor compilado.

`npm run test:security` comprueba además límites y revocaciones compartidos entre dos servidores de desarrollo. La batería de producción no reemplaza una prueba de dos procesos compilados ni de carga real. Las comprobaciones de recursos HTTP no ejecutan un navegador y no equivalen a validar cámara, hidratación, accesibilidad o comportamiento en todos los dispositivos.

## Estado y límites

La compilación y las comprobaciones técnicas corresponden a la versión clínica actual de cuatro medidas. No validan ni activan el nuevo protocolo de siete medidas ni las categorías del PDF. El cierre completo del pendiente 3 conserva la condición acordada: incorporar y probar ese alcance después de confirmar CVAI, intervalos con decimales, discrepancias entre indicadores e interpretación clínica de DPOE. No se inventan esas reglas.

El remitente, el dominio y las pruebas con correo real siguen separados. La programación de seguimiento pertenece al pendiente 4; corrección/retiro de resultados al 5; recuperación de contraseñas al 6; pruebas conjuntas en dispositivos y PostgreSQL real al 7. La compilación local no despliega la aplicación ni certifica que esos pendientes estén completos.
