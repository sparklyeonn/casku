export { expoResultKey } from "./expo-delivery.ts"
import { expoResultKey } from "./expo-delivery.ts"
import { reviewExpoResult, EXPO_BATCH_TIME, EXPO_BATCH_LABEL, type ExpoSource } from "./expo-batch-review.ts"
import { LEGACY_REFERENCE_VERSION, formatCI } from "../craneometry-reference.ts"
import { contactSnapshotHash } from "./contact-policy.ts"
import type { MailMessage } from "../mail/brevo.ts"
export const EXPO_LOGO = "https://static.wixstatic.com/media/709320_ce716193fed945b2860543b7a0ca17b9~mv2.png/v1/crop/x_0,y_2335,w_8725,h_3993/fill/w_284,h_130,al_c,q_90/709320_ce716193fed945b2860543b7a0ca17b9~mv2.png"
export const EXPO_TEMPLATE = "expo-resultados-20261123-v1"
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
const requireValue = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason) }
const number = (value: number) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value)
export function approvedExpoItem(source: ExpoSource, expected: { evaluacionId: string; revision: number; contexto: string | null; hashDatos: string | null; correo: string | null }) {
  const review = reviewExpoResult(source, false, { omitUnconfirmed: true })
  requireValue(expected.evaluacionId === source.id && expected.revision === source.revision && expected.contexto === review.contexto && expected.hashDatos === review.hashDatos && expected.correo === review.correo, "SOURCE_CHANGED_REVIEW_AGAIN")
  const historical = review.protocolo === LEGACY_REFERENCE_VERSION
  // These two omissions are backed by the explicitly approved collective declaration,
  // recorded separately in the frozen batch. No per-family consent is fabricated.
  const collective = ["APODERADO_SIN_IDENTIFICAR", "AUTORIZACION_CORREO_PENDIENTE"]
  const permitted = historical ? [...collective, "PROTOCOLO_HISTORICO", "RESULTADO_POR_REVISAR"] : collective
  requireValue(review.motivos.every(code => permitted.includes(code)), "SOURCE_NOT_ELIGIBLE")
  let indicators = review.indicadores, omitted = review.indicadoresOmitidos
  if (historical) {
    requireValue([source.indiceCraneal, source.indiceAsimetria].every(Number.isFinite) && source.indiceCraneal > 0 && source.indiceAsimetria >= 0, "INVALID_HISTORICAL_VALUES")
    requireValue(source.indiceCraneal === source.biparietal / source.anteroposterior * 100 && source.indiceAsimetria === Math.abs(source.diagonalIzq - source.diagonalDer), "HISTORICAL_VALUES_CHANGED")
    const saved = /^Orientación preliminar: ([^.]+)\. Plagiocefalia: CVA ([^;]+); DPOE /.exec(source.diagnostico)
    requireValue(saved, "HISTORICAL_CLASSIFICATION_NOT_RECOGNIZED")
    const ci = saved![1].trim(), cva = saved![2].trim()
    requireValue(/^(Proporción normal|(?:Braquicefalia|Dolicocefalia) (?:leve|moderada|severa|muy severa)|Límite por confirmar con Casku)$/.test(ci), "HISTORICAL_CI_NOT_RECOGNIZED")
    requireValue(/^(normal|leve|moderada|severa|muy severa|límite decimal por confirmar)$/.test(cva), "HISTORICAL_CVA_NOT_RECOGNIZED")
    // Both numeric values and grades come from the original saved record.
    // Never apply current clinical thresholds to old measurements.
    const original = [{ nombre: "CI", valor: formatCI(source.indiceCraneal) + " %", clasificacion: ci }, { nombre: "CVA", valor: number(source.indiceAsimetria) + " mm", clasificacion: cva[0].toUpperCase() + cva.slice(1) }]
    indicators = original.filter(i => !/confirmar/i.test(i.clasificacion))
    omitted = original.filter(i => /confirmar/i.test(i.clasificacion))
  }
  requireValue(indicators.length > 0 && indicators.every(i => !/confirmar/i.test(i.clasificacion)), "NO_APPROVED_INDICATORS")
  requireValue(review.correo && review.contexto && review.hashDatos, "INVALID_SAVED_RECIPIENT")
  const datos = { nombreBebe: source.paciente.nombre, profesional: source.kinesiologa, fechaEvaluacion: source.createdAt, protocolo: review.protocolo, indicadores: indicators }
  const message = expoScheduledMessage(review.correo!, datos)
  return { evaluacionId: source.id, revision: source.revision, contexto: review.contexto!, hashDatos: review.hashDatos!, autorId: source.autorId, key: expoResultKey(source.id, source.revision), correo: review.correo!, datos, indicadoresOmitidos: omitted.map(i => i.nombre), hashMensajeSinProgramacion: contactSnapshotHash(message), message }
}
export function expoScheduledMessage(to: string, data: { nombreBebe: string; profesional: string; fechaEvaluacion: string; indicadores: Array<{ nombre: string; valor: string; clasificacion: string }> }): MailMessage {
  const names: Record<string, string> = { CI: "Índice cefálico — CI", CVA: "Asimetría craneal — CVA", CVAI: "Índice de asimetría — CVAI", DPOE: "Desviación occipital — DPOE" }
  requireValue(data.indicadores.length > 0 && data.indicadores.every(i => names[i.nombre] && !/confirmar/i.test(i.clasificacion)), "UNCONFIRMED_INDICATOR_IN_MAIL")
  const date = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "long", year: "numeric" }).format(new Date(data.fechaEvaluacion))
  const intro = `Compartimos los resultados de la evaluación craneométrica de ${data.nombreBebe}, realizada el ${date}, por ${data.profesional}.`
  const closing = "Si tienes dudas sobre el resultado o las indicaciones, puedes escribirnos a contacto@casku.cl.\n\nGracias por confiar en nosotros,\n\nEquipo Casku\nExpo Bebé-Niño · Noviembre 2026"
  const text = `Hola, familia:\n\nGracias por visitarnos en ${EXPO_BATCH_LABEL}, en Metropolitan Santiago.\n\n${intro}\n\nResultados de la evaluación\n\n${data.indicadores.map(i => `${names[i.nombre]}: ${i.valor}\nClasificación: ${i.clasificacion}`).join("\n\n")}\n\n${closing}`
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#eff6f5;font-family:Arial,Helvetica,sans-serif;color:#0d2123}table{border-collapse:collapse}.pad{padding:34px 42px}.shell{width:100%;max-width:640px;background:#fffef8}p{font-size:15px;line-height:1.7;margin:0 0 18px}h1{font:normal 34px/1.18 Georgia,serif;margin:22px 0}h2{font-size:19px;margin:0 0 18px}@media(max-width:520px){.pad{padding:26px 22px}.outer{padding:12px!important}h1{font-size:29px}}</style></head><body><table role="presentation" width="100%"><tr><td align="center" class="outer" style="padding:24px"><table role="presentation" class="shell"><tr><td style="height:7px;background:#00899a"></td></tr><tr><td class="pad"><img src="${EXPO_LOGO}" alt="Casku 3D" width="142" height="65" style="display:block;margin:16px 0 30px"><p style="font-size:11px;letter-spacing:1.4px;color:#004e58;font-weight:bold;margin-bottom:0">EXPO BEBÉ-NIÑO · NOVIEMBRE 2026</p><h1>Resultados de la evaluación<br>de tu bebé</h1><p>Hola, familia:</p><p>Gracias por visitarnos en <strong>${EXPO_BATCH_LABEL}</strong>, en Metropolitan Santiago.</p><p>Compartimos los resultados de la evaluación craneométrica de <strong>${escape(data.nombreBebe)}</strong>, realizada el <strong>${escape(date)}</strong>, por <strong>${escape(data.profesional)}</strong>.</p><h2>Resultados de la evaluación</h2><table role="presentation" width="100%">${data.indicadores.map(i => `<tr><td style="padding:20px;border:1px solid #d0dfdd;background:#eff6f5"><div style="font-size:13px;color:#4a5858">${names[i.nombre]}</div><div style="font-size:27px;color:#004e58;margin:10px 0">${escape(i.valor)}</div><div style="font-size:14px;line-height:1.5;color:#004e58"><strong>Clasificación:</strong> ${escape(i.clasificacion)}</div></td></tr><tr><td style="height:12px"></td></tr>`).join("")}</table><p style="margin-top:20px">Si tienes dudas sobre el resultado o las indicaciones, puedes escribirnos a <a href="mailto:contacto@casku.cl" style="color:#004e58">contacto@casku.cl</a>.</p><p>Gracias por confiar en nosotros,</p><p style="margin-bottom:0"><strong>Equipo Casku</strong><br>Expo Bebé-Niño · Noviembre 2026</p></td></tr></table></td></tr></table></body></html>`
  return { to, subject: "Resultado de evaluación craneométrica | Expo Bebé-Niño Noviembre 2026", html, text }
}
export function validateResultBatch(plan: { version: number; hash: string; scheduledAt: string; items: ReturnType<typeof approvedExpoItem>[]; approval: { confirmed: boolean; authority: string; count: number; legacy: string; omitUnconfirmed: boolean }; [key: string]: unknown }, approval = plan.hash) {
  const { hash, ...core } = plan
  requireValue(hash === approval && /^[a-f0-9]{64}$/.test(hash) && contactSnapshotHash(core) === hash, "APPROVAL_MISMATCH")
  requireValue(plan.version === 1 && plan.scheduledAt === EXPO_BATCH_TIME && plan.items.length === 95, "INVALID_RESULT_BATCH")
  requireValue(plan.approval.confirmed && plan.approval.authority === "Equipo Casku, Administración" && plan.approval.count === 95 && plan.approval.legacy === "SOLO_CI_CVA_ORIGINALES" && plan.approval.omitUnconfirmed === true, "MISSING_SCOPED_COLLECTIVE_APPROVAL")
  requireValue(new Set(plan.items.map(i => i.evaluacionId)).size === 95 && new Set(plan.items.map(i => i.key)).size === 95, "DUPLICATE_EVALUATION")
  for (const item of plan.items) {
    requireValue(item.key === expoResultKey(item.evaluacionId, item.revision) && item.correo === item.message.to && item.hashMensajeSinProgramacion === contactSnapshotHash(item.message), "ITEM_CHANGED")
    requireValue(item.datos.indicadores.every(i => !/confirmar/i.test(i.clasificacion)), "UNCONFIRMED_MAIL")
    requireValue(contactSnapshotHash(item.message) === contactSnapshotHash(expoScheduledMessage(item.correo, item.datos)), "TEMPLATE_CHANGED")
    if (item.datos.protocolo === LEGACY_REFERENCE_VERSION) requireValue(item.datos.indicadores.every(i => ["CI", "CVA"].includes(i.nombre)), "UNAPPROVED_HISTORICAL_INDICATOR")
  }
}
