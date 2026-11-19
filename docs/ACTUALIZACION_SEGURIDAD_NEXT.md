# Actualización de seguridad de Next.js

Se actualizó Next.js de **16.4.3 a 16.4.6**, objetivo exacto seleccionado por `next upgrade --agent=security`. Se conservan React, NextAuth, Prisma y los módulos de Casku en sus versiones anteriores.

## Cambios

- `package.json`: versiones exactas de `next` y `eslint-config-next` en 16.4.6.
- `package-lock.json`: artefactos de Next.js y dependencias compatibles de lint. TypeScript ESLint pasa a 8.73.0, su minimatch a 11.0.9 y Zod a 4.6.7; no se usó `npm audit fix --force`.
- `next.config.ts`: política de avisos `experimental.agentUpgrade: "security"`. Se conservan Cache Components, Partial Prefetching, Turbopack y agentFeedback.

La auditoría inicial mostraba 9 alertas (8 moderadas y 1 alta). Tras actualizar, `npm audit` informa **0 vulnerabilidades conocidas**. Esto describe la auditoría de dependencias, no una garantía general de ausencia de fallos.

## Verificación

Se utilizó una copia de trabajo aislada sin `.env` ni `.env.local`, con Node 22.14.0, base deliberadamente inutilizable como valor predeterminado y servicios reales desactivados. Cada suite creó sus propias bases y su proveedor de correo ficticio.

Pasaron:

- Instalación limpia con `npm ci --no-audit --no-fund`.
- Generación del cliente Prisma y comprobación de Next.js 16.4.6 instalado.
- `npm run check` completo: lint, 73 pruebas unitarias, colas de correo, Brevo y webhooks simulados, recuperación, administración de correos, eventos, autenticación con dos servidores, recorridos HTTP y familiares, producción y TypeScript.
- Compilación de producción y recorridos sobre `next start`, sin la interrupción de seguridad observada con 16.4.3.
- `npm audit`: 0 alertas.
- Recorridos visuales de recepción, fila, craneometría, consentimiento y administración en Chromium de escritorio, Android emulado, WebKit de escritorio, iPad emulado y pantalla de 320 px en modo oscuro. Todos conservaron la comprobación de ausencia de excepciones JavaScript y desbordamiento.

No se modificaron reglas clínicas, formularios, permisos, pruebas ni migraciones. No se conectó la base real ni se realizaron envíos reales. La verificación corresponde al entorno local de macOS; no se ejecutó un workflow remoto de GitHub Actions ni se certificaron dispositivos físicos.

Los avisos experimentales del modo de ejecución TypeScript de Node y la advertencia de uso concurrente de `pg` siguen apareciendo en algunas pruebas. No impidieron su finalización.

## Referencias

- [Versión oficial 16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6).
- [Aviso de seguridad sobre use cache y unstable_cache](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h).
- [Política de actualizaciones con agente](https://nextjs.org/docs/app/guides/upgrading/agent-upgrade).
