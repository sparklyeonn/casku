import { TeamInputError } from "../team/input.ts"
export const RECOVERY_MESSAGE="Si existe una cuenta activa y el envío está habilitado, recibirás un enlace para recuperar tu contraseña."
export const INVALID_LINK="El enlace no es válido o venció. Solicita uno nuevo."
export function passwordInput(value:unknown, own:boolean) {
 if(!value||typeof value!=="object"||Array.isArray(value))throw new TeamInputError("Revisa el formulario de contraseña.")
 const row=value as Record<string,unknown>
 if(typeof row.nueva!=="string"||row.nueva.length<12||row.nueva.length>128)throw new TeamInputError("La nueva contraseña debe tener entre 12 y 128 caracteres.")
 if(row.confirmacion!==row.nueva)throw new TeamInputError("Las contraseñas no coinciden.")
 if(own && (typeof row.actual!=="string"||!row.actual||row.actual.length>128))throw new TeamInputError("Ingresa tu contraseña actual.")
 if(!own&&(typeof row.token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(row.token)))throw new TeamInputError(INVALID_LINK)
 return {nueva:row.nueva,actual:own?String(row.actual):null,token:own?null:String(row.token)}
}
