export const EXPO_REMINDER_SCHEDULED_AT = "2026-11-18T22:00:00.000Z"
const zone = "America/Santiago"
const days = new Set(["2026-11-20", "2026-11-21", "2026-11-22"])
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)
export function buildExpoReminder(startTimes: string[]) {
  if (!Array.isArray(startTimes) || !startTimes.length || startTimes.length > 50) throw new Error("Revisa las citas del recordatorio.")
  const times = [...new Set(startTimes.map(value => {
    if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("La cita necesita fecha, hora y zona horaria.")
    const date = new Date(value), parts = new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
    const part = (key: string) => parts.find(row => row.type === key)!.value
    if (!days.has(`${part("year")}-${part("month")}-${part("day")}`)) throw new Error("La cita no corresponde a Expo Bebé del 20 al 22 de noviembre.")
    return date.getTime()
  }))].sort((a, b) => a - b)
  const appointments = times.map(value => {
    const date = new Date(value)
    return { dia: new Intl.DateTimeFormat("es-CL", { timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date), hora: new Intl.DateTimeFormat("es-CL", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date) }
  })
  const subject = "Tu cita de craneometría en Expo Bebé · Casku"
  const slots = appointments.map(row => `${row.dia}, a las ${row.hora} h (hora de Santiago)`)
  const text = `¡Hola!\n\nTe recordamos que tienes ${slots.length === 1 ? "una reserva" : "reservas"} para una craneometría con Casku en Expo Bebé.\n\n${slots.join("\n")}\n\nLugar: Metropolitan Santiago.\nLa Expo se realizará el 20, 21 y 22 de noviembre de 2026. Tu atención corresponde al día y horario indicados arriba.\n\nConserva tu confirmación de Calendly y preséntala al llegar. Para cambiar o cancelar tu cita, utiliza los enlaces de esa confirmación.\n\n¡Te esperamos!\nEquipo Casku\ncontacto@casku.cl`
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#18353b"><p style="font-size:28px;font-weight:bold;color:#144772">casku 3D</p><h1 style="font-size:26px">¡Nos vemos en Expo Bebé!</h1><p>Te recordamos que tienes ${slots.length === 1 ? "una reserva" : "reservas"} para una <strong>craneometría con Casku</strong>.</p><div style="background:#e6f3ef;border-radius:14px;padding:22px"><p style="font-weight:bold">Tu día y horario de atención</p>${appointments.map(row => `<p style="font-size:19px">${escape(row.dia)}<br/><strong>${escape(row.hora)} h</strong> · hora de Santiago</p>`).join("")}<p><strong>Lugar:</strong> Metropolitan Santiago</p></div><p>La Expo se realizará el <strong>20, 21 y 22 de noviembre de 2026</strong>. Tu atención corresponde al día y horario indicados arriba.</p><p>Conserva tu confirmación de Calendly y preséntala al llegar. Para cambiar o cancelar tu cita, utiliza los enlaces de esa confirmación.</p><p>¡Te esperamos!<br/>Equipo Casku<br/>contacto@casku.cl</p></div>`
  return { subject, text, html, scheduledAt: EXPO_REMINDER_SCHEDULED_AT, appointments }
}
