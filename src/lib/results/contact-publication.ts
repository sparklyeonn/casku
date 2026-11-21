import type { Prisma } from "@prisma/client"
import { contactSnapshotHash } from "./contact-policy.ts"
import type { ResultSnapshot } from "./snapshot.ts"
export type PreviousContactMail={estado:"ACEPTADO";proveedorId:string;aceptadoAt:Date}|{estado:"ENVIANDO"|"REVISION"}|null
// Called under the evaluation lock. Publishing in an account must not send an
// identical clinical copy again after a contact delivery (including ledger recovery).
export async function previousContactMail(tx:Prisma.TransactionClient,evaluationId:string,revision:number,email:string,snapshot:ResultSnapshot,now=new Date()):Promise<PreviousContactMail> {
 const rows=await tx.resultadoContacto.findMany({where:{evaluacionId:evaluationId,revision,destinatario:email.trim().toLowerCase(),hashDatos:contactSnapshotHash(snapshot)},orderBy:{createdAt:"desc"}})
 let inFlight=false,uncertain=false
 for(const row of rows){
  const delivery=await tx.envioTransaccional.findUnique({where:{clave:row.claveEnvio}})
  if(delivery?.estado==="ACEPTADO"&&delivery.proveedorId)return {estado:"ACEPTADO",proveedorId:delivery.proveedorId,aceptadoAt:delivery.aceptadoAt??row.updatedAt}
  if(row.estado==="ACEPTADO"&&row.proveedorId)return {estado:"ACEPTADO",proveedorId:row.proveedorId,aceptadoAt:row.updatedAt}
  if(delivery?.estado==="ENVIANDO"&&delivery.bloqueoHasta&&delivery.bloqueoHasta>now)inFlight=true
  else if(row.estado==="ENVIANDO"&&!delivery&&row.updatedAt.getTime()+120000>now.getTime())inFlight=true
  else if(delivery?.estado==="REVISION"||delivery?.estado==="ENVIANDO"||row.estado==="REVISION")uncertain=true
 }
 return inFlight?{estado:"ENVIANDO"}:uncertain?{estado:"REVISION"}:null
}
