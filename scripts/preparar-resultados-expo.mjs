import assert from "node:assert/strict"
import { readFile, mkdir, realpath, chmod, open } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { parse } from "dotenv"
import { Client, types as pgTypes } from "pg"
import { reviewExpoResult, summarizeExpoReview, EXPO_BATCH_TIME, EXPO_BATCH_LABEL, batchReasons } from "../src/lib/results/expo-batch-review.ts"
import { recipientKey } from "../src/lib/mail/webhook-policy.ts"
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export function parseReviewArgs(args) {
  assert((args.length === 4 || (args.length === 5 && args[4] === "--omit-unconfirmed")) && args[0] === "--database-env" && args[2] === "--expected-count", "Uso: node --experimental-strip-types scripts/preparar-resultados-expo.mjs --database-env ARCHIVO --expected-count 95")
  assert(/^[1-9]\d{0,4}$/.test(args[3]), "Cantidad esperada inválida")
  return { databaseFile: resolve(root, args[1]), expectedCount: Number(args[3]), omitUnconfirmed: args.includes("--omit-unconfirmed") }
}
export const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
export function reviewHtml(manifest) {
  const groups = new Map()
  for (const row of manifest.rows) { const key = row.autorId ?? "SIN_AUTORIA"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row) }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Revisión privada del lote de resultados Casku</title><style>body{font:15px/1.6 Arial,sans-serif;background:#fffef8;color:#0d2123;margin:30px auto;max-width:1300px;padding:0 20px}h1,h2{color:#004e58}.box{background:#eff6f5;padding:18px;border:1px solid #d0dfdd;border-radius:12px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:12px;text-align:left;border:1px solid #d0dfdd;vertical-align:top;overflow-wrap:anywhere}th{background:#eff6f5}.scroll{overflow:auto}.small{font-size:12px}li{margin-bottom:4px}</style></head><body><h1>${escape(EXPO_BATCH_LABEL)}</h1><p class="box"><strong>Revisión privada · NO PROGRAMADO · NO ENVIADO</strong><br>Horario propuesto: lunes23/11/2026,10:00 Santiago.<br>Preparado: ${escape(manifest.preparedAt)} · ${manifest.summary.total} evaluaciones · ${manifest.summary.direcciones} direcciones distintas.</p><p>No se aceptaron autorizaciones ni se modificaron fichas. Las filas bloqueadas requieren revisión; ninguna se ha descartado silenciosamente. Los correos compartidos por varios bebés se conservan como evaluaciones independientes.</p><h2>Pendientes del lote</h2><ul>${Object.entries(manifest.summary.motivos).map(([key,n])=>`<li><strong>${n}</strong> · ${escape(batchReasons[key])}</li>`).join("")}</ul>${[...groups.values()].map(rows=>`<h2>${escape(rows[0].profesional)} · ${rows.length} evaluaciones</h2><div class="scroll"><table><thead><tr><th>Bebé / referencia</th><th>Destinatario guardado</th><th>Apoderado registrado</th><th>Indicadores del sistema</th><th>Pendientes</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escape(row.bebe)}<br><span class="small">${escape(row.evaluacionId)} · revisión${row.revision}</span></td><td>${escape(row.correo || "Sin correo válido")}</td><td>${escape(row.apoderado || "Sin nombre real")}</td><td>${row.indicadores.map(i=>`${escape(i.nombre)}: ${escape(i.valor)} · ${escape(i.clasificacion)}`).join("<br>")}${row.indicadoresOmitidos?.length?`<p>Se omitirá del correo: ${row.indicadoresOmitidos.map(x=>escape(x.nombre)).join(", ")}</p>`:""}</td><td><ul>${row.motivos.map(code=>`<li>${escape(batchReasons[code])}</li>`).join("")}</ul>${row.motivos.length?"":"Pendiente de aprobación final del lote"}</td></tr>`).join("")}</tbody></table></div>`).join("")}<p class="small">Huella del documento: ${escape(manifest.digest)}. Este informe contiene datos personales; permanece en la carpeta privada excluida de Git y del despliegue.</p></body></html>`
}
export const EXPO_REVIEW_SQL = `SELECT e.*, CASE WHEN i.id IS NULL THEN e."correoPadre" ELSE i."contactoCorreo" END correo,
      jsonb_build_object('nombre',p.nombre,'fechaNacimiento',p."fechaNacimiento",'apoderadoId',p."apoderadoId",'revisionDatos',p."revisionDatos") paciente,
      CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object('id',u.id,'name',u.name,'active',u.active,'role',u.role,'mustChangePassword',u."mustChangePassword") END autor,
      CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id',a.id,'revision',a.revision,'pacienteId',a."pacienteId",'eventoId',a."eventoId",'apoderadoId',a."apoderadoId",'datos',a.datos,'versionTexto',a."versionTexto",'correoResultados',a."correoResultados") END autorizacion,
      c.declarante,c.referencia "referenciaAutorizacion",c.canal "canalAutorizacion",ev.nombre "eventoNombre",
      CASE WHEN i.id IS NULL THEN NULL ELSE jsonb_build_object('eventoId',i."eventoId",'apoderadoId',i."apoderadoId",'contactoNombre',i."contactoNombre",'revisionContacto',i."revisionContacto",'numero',i.numero,'cancelada',EXISTS(SELECT 1 FROM "CancelacionInscripcion" x WHERE x."inscripcionId"=i.id),'estadoFila',f.estado) END inscripcion,
      CASE WHEN rp.id IS NULL THEN NULL ELSE jsonb_build_object('estado',rp.estado) END publicacion,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('revision',rc.revision,'contexto',rc.contexto,'hashDatos',rc."hashDatos",'destinatario',rc.destinatario,'nombreApoderado',rc."nombreApoderado",'autorizacionId',rc."autorizacionId",'autorizacionRevision',rc."autorizacionRevision",'actorId',rc."actorId",'consentimientoVersion',rc."consentimientoVersion",'confirmarApoderado',rc."confirmarApoderado",'autorizarCorreo',rc."autorizarCorreo",'estado',rc.estado,'ledgerEstado',et.estado,'claveEnvio',rc."claveEnvio",'proveedorId',COALESCE(et."proveedorId",rc."proveedorId"))) FROM "ResultadoContacto" rc LEFT JOIN "EnvioTransaccional" et ON et.clave=rc."claveEnvio" WHERE rc."evaluacionId"=e.id),'[]'::jsonb) copias
      FROM "Evaluacion" e JOIN "Paciente" p ON p.id=e."pacienteId"
      LEFT JOIN "CuentaEquipo" u ON u.id=e."autorId"
      LEFT JOIN "ResultadoPublicado" rp ON rp."evaluacionId"=e.id
      LEFT JOIN "EntradaFila" f ON f.id=e."filaId" LEFT JOIN "Inscripcion" i ON i.id=f."inscripcionId"
      LEFT JOIN "Evento" ev ON ev.id=i."eventoId"
      LEFT JOIN "AutorizacionPrivacidad" a ON a.id=COALESCE(i."autorizacionId",e."autorizacionId")
      LEFT JOIN LATERAL (SELECT declarante,referencia,canal FROM "CambioPrivacidad" WHERE "autorizacionId"=a.id ORDER BY revision DESC LIMIT 1) c ON true
      WHERE e."createdAt">='2026-11-20T03:00:00'::timestamp AND e."createdAt"<'2026-11-23T03:00:00'::timestamp
      ORDER BY e."autorId",e."createdAt",e.id`
export async function main(args=process.argv.slice(2)) {
  const options=parseReviewArgs(args)
  const env=parse(await readFile(options.databaseFile))
  const connectionString=env.DATABASE_URL
  assert(connectionString && ["postgres:","postgresql:"].includes(new URL(connectionString).protocol),"Falta conexión explícita válida")
  const secrets=parse(await readFile(resolve(root,".env.brevo-activacion")))
  assert(secrets.CASKU_MAIL_SUPPRESSION_SECRET?.length>=32,"Falta clave para comprobar rebotes/quejas; no se omite este control")
  const db=new Client({connectionString,types:{getTypeParser:(oid,format)=>oid===1114&&format!=="binary"?value=>new Date(value.replace(" ","T")+"Z"):pgTypes.getTypeParser(oid,format)},connectionTimeoutMillis:15000,application_name:"casku_revision_resultados_solo_lectura"})
  let sources,suppressions
  try {
    await db.connect()
    await db.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    await db.query("SET LOCAL statement_timeout='20s'")
    const result=await db.query(EXPO_REVIEW_SQL)
    assert.equal(result.rows.length,options.expectedCount,"El total cambió: revisar el alcance antes de congelar el lote")
    sources=result.rows.map(row=>({...row,createdAt:row.createdAt.toISOString()}))
    const keys=sources.filter(row=>typeof row.correo==="string").map(row=>recipientKey(row.correo,secrets.CASKU_MAIL_SUPPRESSION_SECRET))
    suppressions=new Set((await db.query('SELECT clave FROM "SupresionCorreo" WHERE clave=ANY($1::text[])',[keys])).rows.map(x=>x.clave))
    await db.query("COMMIT")
  } finally { await db.end() }
  const rows=sources.map(row=>reviewExpoResult(row,typeof row.correo==="string"&&suppressions.has(recipientKey(row.correo,secrets.CASKU_MAIL_SUPPRESSION_SECRET)), { omitUnconfirmed: options.omitUnconfirmed }))
  const core={version:1,tipo:"REVISION_SIN_PROGRAMACION",evento:EXPO_BATCH_LABEL,horarioPropuestoUTC:EXPO_BATCH_TIME,zona:"America/Santiago",preparedAt:new Date().toISOString(),databaseFingerprint:createHash("sha256").update(connectionString).digest("hex"),politicaIndicadores:options.omitUnconfirmed?"OMITIR_INDICADORES_POR_CONFIRMAR":"BLOQUEAR_LIMITES_PENDIENTES",summary:summarizeExpoReview(rows),rows}
  const digest=createHash("sha256").update(JSON.stringify(core)).digest("hex"),manifest={...core,digest}
  const base=resolve(root,"test-results");await mkdir(base,{recursive:true});const actualBase=await realpath(base);assert.equal(actualBase,base,"No escribir sobre un enlace simbólico")
  const folder=resolve(base,"resultados-expo-20261123");await mkdir(folder,{recursive:true,mode:0o700});assert.equal(await realpath(folder),folder);await chmod(folder,0o700)
  const stem=resolve(folder,"revision-"+core.preparedAt.replace(/[:.]/g,"-")+"-"+digest.slice(0,12))
  for(const [ext,body] of [["json",JSON.stringify(manifest,null,2)],["html",reviewHtml(manifest)]]){const h=await open(stem+"."+ext,"wx",0o600);try{await h.writeFile(body);await h.sync()}finally{await h.close()}}
  console.log(JSON.stringify({estado:"PREPARADO_SIN_PROGRAMAR",horario:"lunes23/11/2026 10:00 America/Santiago",total:manifest.summary.total,bebes:manifest.summary.bebes,direcciones:manifest.summary.direcciones,bloqueados:manifest.summary.bloqueados,pendientesAprobacionFinal:manifest.summary.pendientesAprobacionFinal,casosConIndicadoresOmitidos:manifest.summary.casosConIndicadoresOmitidos,totalIndicadoresOmitidos:manifest.summary.totalIndicadoresOmitidos,motivos:manifest.summary.motivos,informe:stem+".html",huella:digest,modificacionesDB:0,envios:0}))
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(JSON.stringify({estado:"REVISION_DETENIDA",motivo:error instanceof assert.AssertionError?error.message:error.code||error.name,detalle:error.code==="42P01"?String(error.message).match(/(?:relation|table) "[A-Za-z_]+"/)?.[0]:undefined,envios:0}));process.exitCode=1})
