# Casku · Atención y eventos

Web de craneometrias, para expo niño y bebé.

## Uso local

1. Instalar dependencias con `npm ci` si no existen.
2. Configurar `DATABASE_URL` en `.env` con la conexión existente. No ejecutar migraciones para esta etapa.
3. Ejecutar `npm run account:create` y seguir el asistente para crear cada cuenta del equipo.
4. Ejecutar `npm run dev` y abrir http://localhost:3000/login.

Perfiles disponibles: `KINESIOLOGO`, `RECEPCION`, `ADMIN`. No hay contraseñas de demostración. La configuración privada de cuentas se guarda en `.env.local`.

## Verificación

- `npm test`: contraseñas, permisos, cuentas y validación de evaluaciones.
- `npm run test:http`: inicio/cierre de sesión y permisos mediante servidor temporal en el puerto 3117, con cuentas efímeras y conexión de base ficticia. No crea pacientes ni envía correos.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.

Consulta [el plan de implementación](docs/IMPLEMENTACION.md) para conocer el alcance, las etapas pendientes y las condiciones antes de publicar.
