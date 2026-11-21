export const DAILY_DATES = ["2026-11-21", "2026-11-22"]
export const DAILY_ZONE = "America/Santiago"
export function localDay(value) {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("INVALID_TIME")
  const parts = new Intl.DateTimeFormat("en", { timeZone: DAILY_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value))
  return ["year", "month", "day"].map(key => parts.find(p => p.type === key).value).join("-")
}
export function scheduledAt(day) {
  if (!DAILY_DATES.includes(day)) throw new Error("INVALID_DAY")
  return `${day}T12:00:00.000Z`
}
export function buildDailyReminder(day, startTimes) {
  scheduledAt(day)
  if (!Array.isArray(startTimes) || !startTimes.length || startTimes.length > 100 || startTimes.some(t => localDay(t) !== day)) throw new Error("INVALID_BOOKINGS")
  const hours = [...new Set(startTimes.map(t => Date.parse(t)))].sort((a, b) => a - b).map(t => new Intl.DateTimeFormat("es-CL", { timeZone: DAILY_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t)))
  const date = new Intl.DateTimeFormat("es-CL", { timeZone: DAILY_ZONE, weekday: "long", day: "numeric", month: "long" }).format(new Date(`${day}T12:00:00Z`))
  const subject = "Hoy tienes craneometría en Expo Bebé · Casku"
  const text = `¡Hola!\n\nHoy, ${date}, tienes ${hours.length === 1 ? "una cita" : "citas"} de craneometría con Casku en Expo Bebé.\n\nHorario${hours.length === 1 ? "" : "s"}: ${hours.join(" y ")} h (hora de Santiago).\nLugar: Metropolitan Santiago.\n\nConserva tu confirmación de Calendly y preséntala al llegar. Para cambiar o cancelar tu cita, utiliza los enlaces de esa confirmación.\n\n¡Te esperamos!\nEquipo Casku\ncontacto@casku.cl`
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#18353b"><p style="font-size:28px;font-weight:bold;color:#144772">casku 3D</p><h1>¡Hoy tienes craneometría!</h1><p>Hoy, ${date}, te esperamos con Casku en Expo Bebé.</p><div style="background:#e6f3ef;border-radius:14px;padding:22px"><p><strong>Tu horario de atención:</strong> ${hours.join(" y ")} h · hora de Santiago</p><p><strong>Lugar:</strong> Metropolitan Santiago</p></div><p>Conserva tu confirmación de Calendly y preséntala al llegar. Para cambiar o cancelar tu cita, utiliza los enlaces de esa confirmación.</p><p>¡Te esperamos!<br/>Equipo Casku<br/>contacto@casku.cl</p></div>`
  return { subject, text, html }
}
