import { createHash } from 'node:crypto'
import { contactEmail, contactSnapshotHash } from '../../src/lib/results/contact-policy.ts'
import { parseSnapshot } from '../../src/lib/results/snapshot.ts'
import { readComplementaryValues } from '../../src/lib/measurement-fields.ts'
import { PRIVACY_VERSION } from '../../src/lib/privacy/policy.ts'

export const FOLLOWUP_TIME = '2026-11-30T13:00:00.000Z'
export const FOLLOWUP_WHATSAPP = '+56 9 5001 3333'
export const reasons = {
 SIN_REFERENCIA_ANTERIOR:'No pertenece al lote anterior: confirmar origen Expo y revisar sus resultados',
 REFERENCIA_ANTERIOR_SIN_FICHA:'La evaluación del lote anterior no aparece en la consulta actual',
 CORREO_INVALIDO:'El destinatario actual no es válido',
 DESTINATARIO_CAMBIADO:'Cambió el correo desde el lote anterior; confirmar identidad y permiso',
 VERSION_O_DATOS_CAMBIADOS:'Cambió la revisión, el contenido o el contexto desde el lote anterior',
 RESULTADO_RETIRADO:'El resultado publicado está retirado',
 PUBLICACION_NO_COINCIDE:'La publicación actual corresponde a otra revisión o versión',
 DATOS_NO_AUTORIZADOS:'Permiso de datos ausente, retirado o no correspondiente a la ficha',
 AUTORIA_NO_VIGENTE:'La cuenta profesional responsable no está habilitada',
 ATENCION_NO_VIGENTE:'Inscripción cancelada o atención no finalizada',
 DESTINATARIO_SUPRIMIDO:'Destinatario suprimido por rebote permanente o queja',
 REBOTE_PERMANENTE:'El envío anterior tiene rebote permanente',
 REBOTE_TEMPORAL:'El envío anterior tiene rebote temporal pendiente de resolver',
 QUEJA:'El destinatario presentó una queja',
 ENVIO_ANTERIOR_NO_CONCILIADO:'La aceptación o entrega anterior no tiene evidencia concordante',
 SEGUIMIENTO_EXISTENTE:'Ya existe una orden o intento de seguimiento: revisar antes de crear otro',
 OTRA_COPIA_POR_REVISAR:'Hay otras copias o envíos inciertos que requieren revisión',
 SIN_INDICADORES_VALIDOS:'No hay indicadores originales reconocidos disponibles',
 AUTORIZACION_SEGUIMIENTO_PENDIENTE:'No hay autorización de seguimiento vigente y respaldada para este destinatario',
 CONTENIDO_CLINICO_PENDIENTE:'Contenido e indicaciones de esta comunicación no aprobados',
 REGLA_DESTINATARIOS_PENDIENTE:'Falta aprobar el criterio clínico de inclusión de esta etapa',
}
const canonicalId = v => String(v ?? '').replace(/^<|>$/g,'')
export function sourceSnapshot(row) {
 return parseSnapshot({nombreBebe:row.paciente.nombre,fechaNacimiento:row.paciente.fechaNacimiento.slice(0,10),profesional:row.kinesiologa,evento:row.eventoNombre,numero:row.inscripcion?.numero??null,fechaEvaluacion:row.createdAt,medidas:{ap:row.anteroposterior,bp:row.biparietal,di:row.diagonalIzq,dd:row.diagonalDer,...readComplementaryValues(row.medicionesComplementarias)},indiceCraneal:row.indiceCraneal,indiceAsimetria:row.indiceAsimetria,diagnostico:row.diagnostico,recomendacion:row.recomendacion})
}
export function reviewFollowup({row,previous,receipt,mail,suppression,recipientHash,orders=[],draftId}) {
 const blocks=[],approvals=['CONTENIDO_CLINICO_PENDIENTE','REGLA_DESTINATARIOS_PENDIENTE'],incidents=[]
 const add=code=>{if(!blocks.includes(code))blocks.push(code)}
 let email=null;try{email=contactEmail(row.correo)}catch{add('CORREO_INVALIDO')}
 if(!previous)add('SIN_REFERENCIA_ANTERIOR')
 else if(email!==previous.correo)add('DESTINATARIO_CAMBIADO')
 const guardian=(row.inscripcion?.contactoNombre??row.declarante??'').trim()
 if(guardian.length<3||/^Apoderado presente sin nombre/i.test(guardian))incidents.push('APODERADO_SIN_NOMBRE_REAL')
 let hash=null,context=null
 try{
  hash=contactSnapshotHash(sourceSnapshot(row))
  context=contactSnapshotHash({id:row.id,revision:row.revision,email,guardian,hashDatos:hash,contactRevision:row.inscripcion?.revisionContacto??null,patientRevision:row.paciente.revisionDatos,authorizationId:row.autorizacion?.id,authorizationRevision:row.autorizacion?.revision})
  if(previous&&(row.revision!==previous.revision||hash!==previous.hashDatos||context!==previous.contexto))add('VERSION_O_DATOS_CAMBIADOS')
 }catch{add('VERSION_O_DATOS_CAMBIADOS')}
 if(row.publicacion?.estado==='RETIRADO')add('RESULTADO_RETIRADO')
 if(row.publicacion&&(row.publicacion.revision!==row.revision||row.publicacion.versionActual!==1))add('PUBLICACION_NO_COINCIDE')
 const p=row.autorizacion
 const dataAllowed=Boolean(p?.datos&&p.versionTexto===PRIVACY_VERSION&&p.pacienteId===row.pacienteId&&p.eventoId===(row.inscripcion?.eventoId??null)&&p.apoderadoId===(row.inscripcion?.apoderadoId??row.paciente.apoderadoId??null))
 if(!dataAllowed)add('DATOS_NO_AUTORIZADOS')
 const evidence=row.evidenciaPrivacidad
 const followupAllowed=Boolean(dataAllowed&&p.correoResultados&&p.seguimiento&&evidence?.revision===p.revision&&evidence.nueva?.datos===true&&evidence.nueva?.correoResultados===true&&evidence.nueva?.seguimiento===true&&email===previous?.correo&&context===previous?.contexto&&!incidents.length)
 if(!followupAllowed)approvals.unshift('AUTORIZACION_SEGUIMIENTO_PENDIENTE')
 if(!row.autor||row.autor.id!==row.autorId||row.autor.role!=='KINESIOLOGO'||!row.autor.active||row.autor.mustChangePassword)add('AUTORIA_NO_VIGENTE')
 if(row.inscripcion&&(row.inscripcion.cancelada||row.inscripcion.estadoFila!=='ATENDIDO'))add('ATENCION_NO_VIGENTE')
 if(suppression)add('DESTINATARIO_SUPRIMIDO')
 if(mail?.entrega==='REBOTE')add('REBOTE_PERMANENTE')
 if(mail?.entrega==='REBOTE_TEMPORAL')add('REBOTE_TEMPORAL')
 if(mail?.entrega==='QUEJA')add('QUEJA')
 if(!previous||!receipt||receipt.status!=='ACCEPTED'||receipt.key!==previous.key||receipt.revision!==previous.revision||receipt.hashDatos&&receipt.hashDatos!==previous.hashDatos||!mail||mail.clave!==previous.key||mail.finalidad!=='RESULTADO'||mail.estado!=='ACEPTADO'||!mail.proveedorId||canonicalId(mail.proveedorId)!==canonicalId(receipt.providerId)||mail.destinatarioClave!==recipientHash||!['ENTREGADO','REBOTE','REBOTE_TEMPORAL','QUEJA'].includes(mail.entrega))add('ENVIO_ANTERIOR_NO_CONCILIADO')
 if(orders.length)add('SEGUIMIENTO_EXISTENTE')
 if(row.copias.some(c=>['ENVIANDO','REVISION','REINTENTABLE'].includes(c.ledgerEstado??c.estado)||((c.proveedorId||c.estado==='ACEPTADO')&&canonicalId(c.proveedorId)!==canonicalId(mail?.proveedorId))))add('OTRA_COPIA_POR_REVISAR')
 const original=previous?.datos.indicadores??[],names=previous?.datos.protocolo==='casku-pdf-borrador-v1'?['CI','CVA']:['CI','CVA','CVAI','DPOE']
 const omitted=original.filter(i=>/confirmar|pendiente/i.test(i.clasificacion)).map(i=>i.nombre)
 const indicators=original.filter(i=>names.includes(i.nombre)&&!/confirmar|pendiente/i.test(i.clasificacion)).map(i=>({...i}))
 if(!indicators.length||indicators.length!==original.length-omitted.length)add('SIN_INDICADORES_VALIDOS')
 return {candidateId:`revision-seguimiento-20261130-${draftId}-${createHash('sha256').update(row.id+':'+row.revision).digest('hex')}`,evaluacionId:row.id,pacienteId:row.pacienteId,bebe:row.paciente.nombre,correo:email,fechaEvaluacion:row.createdAt,revision:row.revision,protocolo:previous?.datos.protocolo??null,profesional:row.kinesiologa,indicadores:indicators,indicadoresOmitidos:[...new Set([...(previous?.indicadoresOmitidos??[]),...omitted])],hashDatosActual:hash,contextoActual:context,anterior:previous?{revision:previous.revision,clave:previous.key,estado:mail?.estado??null,entrega:mail?.entrega??null}:null,permiso:{datosVigentes:dataAllowed,seguimientoRegistrado:p?.seguimiento===true,seguimientoRespaldado:followupAllowed,revision:p?.revision??null,autorizacionAnteriorNoTransferida:true},bloqueos:blocks,aprobacionesPendientes:approvals,incidencias:incidents,tecnicamenteDisponible:blocks.length===0,elegibleParaEnvio:false,estado:blocks.length?'BLOQUEADO':'PENDIENTE_APROBACIONES'}
}
export function summarizeFollowup(rows) {
 if(new Set(rows.map(r=>r.evaluacionId)).size!==rows.length)throw Error('DUPLICATE_EVALUATIONS')
 const pending=rows.filter(r=>r.tecnicamenteDisponible),counts={},approvals={}
 for(const r of rows){for(const x of r.bloqueos)counts[x]=(counts[x]??0)+1;for(const x of r.aprobacionesPendientes)approvals[x]=(approvals[x]??0)+1}
 return {evaluaciones:rows.length,bebes:new Set(rows.map(r=>r.pacienteId)).size,destinatariosValidos:new Set(rows.map(r=>r.correo).filter(Boolean)).size,tecnicamenteDisponibles:pending.length,destinatariosTecnicos:new Set(pending.map(r=>r.correo)).size,bloqueados:rows.length-pending.length,elegiblesParaEnvio:0,destinatariosAprobados:0,bloqueos:counts,aprobacionesPendientes:approvals,autorizacionesSeguimientoRespaldadas:rows.filter(r=>r.permiso?.seguimientoRespaldado).length,casosConIndicadoresOmitidos:rows.filter(r=>r.indicadoresOmitidos.length).length,indicadoresOmitidos:rows.reduce((n,r)=>n+r.indicadoresOmitidos.length,0),porDia:Object.fromEntries(['2026-11-20','2026-11-21','2026-11-22'].map(day=>[day,rows.filter(r=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.fechaEvaluacion))===day).length]))}
}
