// Comprobación local y sin red. Nunca devuelve valores de configuración privada.
export type DeploymentStage = "ensayo" | "produccion"
type Environment = Record<string, string | undefined>
type Finding = { variable: string; mensaje: string }
const email = (value: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && !/[\r\n\0]/.test(value)
const key = (value: string | undefined) => !!value && value.length >= 32 && !/[\r\n\0]/.test(value)
const token = (value: string | undefined) => !!value && /^[A-Za-z0-9_-]{32,256}$/.test(value)
export function checkDeploymentEnvironment(env: Environment, stage: DeploymentStage) {
  const errores: Finding[] = [], avisos: Finding[] = []
  const fail = (variable: string, mensaje: string) => errores.push({ variable, mensaje })
  const warn = (variable: string, mensaje: string) => avisos.push({ variable, mensaje })
  if (!["ensayo", "produccion"].includes(stage)) throw new Error("Etapa de despliegue inválida.")
  try {
    const url = new URL(env.AUTH_URL || "")
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.hostname.endsWith(".invalid") || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error()
    if (env.NEXTAUTH_URL && env.NEXTAUTH_URL.replace(/\/$/, "") !== url.origin) fail("NEXTAUTH_URL", "Debe coincidir con AUTH_URL.")
  } catch { fail("AUTH_URL", "Configura el origen HTTPS exacto del alojamiento, sin rutas, credenciales ni parámetros.") }
  if (!key(env.AUTH_SECRET)) fail("AUTH_SECRET", "Configura un secreto privado estable de al menos 32 caracteres.")
  try {
    const url = new URL(env.DATABASE_URL || "")
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.hostname.endsWith(".invalid") || !url.pathname.slice(1)) throw new Error()
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error()
    if (!["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") || env.PGSSLMODE || "")) fail("DATABASE_URL", "La conexión remota debe configurar SSL; usa la conexión segura que entregue PostgreSQL.")
  } catch { fail("DATABASE_URL", "Configura una conexión PostgreSQL remota válida del entorno elegido.") }
  for (const name of ["CASKU_TEST_MODE", "CASKU_PRODUCTION_TEST"]) if (env[name] === "1") fail(name, "El alojamiento no debe ejecutar modos de simulación.")
  if (env.CASKU_TEST_MAIL_URL || /production-mail-preload/.test(env.NODE_OPTIONS || "")) fail("NODE_OPTIONS", "Retira el proveedor simulado de las pruebas técnicas.")
  if (env.CASKU_MAIL_AUTOMATION !== "0") fail("CASKU_MAIL_AUTOMATION", "Mantén desactivado el seguimiento clínico mientras su protocolo y activación estén pendientes.")
  if (!["0", "1"].includes(env.CASKU_MAIL_ENABLED || "")) fail("CASKU_MAIL_ENABLED", "Selecciona explícitamente 0 o 1.")
  if (!["pruebas", "produccion"].includes(env.CASKU_MAIL_MODE || "")) fail("CASKU_MAIL_MODE", "Selecciona explícitamente pruebas o produccion.")
  if (stage === "ensayo" && env.CASKU_MAIL_MODE !== "pruebas") fail("CASKU_MAIL_MODE", "El ensayo solo permite el modo pruebas con destinatarios restringidos.")
  if (stage === "produccion" && (env.CASKU_MAIL_ENABLED !== "1" || env.CASKU_MAIL_MODE !== "produccion")) fail("CASKU_MAIL_MODE", "La apertura a familias requiere correo habilitado y la activación explícita del modo produccion.")
  if (env.CASKU_MAIL_ENABLED === "1") {
    if (!env.BREVO_API_KEY?.trim() || env.BREVO_API_KEY === "brevo_local_test_only") fail("BREVO_API_KEY", "Configura la clave privada del proveedor real, no la del simulador.")
    if (env.BREVO_SENDER_VERIFIED !== "1" || !email(env.BREVO_SENDER_EMAIL || "")) fail("BREVO_SENDER_EMAIL", "Configura el remitente verificado de Brevo.")
    for (const name of ["CASKU_MAIL_DELIVERY_SECRET", "CASKU_MAIL_SUPPRESSION_SECRET"]) if (!key(env[name])) fail(name, "Configura el secreto estable de al menos 32 caracteres.")
    if (env.CASKU_MAIL_MODE === "pruebas") {
      const recipients = (env.CASKU_MAIL_TEST_RECIPIENTS || "").split(",").map(value => value.trim())
      if (!recipients.length || recipients.some(value => !email(value))) fail("CASKU_MAIL_TEST_RECIPIENTS", "Indica únicamente los correos autorizados para pruebas.")
    }
  } else warn("CASKU_MAIL_ENABLED", "Sin correo no habrá códigos de acceso familiar ni confirmaciones; este ensayo permite revisar el acceso del equipo.")
  for (const name of ["BREVO_WEBHOOK_ENABLED", "CALENDLY_ENABLED", "CASKU_PASSWORD_RECOVERY_ENABLED"]) if (!["0", "1"].includes(env[name] || "")) fail(name, "Selecciona explícitamente 0 o 1.")
  if (env.BREVO_WEBHOOK_ENABLED === "1") {
    if (!token(env.BREVO_WEBHOOK_SECRET)) fail("BREVO_WEBHOOK_SECRET", "Configura el token privado independiente del webhook.")
    if (!key(env.CASKU_MAIL_SUPPRESSION_SECRET)) fail("CASKU_MAIL_SUPPRESSION_SECRET", "El webhook necesita el secreto estable de supresión.")
  }
  if (env.CALENDLY_ENABLED === "1" && !env.CALENDLY_API_TOKEN?.trim()) fail("CALENDLY_API_TOKEN", "Configura el token privado de lectura de Calendly.")
  if (env.CASKU_PASSWORD_RECOVERY_ENABLED === "1") {
    const value = env.CASKU_PASSWORD_RECOVERY_QUEUE_KEY || ""
    if (!/^[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value, "base64url").length !== 32 || Buffer.from(value, "base64url").toString("base64url") !== value) fail("CASKU_PASSWORD_RECOVERY_QUEUE_KEY", "Configura una clave base64url de 32 bytes para la cola privada.")
    if (!token(env.CASKU_PASSWORD_RECOVERY_WORKER_SECRET)) fail("CASKU_PASSWORD_RECOVERY_WORKER_SECRET", "Configura un token privado para el procesador.")
    if (env.CASKU_MAIL_ENABLED !== "1") fail("CASKU_PASSWORD_RECOVERY_ENABLED", "La recuperación necesita correo habilitado.")
    if (env.VERCEL === "1" && !token(env.CRON_SECRET)) fail("CRON_SECRET", "Configura el token privado independiente del cron de Vercel.")
    warn("CASKU_PASSWORD_RECOVERY_WORKER_SECRET", "Verifica en el hosting que el procesador privado se ejecute periódicamente; las variables no programan el trabajo.")
  } else warn("CASKU_PASSWORD_RECOVERY_ENABLED", "La recuperación por correo permanece desactivada.")
  if(env.CALENDLY_WEBHOOK_ENABLED==="1") {
    if(env.CALENDLY_ENABLED!=="1")fail("CALENDLY_WEBHOOK_ENABLED","Los avisos requieren la conexión privada con Calendly.")
    if(!token(env.CALENDLY_WEBHOOK_SIGNING_KEY))fail("CALENDLY_WEBHOOK_SIGNING_KEY","Configura una clave de firma privada independiente.")
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(env.CALENDLY_WEBHOOK_SUBSCRIPTION_ID||""))fail("CALENDLY_WEBHOOK_SUBSCRIPTION_ID","Configura la referencia de la suscripción de esta cuenta.")
    if(!token(env.CRON_SECRET))fail("CRON_SECRET","Configura el token de las tareas diarias de recuperación.")
    warn("CALENDLY_WEBHOOK_ENABLED","Verifica la suscripción activa y actualiza la protección inicial de cada jornada; las variables no acreditan entregas reales.")
  }
  const secrets = ["CALENDLY_WEBHOOK_SIGNING_KEY","CRON_SECRET", "AUTH_SECRET", "CASKU_MAIL_DELIVERY_SECRET", "CASKU_MAIL_SUPPRESSION_SECRET", "CASKU_PASSWORD_RECOVERY_QUEUE_KEY", "CASKU_PASSWORD_RECOVERY_WORKER_SECRET", "BREVO_WEBHOOK_SECRET"]
  const used = new Set<string>()
  for (const name of secrets) if (env[name]) { if (used.has(env[name]!)) fail(name, "Los secretos de distintos módulos deben ser independientes."); used.add(env[name]!) }
  warn("DATABASE_URL", "Confirma el destino y el aislamiento entre ensayo y producción. Esta comprobación no conecta a la base ni acredita migraciones, cuentas o respaldos.")
  return { etapa: stage, variablesValidas: errores.length === 0, errores, avisos }
}
