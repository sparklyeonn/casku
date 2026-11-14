import { mailConfig, sendMail, escapeHtml } from "@/lib/families/mail"
export function recoveryTransport() {
  try { mailConfig("RECUPERACION") } catch { return null }
  return async(email: string, link: string, id: string) => sendMail({to:email,subject:"Recupera tu contraseña del equipo Casku",text:`Recibimos una solicitud para cambiar tu contraseña del equipo Casku. Abre este enlace: ${link}\nEl enlace vence en 30 minutos y puede usarse una sola vez. Si no lo solicitaste, ignora este correo. Tu contraseña no cambió.`,html:`<p>Recibimos una solicitud para cambiar tu contraseña del equipo Casku.</p><p><a href="${escapeHtml(link)}">Elegir una nueva contraseña</a></p><p>El enlace vence en 30 minutos y puede usarse una sola vez. Si no lo solicitaste, ignora este correo. Tu contraseña no cambió.</p>`},`team-recovery-${id}`,"RECUPERACION")
}
