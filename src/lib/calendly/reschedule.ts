import type { Prisma } from "@prisma/client"
import { trace } from "@/lib/privacy/store"
import type { CurrentInvitee } from "./webhook-provider"
// Provider references are checked in both directions before these rows reach this transaction.
export async function rescheduleWaiting(tx:Prisma.TransactionClient,rows:CurrentInvitee[],mapping:Map<string,string>) {
 for(const old of rows){
  if(old.estado!=="CANCELADA"||!old.newUri)continue
  const next=rows.find(row=>row.uri===old.newUri&&row.oldUri===old.uri&&row.estado==="ACTIVA")
  if(!next||mapping.get(old.fecha)!==mapping.get(next.fecha))continue
  const registration=await tx.inscripcion.findUnique({where:{calendlyInvitadoId:old.invitadoId},include:{cancelacion:true,fila:{include:{evaluacion:{select:{id:true}}}}}})
  if(!registration||registration.cancelacion||registration.fila?.evaluacion||registration.fila&&!["EN_ESPERA","AUSENTE"].includes(registration.fila.estado))continue
  const oldHold=await tx.reservaCupoCalendly.findUnique({where:{invitadoId:old.invitadoId}}),nextHold=await tx.reservaCupoCalendly.findUnique({where:{invitadoId:next.invitadoId}})
  if(!oldHold||!nextHold||oldHold.estado!=="CANCELADA"||nextHold.estado!=="ACTIVA"||oldHold.eventoId!==registration.eventoId||nextHold.eventoId!==registration.eventoId||nextHold.inscripcionId&&nextHold.inscripcionId!==registration.id)throw new Error("VINCULACION_DISTINTA")
  const anterior={reservaId:registration.calendlyReservaId,invitadoId:registration.calendlyInvitadoId,inicio:registration.citaInicio?.toISOString()??null,fin:registration.citaFin?.toISOString()??null}
  const nueva={reservaId:next.reservaId,invitadoId:next.invitadoId,inicio:next.inicio.toISOString(),fin:next.fin.toISOString()}
  await tx.reservaCupoCalendly.update({where:{invitadoId:old.invitadoId},data:{inscripcionId:null}})
  await tx.inscripcion.update({where:{id:registration.id},data:{calendlyReservaId:next.reservaId,calendlyInvitadoId:next.invitadoId,citaInicio:next.inicio,citaFin:next.fin,citaConfirmadaAt:new Date(),revisionCalendlyPendiente:false}})
  await tx.reservaCupoCalendly.update({where:{invitadoId:next.invitadoId},data:{inscripcionId:registration.id}})
  await tx.cambioCitaCalendly.create({data:{inscripcionId:registration.id,invitadoNuevo:next.invitadoId,anterior,nueva}})
  await trace(tx,{id:"calendly:webhook",role:"SISTEMA_CALENDLY"},"REPROGRAMAR_CITA_EN_ESPERA","INSCRIPCION",registration.id)
 }
}
