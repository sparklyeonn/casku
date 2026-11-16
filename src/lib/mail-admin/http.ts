import { TeamInputError } from "../team/input"
import { MailAdminError } from "./input"
export const mailAdminResponse=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}})
export function mailAdminFailure(error:unknown){if(error instanceof TeamInputError)return mailAdminResponse({error:error.message},400);if(error instanceof MailAdminError)return mailAdminResponse({error:error.message},error.status);return mailAdminResponse({error:"No pudimos completar la gestión del correo. Actualiza y revisa su estado."},503)}
