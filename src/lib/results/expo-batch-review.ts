import { calcularReferencia, REFERENCE_VERSION, formatCI } from "../craneometry-reference.ts"
import { readComplementaryValues } from "../measurement-fields.ts"
import { parseSnapshot, type ResultSnapshot } from "./snapshot.ts"
import { publicationProblem } from "./protocol.ts"
import { contactEmail, contactSnapshotHash, CONTACT_CONSENT_VERSION } from "./contact-policy.ts"
import { PRIVACY_VERSION } from "../privacy/policy.ts"

export const EXPO_BATCH_TIME = "2026-11-23T13:00:00.000Z"
export const EXPO_BATCH_LABEL = "Expo Bebé-Niño Noviembre 2026"
export const batchReasons: Record<string, string> = {
  CORREO_INVALIDO: "Correo guardado ausente o inválido",
  AUTORIA_PENDIENTE: "Falta una cuenta clínica activa responsable",
  DATOS_NO_AUTORIZADOS: "La autorización de evaluación no está vigente o no corresponde a la ficha",
  APODERADO_SIN_IDENTIFICAR: "El nombre real del apoderado no está identificado en la autorización",
  AUTORIZACION_CORREO_PENDIENTE: "Falta respaldo específico de autorización para enviar esta revisión a ese correo",
  RESULTADO_POR_REVISAR: "El resultado necesita revisión o guardado de las medidas",
  PROTOCOLO_HISTORICO: "Registro histórico: requiere revisión antes de usar el formato con cuatro indicadores",
  CLASIFICACION_PENDIENTE: "Un indicador muestra un límite pendiente de confirmar con Casku",
  FLUJO_FAMILIAR: "La ficha está vinculada a una cuenta o publicación: revisar su flujo vigente",
  ATENCION_NO_VIGENTE: "La atención no está finalizada o su inscripción fue cancelada",
  DESTINATARIO_SUPRIMIDO: "El correo está bloqueado por rebote o queja",
  ENVIO_PREVIO: "Existe una copia ya enviada; no repetir automáticamente",
  ENVIO_INCIERTO: "Existe un envío en curso o incierto; requiere conciliación antes de otro intento",
}
export type ExpoSource = {
  id: string; revision: number; pacienteId: string; createdAt: string; autorId: string | null;
  anteroposterior: number; biparietal: number; diagonalIzq: number; diagonalDer: number;
  medicionesComplementarias: unknown; indiceCraneal: number; indiceAsimetria: number; diagnostico: string; recomendacion: string; kinesiologa: string;
  paciente: { nombre: string; fechaNacimiento: string; apoderadoId: string | null; revisionDatos: number };
  autor: { id: string; name: string; active: boolean; role: string; mustChangePassword: boolean } | null;
  autorizacion: { id: string; revision: number; pacienteId: string; eventoId: string | null; apoderadoId: string | null; datos: boolean; versionTexto: string; correoResultados: boolean } | null;
  declarante: string | null; referenciaAutorizacion: string | null; canalAutorizacion: string | null;
  inscripcion: { eventoId: string; apoderadoId: string | null; contactoNombre: string | null; revisionContacto: number; numero: number; cancelada: boolean; estadoFila: string } | null;
  eventoNombre: string | null; correo: string | null;
  publicacion: { estado: string } | null;
  copias: Array<{ revision: number; contexto: string; hashDatos: string; destinatario: string; nombreApoderado: string; autorizacionId: string; autorizacionRevision: number; actorId: string; consentimientoVersion: string; confirmarApoderado: boolean; autorizarCorreo: boolean; estado: string; ledgerEstado?: string | null; claveEnvio: string; proveedorId: string | null }>;
}
export function reviewExpoResult(row: ExpoSource, suppressed = false, options: { omitUnconfirmed?: boolean } = {}) {
  const reasons: string[] = []
  const add = (code: string) => { if (!reasons.includes(code)) reasons.push(code) }
  let correo: string | null = null
  try { correo = contactEmail(row.correo) } catch { add("CORREO_INVALIDO") }
  if (!row.autor || row.autor.id !== row.autorId || row.autor.role !== "KINESIOLOGO" || !row.autor.active || row.autor.mustChangePassword) add("AUTORIA_PENDIENTE")
  const guardian = (row.inscripcion?.contactoNombre ?? row.declarante ?? "").trim()
  if (guardian.length < 3 || /^Apoderado presente sin nombre/i.test(guardian)) add("APODERADO_SIN_IDENTIFICAR")
  const permission = row.autorizacion
  if (!permission?.datos || permission.versionTexto !== PRIVACY_VERSION || permission.pacienteId !== row.pacienteId || permission.eventoId !== (row.inscripcion?.eventoId ?? null) || permission.apoderadoId !== null) add("DATOS_NO_AUTORIZADOS")
  if (row.paciente.apoderadoId || row.inscripcion?.apoderadoId || row.publicacion) add("FLUJO_FAMILIAR")
  if (row.inscripcion && (row.inscripcion.cancelada || row.inscripcion.estadoFila !== "ATENDIDO")) add("ATENCION_NO_VIGENTE")
  if (suppressed) add("DESTINATARIO_SUPRIMIDO")
  let snapshot: ResultSnapshot | null = null
  let contexto: string | null = null
  let hashDatos: string | null = null
  let indicadores: Array<{ nombre: string; valor: string; clasificacion: string }> = []
  let indicadoresOmitidos: typeof indicadores = []
  try {
    snapshot = parseSnapshot({ nombreBebe: row.paciente.nombre, fechaNacimiento: row.paciente.fechaNacimiento.slice(0, 10), profesional: row.kinesiologa, evento: row.eventoNombre, numero: row.inscripcion?.numero ?? null, fechaEvaluacion: row.createdAt, medidas: { ap: row.anteroposterior, bp: row.biparietal, di: row.diagonalIzq, dd: row.diagonalDer, ...readComplementaryValues(row.medicionesComplementarias) }, indiceCraneal: row.indiceCraneal, indiceAsimetria: row.indiceAsimetria, diagnostico: row.diagnostico, recomendacion: row.recomendacion })
    if (publicationProblem(snapshot)) add("RESULTADO_POR_REVISAR")
    if (snapshot.medidas.protocolo !== REFERENCE_VERSION) add("PROTOCOLO_HISTORICO")
    else {
      const values = calcularReferencia(snapshot.medidas as Parameters<typeof calcularReferencia>[0])
      const n = (v: number) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(v)
      indicadores = [{ nombre: "CI", valor: formatCI(values.ci) + " %", clasificacion: values.forma }, { nombre: "CVA", valor: n(values.cva) + " mm", clasificacion: values.clasificacionCVA }, { nombre: "CVAI", valor: n(values.cvai) + " %", clasificacion: values.clasificacionCVAI }, { nombre: "DPOE", valor: n(values.dpoe) + " mm", clasificacion: values.clasificacionDPOE }]
      const pending = indicadores.filter(x => /confirmar/i.test(x.clasificacion))
      if (pending.length && options.omitUnconfirmed) { indicadoresOmitidos = pending; indicadores = indicadores.filter(x => !/confirmar/i.test(x.clasificacion)) }
      else if (pending.length) add("CLASIFICACION_PENDIENTE")
    }
    hashDatos = contactSnapshotHash(snapshot)
    contexto = contactSnapshotHash({ id: row.id, revision: row.revision, email: correo, guardian, hashDatos, contactRevision: row.inscripcion?.revisionContacto ?? null, patientRevision: row.paciente.revisionDatos, authorizationId: permission?.id, authorizationRevision: permission?.revision })
  } catch { add("RESULTADO_POR_REVISAR") }
  const consent = row.copias.some(copy => copy.revision === row.revision && copy.contexto === contexto && copy.hashDatos === hashDatos && copy.destinatario === correo && copy.nombreApoderado === guardian && copy.actorId === row.autorId && copy.autorizacionId === permission?.id && copy.autorizacionRevision === permission?.revision && copy.consentimientoVersion === CONTACT_CONSENT_VERSION && copy.confirmarApoderado && copy.autorizarCorreo && !["CANCELADO", "RECHAZADO", "REVISION"].includes(copy.estado))
  // Un correo en la ficha o una autorización de datos NO equivalen a permiso
  // de envío clínico. Este preparador nunca crea ni modifica autorizaciones.
  if (!consent) add("AUTORIZACION_CORREO_PENDIENTE")
  if (row.copias.some(copy => copy.estado === "ACEPTADO" || copy.ledgerEstado === "ACEPTADO" || copy.proveedorId)) add("ENVIO_PREVIO")
  if (row.copias.some(copy => ["ENVIANDO", "REVISION"].includes(copy.estado) || ["ENVIANDO", "REVISION"].includes(copy.ledgerEstado ?? ""))) add("ENVIO_INCIERTO")
  return { evaluacionId: row.id, revision: row.revision, pacienteId: row.pacienteId, bebe: row.paciente.nombre, correo, apoderado: guardian, autorId: row.autorId, profesional: row.autor?.name ?? row.kinesiologa, fechaEvaluacion: row.createdAt, estado: reasons.length ? "BLOQUEADO" : "PENDIENTE_APROBACION_FINAL", motivos: reasons, indicadores, indicadoresOmitidos, protocolo: snapshot?.medidas.protocolo ?? "legacy-4", contexto, hashDatos, autorizacion: permission ? { id: permission.id, revision: permission.revision, datos: permission.datos, correoEnFicha: permission.correoResultados, envioEspecificoRegistrado: consent, referencia: row.referenciaAutorizacion, canal: row.canalAutorizacion } : null }
}
export function summarizeExpoReview(rows: ReturnType<typeof reviewExpoResult>[]) {
  const ids = new Set(rows.map(row => row.evaluacionId))
  if (ids.size !== rows.length) throw new Error("EVALUACIONES_DUPLICADAS")
  const counts: Record<string, number> = {}, professionals: Record<string, { evaluaciones: number; bloqueados: number }> = {}
  const emails = new Map<string, number>()
  for (const row of rows) {
    for (const reason of row.motivos) counts[reason] = (counts[reason] ?? 0) + 1
    const key = row.autorId ?? "SIN_AUTORIA"
    const group = professionals[key] ??= { evaluaciones: 0, bloqueados: 0 }
    group.evaluaciones++; if (row.motivos.length) group.bloqueados++
    if (row.correo) emails.set(row.correo, (emails.get(row.correo) ?? 0) + 1)
  }
  return { total: rows.length, bebes: new Set(rows.map(row => row.pacienteId)).size, direcciones: emails.size, correosCompartidos: [...emails.values()].filter(n => n > 1).length, bloqueados: rows.filter(row => row.motivos.length).length, pendientesAprobacionFinal: rows.filter(row => !row.motivos.length).length, casosConIndicadoresOmitidos: rows.filter(row => row.indicadoresOmitidos.length > 0).length, totalIndicadoresOmitidos: rows.reduce((total, row) => total + row.indicadoresOmitidos.length, 0), motivos: counts, porProfesional: professionals }
}
