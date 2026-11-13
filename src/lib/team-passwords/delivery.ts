import { sendMail } from "@/lib/families/mail"
export function recoveryTransport() {
 // El transporte oficial se incorporará con Brevo. Ninguna variable pública habilita estos envíos.
 if(process.env.NODE_ENV!=="development"||process.env.CASKU_TEST_MODE!=="1"||process.env.CASKU_TEAM_RECOVERY_TEST_MAIL!=="1"||process.env.RESEND_API_KEY!=="re_local_test_only")return null
 try {const url=new URL(process.env.CASKU_TEST_MAIL_URL||"");if(url.protocol!=="http:"||url.hostname!=="127.0.0.1")return null}catch{return null}
 return async(email:string,link:string,id:string)=>sendMail({to:email,subject:"Recupera tu contraseña del equipo Casku",text:`Recibimos una solicitud para cambiar tu contraseña del equipo Casku. Abre este enlace: ${link}\nEl enlace vence en 30 minutos y puede usarse una sola vez. Si no lo solicitaste, ignora este correo. Tu contraseña no cambió.`,html:`<p>Recibimos una solicitud para cambiar tu contraseña del equipo Casku.</p><p><a href="${link}">Elegir una nueva contraseña</a></p><p>El enlace vence en 30 minutos y puede usarse una sola vez. Si no lo solicitaste, ignora este correo. Tu contraseña no cambió.</p>`},`team-recovery-${id}`)
}
