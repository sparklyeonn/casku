export type ResultMailState = { estado: string; reintentarDesde?: string | null }
export function resultMailState(mail: ResultMailState, retryAllowed = true, now = Date.now()) {
  const messages: Record<string, string> = {
    BLOQUEADO: "El correo de esta versión está en preparación y todavía no tiene el envío habilitado.",
    RETIRADO: "El resultado está retirado. No se enviarán correos de esta versión.",
    CANCELADO: "Envío detenido. Puede deberse a privacidad, vinculación o cambio de versión. La familia puede revisar sus permisos en Mis autorizaciones; no se enviará sin autorización vigente.",
    ENVIADO: "El proveedor aceptó el correo para su envío. Esto no confirma su entrega en el buzón; revisa también spam.",
    ACEPTADO: "El proveedor aceptó el correo para su envío. Esto no confirma su entrega en el buzón.",
    ENVIANDO: "El envío está en curso. Actualiza el estado antes de solicitar otro intento.",
    FALLIDO: "No se confirmó el envío. Puedes consultar el estado y reintentar cuando termine la espera.",
    PENDIENTE: "El correo está pendiente. El resultado ya está publicado en la cuenta familiar.",
    REVISION: "El envío requiere revisión del equipo para evitar duplicados. No solicites otro envío.",
    AGOTADO: "Se alcanzó el límite de intentos. Solicita al equipo revisar el envío.",
    OMITIDO: "El envío fue omitido por la política vigente. Consulta con el equipo si necesitas revisar el motivo.",
  }
  const available = mail.reintentarDesde ? Date.parse(mail.reintentarDesde) : null
  const waiting = available !== null && (!Number.isFinite(available) || available > now)
  return { text: messages[mail.estado] || "No pudimos interpretar el estado del correo. Actualiza el estado o solicita revisión al equipo.", canRetry: retryAllowed && !waiting && ["PENDIENTE", "FALLIDO"].includes(mail.estado), waiting }
}
