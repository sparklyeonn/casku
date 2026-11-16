export const MAIL_TYPES=["CONFIRMACION","CLINICO","RESULTADO_LEGADO","RECUPERACION","TRANSACCIONAL"] as const
export const MAIL_ACTIONS=["REVISAR","CERRAR","REABRIR","REINTENTAR_CONFIRMACION"] as const
export const MAIL_REASONS={REVISION_PROVEEDOR:"Revisión en el proveedor",INCIDENCIA_CONFIRMADA:"Incidencia confirmada",SEGUIMIENTO_REALIZADO:"Seguimiento realizado",ERROR_TEMPORAL:"Error temporal de envío",ACTUALIZACION_OPERATIVA:"Actualización operativa"} as const
export class MailAdminError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status}}
export function mailId(value:unknown){if(typeof value!=="string"||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(value))throw new MailAdminError("Referencia inválida.");return value.toLowerCase()}
export function mailType(value:unknown){if(!MAIL_TYPES.includes(value as never))throw new MailAdminError("Tipo de correo inválido.");return value as typeof MAIL_TYPES[number]}
export function pageNumber(value:unknown){if(value===null||value===undefined)return 1;if(typeof value!=="string"||!/^\d{1,5}$/.test(value)||Number(value)<1)throw new MailAdminError("Página inválida.");return Number(value)}
export function mailFilters(params:URLSearchParams){
 const type=params.get("tipo"),event=params.get("eventoId"),state=params.get("estado")||"TODOS",tracking=params.get("seguimiento")||"TODOS"
 if(!["TODOS","PENDIENTES","ACEPTADOS","ENTREGADOS","FALLOS","REBOTES","QUEJAS","REVISION"].includes(state)||!["TODOS","PENDIENTE","EN_REVISION","CERRADO","NUEVA_INCIDENCIA"].includes(tracking))throw new MailAdminError("Filtro inválido.")
 return {tipo:type?mailType(type):null,eventoId:event?mailId(event):null,estado:state,seguimiento:tracking,pagina:pageNumber(params.get("pagina"))}
}
export function mailAction(value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value))throw new MailAdminError("Revisa la acción.")
 const row=value as Record<string,unknown>
 if(!MAIL_ACTIONS.includes(row.accion as never)||typeof row.motivo!=="string"||!Object.hasOwn(MAIL_REASONS,row.motivo)||!Number.isSafeInteger(row.revision)||Number(row.revision)<0||typeof row.huella!=="string"||!/^[a-f0-9]{32}$/.test(row.huella))throw new MailAdminError("Actualiza el correo y selecciona una acción y motivo válidos.")
 if(["CERRAR","REINTENTAR_CONFIRMACION"].includes(String(row.accion))&&row.confirmado!==true)throw new MailAdminError("Confirma la acción antes de continuar.")
 return {id:mailId(row.id),accion:row.accion as typeof MAIL_ACTIONS[number],motivo:row.motivo,revision:Number(row.revision),huella:row.huella}
}
export type MailFilters=ReturnType<typeof mailFilters>
export type MailAction=ReturnType<typeof mailAction>
