# Pendientes prioritarios

El dominio y el remitente verificado se gestionan por separado. Este estado corresponde al código; las pruebas locales no sustituyen la validación de producción.

1. [x] **Crítica — Seguridad de autenticación y límites compartidos.** Límites de acceso en PostgreSQL; sesiones revocables con vencimiento; controles propios y administrativos; prueba con dos servidores. Ver [SEGURIDAD_EQUIPO.md](SEGURIDAD_EQUIPO.md).
2. [x] **Crítica — Consentimiento, trazabilidad y controles de privacidad.** Aceptación versionada por bebé/evento, permisos separados para resultados y seguimiento, retirada desde la cuenta familiar, evidencia presencial y auditoría de accesos sin contenido clínico. Migración aplicada y pruebas locales completas. Ver [CONSENTIMIENTO_PRIVACIDAD.md](CONSENTIMIENTO_PRIVACIDAD.md); Casku debe aprobar textos y procedimientos antes del uso oficial.
3. [ ] **Crítica — Compilación completa y pruebas técnicas.** Compilación y validación técnica de la versión actual completadas, con pruebas sobre el servidor de producción y comando reproducible `npm run check`. El punto conserva su estado pendiente hasta incorporar y probar el protocolo clínico ampliado tras las confirmaciones de Casku. Ver [VALIDACION_PRODUCCION.md](VALIDACION_PRODUCCION.md).
4. [ ] **Crítica — Integración real de correos y gestión de fallos.** Infraestructura de órdenes por etapa, procesamiento por lotes, reintentos, recuperación y notificaciones normalizadas implementada y desactivada. Pendientes: protocolo/calendario/plantillas aprobados y, después del punto 7, integración de Brevo, autenticación de sus webhooks, activación y pruebas reales. Ver [INFRAESTRUCTURA_CORREOS.md](INFRAESTRUCTURA_CORREOS.md).
5. [ ] **Alta — Corrección o retiro seguro de resultados publicados.** Nuevas versiones y retiro con motivo, permisos e historial.
6. [ ] **Alta — Recuperación y cambio inicial de contraseñas.** Recuperación segura y cambio obligatorio de contraseñas temporales del equipo.
7. [ ] **Alta — Pruebas integrales de recepción, turnos y concurrencia.** Validación conjunta en dispositivos y PostgreSQL real, además de las pruebas automatizadas locales existentes.

## Alcance adicional acordado para integrar

Se recibió la ampliación a siete medidas, clasificación con CI/CVA/CVAI/DPOE y tres correos clínicos de resultados y seguimiento, con seguimiento para plagiocefalia alterada o braquicefalia/dolicocefalia alterada; la plagiocefalia normal por sí sola no excluye los casos mixtos. El análisis y sus decisiones pendientes están en [ALCANCE_CRANEOMETRIA_Y_SEGUIMIENTO.md](ALCANCE_CRANEOMETRIA_Y_SEGUIMIENTO.md). No está implementado y no cambia el orden anterior: consentimiento en el punto 2; ampliación clínica confirmada antes de cerrar las pruebas del punto 3; programación de correos en el 4; versiones/retiros en el 5; validación conjunta en el 7. DPOE usa el mayor de los dos valores, regla aclarada por la responsable con el ejemplo 5/8 mm → 8 mm; se indicó la protuberancia occipital externa como referencia y queda precisar el esquema de medición. La fórmula de CVAI, las fronteras y la regla ante discrepancias entre indicadores siguen pendientes de confirmación del equipo de Casku. La inclusión de casos mixtos ya fue aclarada por la responsable.

## Orden de las siguientes entregas

Continuar los puntos 5, 6 y 7; después abordar Brevo, verificación del remitente informado `contacto@casku.cl`, subdominio y despliegue. La infraestructura del punto 4 no activa los seguimientos ni cambia las decisiones clínicas pendientes.
