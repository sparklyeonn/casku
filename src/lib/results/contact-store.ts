import type { PrismaClient, Prisma, ResultadoContacto } from "@prisma/client"
import type { BrevoConfig, MailMessage } from "../mail/brevo.ts"
import { PRIVACY_VERSION } from "../privacy/policy.ts"
import { readComplementaryValues } from "../measurement-fields.ts"
import { parseSnapshot } from "./snapshot.ts"
import { publicationProblem } from "./protocol.ts"
import { contactMessage } from "./contact-message.ts"
import { CONTACT_CONSENT_VERSION,CONTACT_CONSENT_TEXT,ContactConflict,ContactUnavailable,contactEmail,contactInput,contactSnapshotHash,contactDeliveryDecision } from "./contact-policy.ts"
type Actor={id:string;version:number}
type Dependencies={enabled:()=>boolean;config:()=>BrevoConfig;deliver:(message:MailMessage,key:string,config:BrevoConfig)=>Promise<string>}
const include={paciente:true,fila:{include:{inscripcion:{include:{cancelacion:true}}}},publicacion:true} satisfies Prisma.EvaluacionInclude
type SourceRow=Prisma.EvaluacionGetPayload<{include:typeof include}>
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
export function createResultContactService(db:PrismaClient,deps:Dependencies) {
  async function audit(tx:Prisma.TransactionClient,actor:Actor,action:string,id:string) {
    await tx.accesoPrivado.create({data:{actorId:actor.id,perfilActor:"KINESIOLOGO",accion:action,recurso:"RESULTADO_CONTACTO",recursoId:id}})
  }
  async function source(tx:Prisma.TransactionClient,actor:Actor,id:string,locked=false) {
    if(locked){const owned=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Evaluacion" WHERE id=${id} AND "autorId"=${actor.id} FOR UPDATE`;if(!owned.length)throw new ContactUnavailable("Resultado no disponible para tu cuenta.")}
    let row:SourceRow|null=await tx.evaluacion.findFirst({where:{id,autorId:actor.id},include})
    if(!row)throw new ContactUnavailable("Resultado no disponible para tu cuenta.")
    if(locked){
      await tx.$queryRaw`SELECT id FROM "CuentaEquipo" WHERE id=${actor.id} FOR SHARE`
      await tx.$queryRaw`SELECT id FROM "Paciente" WHERE id=${row.pacienteId} FOR UPDATE`
      if(row.fila)await tx.$queryRaw`SELECT id FROM "Inscripcion" WHERE id=${row.fila.inscripcion.id}::uuid FOR UPDATE`
      row=await tx.evaluacion.findFirst({where:{id,autorId:actor.id},include})
      if(!row)throw new ContactUnavailable("Resultado no disponible para tu cuenta.")
    }
    const account=await tx.cuentaEquipo.findUnique({where:{id:actor.id}})
    if(!account?.active||account.role!=="KINESIOLOGO"||account.version!==actor.version||account.mustChangePassword)throw new ContactUnavailable("Tu acceso cambió. Vuelve a ingresar.")
    const inscription=row.fila?.inscripcion
    const authorizationId=inscription?.autorizacionId??row.autorizacionId
    if(locked&&authorizationId)await tx.$queryRaw`SELECT id FROM "AutorizacionPrivacidad" WHERE id=${authorizationId}::uuid FOR UPDATE`
    const permission=authorizationId?await tx.autorizacionPrivacidad.findUnique({where:{id:authorizationId}}):null
    const declaration=permission?await tx.cambioPrivacidad.findFirst({where:{autorizacionId:permission.id},orderBy:{revision:"desc"},select:{declarante:true}}):null
    const guardian=(inscription?.contactoNombre??declaration?.declarante??"").trim()
    let email:string|null=null
    try{email=contactEmail(inscription?inscription.contactoCorreo:row.correoPadre)}catch{/* A missing saved contact never accepts a replacement from the request. */}
    const snapshot=parseSnapshot({nombreBebe:row.paciente.nombre,fechaNacimiento:row.paciente.fechaNacimiento.toISOString().slice(0,10),profesional:row.kinesiologa,evento:inscription?await tx.evento.findUnique({where:{id:inscription.eventoId},select:{nombre:true}}).then(event=>event?.nombre??null):null,numero:inscription?.numero??null,fechaEvaluacion:row.createdAt.toISOString(),medidas:{ap:row.anteroposterior,bp:row.biparietal,di:row.diagonalIzq,dd:row.diagonalDer,...readComplementaryValues(row.medicionesComplementarias)},indiceCraneal:row.indiceCraneal,indiceAsimetria:row.indiceAsimetria,diagnostico:row.diagnostico,recomendacion:row.recomendacion})
    let problem:string|null=null
    if(row.publicacion)problem="Ya existe una publicación familiar, vigente o retirada. Este flujo separado no permite otro envío."
    else if(row.paciente.apoderadoId||inscription?.apoderadoId)problem="El bebé ya está vinculado a una cuenta. Revisa la publicación familiar."
    else if(inscription&&(row.fila?.estado!=="ATENDIDO"||inscription.cancelacion||inscription.pacienteId!==row.pacienteId))problem="La atención o inscripción no está vigente para enviar esta copia."
    else if(!permission?.datos||permission.versionTexto!==PRIVACY_VERSION||permission.pacienteId!==row.pacienteId||permission.apoderadoId!==null||permission.eventoId!==(inscription?.eventoId??null))problem="La autorización de datos está pendiente, cambió o fue retirada. No se enviará el resultado."
    else if(!email)problem="El registro no tiene un correo de contacto válido. Debe corregirse en su registro antes de enviar."
    else if(guardian.length<3||guardian.startsWith("Apoderado presente sin nombre"))problem="Falta el nombre del apoderado en el registro de contacto o en la autorización guardada."
    else problem=publicationProblem(snapshot)
    const hashDatos=contactSnapshotHash(snapshot)
    const contexto=contactSnapshotHash({id:row.id,revision:row.revision,email,guardian,hashDatos,contactRevision:inscription?.revisionContacto??null,patientRevision:row.paciente.revisionDatos,authorizationId:permission?.id,authorizationRevision:permission?.revision})
    return {row,snapshot,email,guardian,permission,problem,contexto,hashDatos}
  }
  async function ledger(tx:Prisma.TransactionClient,key:string){return tx.envioTransaccional.findUnique({where:{clave:key}})}
  async function view(tx:Prisma.TransactionClient,row:ResultadoContacto) {
    const delivery=await ledger(tx,row.claveEnvio),decision=contactDeliveryDecision(row.estado,delivery,Date.now(),row.updatedAt)
    return {id:row.id,revision:row.revision,contexto:row.contexto,protocolo:row.protocolo,destinatario:row.destinatario,nombreApoderado:row.nombreApoderado,datos:row.datos,motivo:row.motivo,estado:decision.state,proveedorId:delivery?.proveedorId??row.proveedorId,createdAt:row.createdAt.toISOString(),reintentarDesde:delivery?.disponibleAt?.toISOString()??null,puedeReintentar:decision.send&&(!delivery||delivery.estado==="REINTENTABLE")}
  }
  async function read(actor:Actor,id:string) {
    return db.$transaction(async tx=>{
      const current=await source(tx,actor,id),rows=await tx.resultadoContacto.findMany({where:{evaluacionId:id},orderBy:[{revision:"desc"},{createdAt:"desc"},{id:"desc"}],take:10})
      await audit(tx,actor,"CONSULTAR_CONTACTO",id)
      return {revision:current.row.revision,destinatario:current.email,nombreApoderado:current.guardian,contexto:current.contexto,datos:current.snapshot,versionConsentimiento:CONTACT_CONSENT_VERSION,textos:CONTACT_CONSENT_TEXT,habilitado:!current.problem&&deps.enabled(),motivoBloqueo:current.problem??(!deps.enabled()?"El envío clínico está desactivado. Puedes seguir editando el borrador.":null),requiereMotivo:rows.some(row=>row.contexto!==current.contexto),envios:await Promise.all(rows.map(row=>view(tx,row)))}
    },{isolationLevel:"RepeatableRead",timeout:15000})
  }
  async function submit(actor:Actor,id:string,raw:Record<string,unknown>) {
    const input=contactInput(raw)
    const prepared=await db.$transaction(async tx=>{
      const current=await source(tx,actor,id,true)
      if(current.problem)throw new ContactConflict(current.problem)
      if(input.revision!==current.row.revision||input.contexto!==current.contexto)throw new ContactConflict("La revisión, el contacto o su autorización cambiaron. Consulta de nuevo y solicita una nueva confirmación.")
      if(input.correoRepetido!==current.email)throw new ContactConflict("El correo repetido debe coincidir exactamente con el contacto guardado.")
      const requestHash=contactSnapshotHash({actor:actor.id,evaluacionId:id,...input,id:undefined})
      const byId=await tx.resultadoContacto.findUnique({where:{id:input.id}})
      const existing=byId??await tx.resultadoContacto.findUnique({where:{evaluacionId_revision_contexto:{evaluacionId:id,revision:input.revision,contexto:current.contexto}}})
      if(existing){if(existing.evaluacionId!==id||existing.actorId!==actor.id||existing.solicitudHash!==requestHash)throw new ContactConflict("Esta revisión ya tiene una copia de contacto. Consulta su estado; no se generará otro envío.");return {id:existing.id,nueva:false}}
      if(!deps.enabled())throw new ContactConflict("El envío clínico está desactivado.")
      // Validate configuration before persisting an intention; this does not send mail.
      deps.config()
      const previous=await tx.resultadoContacto.findFirst({where:{evaluacionId:id},orderBy:[{revision:"desc"},{createdAt:"desc"},{id:"desc"}]})
      if(previous&&!input.motivo)throw new ContactConflict("Registra el motivo de la nueva revisión enviada. La copia anterior se conservará.")
      const created=await tx.resultadoContacto.create({data:{id:input.id,evaluacionId:id,revision:input.revision,protocolo:current.snapshot.medidas.protocolo??"legacy-4",destinatario:current.email!,nombreApoderado:current.guardian,datos:json(current.snapshot),hashDatos:current.hashDatos,mensaje:json(contactMessage(current.snapshot,current.email!)),consentimientoVersion:CONTACT_CONSENT_VERSION,consentimientoTextos:json(CONTACT_CONSENT_TEXT),confirmarApoderado:true,autorizarCorreo:true,canal:"PRESENCIAL",actorId:actor.id,autorizacionId:current.permission!.id,autorizacionRevision:current.permission!.revision,contexto:current.contexto,solicitudHash:requestHash,claveEnvio:`result-contact-${input.id}`,motivo:input.motivo,anteriorId:previous?.id??null}})
      await audit(tx,actor,"AUTORIZAR_ENVIO_CONTACTO",created.id)
      return {id:created.id,nueva:true}
    },{timeout:15000})
    const claim=await db.$transaction(async tx=>{
      const current=await source(tx,actor,id,true)
      const record=await tx.resultadoContacto.findUniqueOrThrow({where:{id:prepared.id}})
      if(current.problem||record.revision!==current.row.revision||record.contexto!==current.contexto){
        await audit(tx,actor,"BLOQUEAR_ENVIO_CONTACTO",record.id)
        return {blocked:current.problem??"La revisión, el contacto o la autorización cambiaron antes del envío. No se envió esta solicitud."}
      }
      const delivery=await ledger(tx,record.claveEnvio),decision=contactDeliveryDecision(record.estado,delivery,Date.now(),record.updatedAt)
      if(!decision.send){
        if(decision.state!==record.estado)await tx.resultadoContacto.update({where:{id:record.id},data:{estado:decision.state,...(decision.providerId?{proveedorId:decision.providerId}:{})}})
        return {envio:await view(tx,await tx.resultadoContacto.findUniqueOrThrow({where:{id:record.id}}))}
      }
      if(!deps.enabled())return {blocked:"El envío clínico está desactivado."}
      const config=deps.config()
      await tx.resultadoContacto.update({where:{id:record.id},data:{estado:"ENVIANDO",ultimoError:null}})
      await audit(tx,actor,"INICIAR_ENVIO_CONTACTO",record.id)
      return {record,config}
    },{timeout:15000})
    if("blocked" in claim)throw new ContactConflict(claim.blocked)
    if(claim.envio)return {envio:claim.envio,nueva:prepared.nueva}
    if(!claim.record||!claim.config)throw new ContactConflict("Consulta el estado guardado antes de continuar.")
    // Release the source transaction before the independent durable delivery ledger.
    // This works with a single database connection; no pool slot is held across HTTP.
    let providerId:string|null=null
    try{providerId=await deps.deliver(claim.record.mensaje as unknown as MailMessage,claim.record.claveEnvio,claim.config)}catch{/* The durable ledger, not a transport exception, determines whether another POST is safe. */}
    const outcome=await db.$transaction(async tx=>{
      const record=await tx.resultadoContacto.findUniqueOrThrow({where:{id:prepared.id}})
      const latest=await ledger(tx,record.claveEnvio)
      const accepted=latest?.estado==="ACEPTADO"&&latest.proveedorId?latest.proveedorId:providerId??(record.estado==="ACEPTADO"?record.proveedorId:null)
      const state=accepted?"ACEPTADO":latest?.estado==="REINTENTABLE"?"REINTENTABLE":latest?.estado==="RECHAZADO"?"RECHAZADO":!latest||(latest.estado==="PENDIENTE"&&latest.intentos===0)?"PENDIENTE":"REVISION"
      await tx.resultadoContacto.update({where:{id:record.id},data:{estado:state,proveedorId:accepted,ultimoError:state==="REINTENTABLE"?"RECHAZO_CONFIRMADO_REINTENTABLE":state==="ACEPTADO"?null:state==="PENDIENTE"?"SIN_INTENTO_PERSISTIDO":"ACEPTACION_NO_CONFIRMADA"}})
      await audit(tx,actor,"REGISTRAR_ESTADO_ENVIO_CONTACTO",record.id)
      return {envio:await view(tx,await tx.resultadoContacto.findUniqueOrThrow({where:{id:record.id}}))}
    },{timeout:15000})
    return {...outcome,nueva:prepared.nueva}
  }
  return {read,submit}
}

export type ResultContactReview=Awaited<ReturnType<ReturnType<typeof createResultContactService>["read"]>>
