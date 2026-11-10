# Pendientes prioritarios

El dominio y el remitente verificado se gestionan por separado. Este estado corresponde al código; las pruebas locales no sustituyen la validación de producción.

1. [x] **Crítica — Seguridad de autenticación y límites compartidos.** Límites de acceso en PostgreSQL; sesiones revocables con vencimiento; controles propios y administrativos; prueba con dos servidores. Ver [SEGURIDAD_EQUIPO.md](SEGURIDAD_EQUIPO.md).
2. [ ] **Crítica — Consentimiento, trazabilidad y controles de privacidad.** Completar el registro de consentimiento y las revisiones de acceso y privacidad.
3. [ ] **Crítica — Compilación completa y pruebas técnicas.** Completar la compilación de producción y la validación técnica final. Las pruebas de desarrollo de cada entrega no cierran este pendiente.
4. [ ] **Crítica — Integración real de correos y gestión de fallos.** Completar reintentos programados y notificaciones de entrega/rebote; la prueba real depende del remitente.
5. [ ] **Alta — Corrección o retiro seguro de resultados publicados.** Nuevas versiones y retiro con motivo, permisos e historial.
6. [ ] **Alta — Recuperación y cambio inicial de contraseñas.** Recuperación segura y cambio obligatorio de contraseñas temporales del equipo.
7. [ ] **Alta — Pruebas integrales de recepción, turnos y concurrencia.** Validación conjunta en dispositivos y PostgreSQL real, además de las pruebas automatizadas locales existentes.
