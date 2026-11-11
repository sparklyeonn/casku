# Pendientes prioritarios

El dominio y el remitente verificado se gestionan por separado. Este estado corresponde al código; las pruebas locales no sustituyen la validación de producción.

1. [x] **Crítica — Seguridad de autenticación y límites compartidos.** Límites de acceso en PostgreSQL; sesiones revocables con vencimiento; controles propios y administrativos; prueba con dos servidores. Ver [SEGURIDAD_EQUIPO.md](SEGURIDAD_EQUIPO.md).
2. [x] **Crítica — Consentimiento, trazabilidad y controles de privacidad.** Aceptación versionada por bebé/evento, permisos separados para resultados y seguimiento, retirada desde la cuenta familiar, evidencia presencial y auditoría de accesos sin contenido clínico. Migración aplicada y pruebas locales completas. Ver [CONSENTIMIENTO_PRIVACIDAD.md](CONSENTIMIENTO_PRIVACIDAD.md); Casku debe aprobar textos y procedimientos antes del uso oficial.
3. [ ] **Crítica — Compilación completa y pruebas técnicas.** Completar la compilación de producción y la validación técnica final. Las pruebas de desarrollo de cada entrega no cierran este pendiente.
4. [ ] **Crítica — Integración real de correos y gestión de fallos.** Completar reintentos programados y notificaciones de entrega/rebote; la prueba real depende del remitente.
5. [ ] **Alta — Corrección o retiro seguro de resultados publicados.** Nuevas versiones y retiro con motivo, permisos e historial.
6. [ ] **Alta — Recuperación y cambio inicial de contraseñas.** Recuperación segura y cambio obligatorio de contraseñas temporales del equipo.
7. [ ] **Alta — Pruebas integrales de recepción, turnos y concurrencia.** Validación conjunta en dispositivos y PostgreSQL real, además de las pruebas automatizadas locales existentes.

## Alcance adicional acordado para integrar

Se recibió la ampliación a siete medidas, clasificación con CI/CVA/CVAI/DPOE y tres correos clínicos de resultados y seguimiento, con seguimiento para plagiocefalia alterada o braquicefalia/dolicocefalia alterada; la plagiocefalia normal por sí sola no excluye los casos mixtos. El análisis y sus decisiones pendientes están en [ALCANCE_CRANEOMETRIA_Y_SEGUIMIENTO.md](ALCANCE_CRANEOMETRIA_Y_SEGUIMIENTO.md). No está implementado y no cambia el orden anterior: consentimiento en el punto 2; ampliación clínica confirmada antes de cerrar las pruebas del punto 3; programación de correos en el 4; versiones/retiros en el 5; validación conjunta en el 7. DPOE se prepara provisionalmente como el máximo de dos desviaciones, a la espera de confirmación clínica. La fórmula de CVAI, las fronteras y la regla ante discrepancias entre indicadores siguen pendientes de confirmación del equipo de Casku. La inclusión de casos mixtos ya fue aclarada por la responsable.
