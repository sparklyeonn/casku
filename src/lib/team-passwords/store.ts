import { randomBytes,randomUUID } from "node:crypto"
import { Prisma,type CuentaEquipo } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { privateHash } from "@/lib/families/security"
import { normalizeEmail } from "@/lib/families/input"
import { hashPassword,verifyPassword } from "@/lib/passwords.mjs"
import { reserveAuthLimit } from "@/lib/team-auth/limits"
import { TEAM_SESSION_IDLE_MINUTES } from "@/lib/team-auth/policy"
import { TeamConflict,TeamForbidden } from "@/lib/team/store"
import { TeamInputError } from "@/lib/team/input"
import { recoveryTransport } from "./delivery"
import { passwordInput,RECOVERY_MESSAGE,INVALID_LINK } from "./input"
export function configuredOrigin() {
 try {const url=new URL(process.env.AUTH_URL||process.env.NEXTAUTH_URL||"");if(url.username||url.password||!(url.protocol==="https:"||(url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname))))return null;return url.origin}catch{return null}
}
export function samePasswordOrigin(request:Request) {const trusted=configuredOrigin();return !!trusted&&request.headers.get("origin")===trusted}
async function allowed(kind:string,account:string,limit:number,minutes:number,network?:string) {
 const global=await reserveAuthLimit(`password:${kind}:global`,60,1)
 if(!global)return false
 if(global.cantidad===1)await prisma.$executeRaw`DELETE FROM "LimiteSolicitud" WHERE "expiraAt"<CURRENT_TIMESTAMP AND clave IN (SELECT clave FROM "LimiteSolicitud" WHERE "expiraAt"<CURRENT_TIMESTAMP ORDER BY "expiraAt" LIMIT 100)`
 if(network&&!await reserveAuthLimit(`password:${kind}:network:${network}`,20,15))return false
 return !!await reserveAuthLimit(`password:${kind}:key:${account}`,limit,minutes)
}
export async function requestPasswordRecovery(raw:unknown,network:string) {
 const email=normalizeEmail(raw)
 if(!await allowed("request",email,3,15,network))return {message:RECOVERY_MESSAGE}
 const delivery=recoveryTransport()
 if(!delivery)return {message:RECOVERY_MESSAGE}
 const origin=configuredOrigin()
 if(!origin)return {message:RECOVERY_MESSAGE}
 const account=await prisma.cuentaEquipo.findUnique({where:{email}})
 if(!account?.active)return {message:RECOVERY_MESSAGE}
 const token=randomBytes(32).toString("base64url"),id=randomUUID(),tokenHash=privateHash(`team-recovery:${token}`)
 const prepared=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "CuentaEquipo" WHERE id=${account.id} FOR UPDATE`
  const current=await tx.cuentaEquipo.findUnique({where:{id:account.id}})
  if(!current?.active||current.version!==account.version||current.email!==email)return false
  await tx.$executeRaw`INSERT INTO "RecuperacionClave" (id,"cuentaId","tokenHash","versionCuenta","expiraAt") VALUES (${id}::uuid,${account.id},${tokenHash},${account.version},CURRENT_TIMESTAMP+interval '30 minutes')`
  return true
 })
 if(!prepared)return {message:RECOVERY_MESSAGE}
 const link=`${origin}/recuperar-clave#token=${token}`
 try {
  await delivery(email,link,id)
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "CuentaEquipo" WHERE id=${account.id} FOR UPDATE`
   const current=await tx.cuentaEquipo.findUnique({where:{id:account.id}}),challenge=await tx.recuperacionClave.findUniqueOrThrow({where:{id}})
   const newer=await tx.recuperacionClave.findFirst({where:{cuentaId:account.id,orden:{gt:challenge.orden},estado:{in:["ACTIVA","USADA"]}},select:{id:true}})
   const valid=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "RecuperacionClave" WHERE id=${id}::uuid AND "expiraAt">CURRENT_TIMESTAMP AND estado='PENDIENTE'`
   if(!current?.active||current.version!==account.version||current.email!==email||newer||!valid.length){await tx.recuperacionClave.update({where:{id},data:{estado:"ANULADA"}});return}
   await tx.recuperacionClave.updateMany({where:{cuentaId:account.id,estado:"ACTIVA"},data:{estado:"ANULADA"}})
   await tx.recuperacionClave.update({where:{id},data:{estado:"ACTIVA"}})
  })
 }catch {await prisma.recuperacionClave.updateMany({where:{id,estado:"PENDIENTE"},data:{estado:"FALLIDO"}})}
 await prisma.$executeRaw`DELETE FROM "RecuperacionClave" WHERE id IN (SELECT id FROM "RecuperacionClave" WHERE "expiraAt"<CURRENT_TIMESTAMP-interval '7 days' ORDER BY "expiraAt" LIMIT 100)`
 return {message:RECOVERY_MESSAGE}
}
async function finishChange(tx:Prisma.TransactionClient,account:CuentaEquipo,passwordHash:string,kind:string,resetId?:string) {
 const updated=await tx.cuentaEquipo.update({where:{id:account.id},data:{passwordHash,mustChangePassword:false,version:{increment:1}}})
 await tx.sesionEquipo.updateMany({where:{cuentaId:account.id,revocadaAt:null},data:{revocadaAt:new Date(),motivo:"CAMBIO_CLAVE"}})
 await tx.recuperacionClave.updateMany({where:{cuentaId:account.id,estado:{in:["PENDIENTE","ACTIVA"]},...(resetId?{id:{not:resetId}}:{})},data:{estado:"ANULADA"}})
 await tx.cambioCuentaEquipo.create({data:{cuentaId:account.id,actorId:account.id,accion:kind,anterior:{version:account.version,mustChangePassword:account.mustChangePassword},nueva:{version:updated.version,mustChangePassword:false,cambioContrasena:true}}})
 await tx.limiteSolicitud.deleteMany({where:{clave:privateHash(`team-auth:account:${account.email}`)}})
}
export async function changeOwnPassword(actor:{id:string;version:number;sessionId:string},raw:unknown) {
 const input=passwordInput(raw,true)
 if(!await allowed("own",actor.id,5,15))throw new TeamConflict("Has realizado varios intentos. Espera quince minutos antes de reintentar.")
 const account=await prisma.cuentaEquipo.findUnique({where:{id:actor.id}})
 if(!account?.active||account.version!==actor.version)throw new TeamForbidden()
 if(!await verifyPassword(input.actual!,account.passwordHash))throw new TeamInputError("La contraseña actual no es correcta.")
 if(await verifyPassword(input.nueva,account.passwordHash))throw new TeamInputError("Elige una contraseña diferente de la actual.")
 const passwordHash=await hashPassword(input.nueva)
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "CuentaEquipo" WHERE id=${actor.id} FOR UPDATE`
  const current=await tx.cuentaEquipo.findUnique({where:{id:actor.id}})
  if(!current?.active||current.version!==actor.version||current.passwordHash!==account.passwordHash)throw new TeamConflict("La cuenta cambió. Vuelve a iniciar sesión antes de cambiar la contraseña.")
  const valid=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "SesionEquipo" WHERE id=${actor.sessionId}::uuid AND "cuentaId"=${actor.id} AND version=${actor.version} AND "revocadaAt" IS NULL AND "expiraAt">CURRENT_TIMESTAMP AND "actividadAt">CURRENT_TIMESTAMP-${TEAM_SESSION_IDLE_MINUTES}*interval '1 minute'`
  if(!valid.length)throw new TeamForbidden()
  await finishChange(tx,current,passwordHash,"CAMBIAR_CLAVE_PROPIA")
 })
 return {message:"Contraseña actualizada. Inicia sesión nuevamente; las sesiones anteriores quedaron cerradas."}
}
export async function consumePasswordRecovery(raw:unknown,network:string) {
 const input=passwordInput(raw,false),tokenHash=privateHash(`team-recovery:${input.token}`)
 if(!await allowed("consume",tokenHash,5,15,network))throw new TeamInputError(INVALID_LINK)
 const challenge=await prisma.recuperacionClave.findUnique({where:{tokenHash},include:{cuenta:true}})
 if(!challenge||challenge.estado!=="ACTIVA"||!challenge.cuenta.active||challenge.versionCuenta!==challenge.cuenta.version)throw new TeamInputError(INVALID_LINK)
 const valid=await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "RecuperacionClave" WHERE id=${challenge.id}::uuid AND "expiraAt">CURRENT_TIMESTAMP`
 if(!valid.length)throw new TeamInputError(INVALID_LINK)
 if(await verifyPassword(input.nueva,challenge.cuenta.passwordHash))throw new TeamInputError("Elige una contraseña diferente de la actual.")
 const passwordHash=await hashPassword(input.nueva)
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "CuentaEquipo" WHERE id=${challenge.cuentaId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM "RecuperacionClave" WHERE id=${challenge.id}::uuid FOR UPDATE`
  const account=await tx.cuentaEquipo.findUnique({where:{id:challenge.cuentaId}})
  const current=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "RecuperacionClave" WHERE id=${challenge.id}::uuid AND estado='ACTIVA' AND "versionCuenta"=${account?.version??0} AND "expiraAt">CURRENT_TIMESTAMP`
  if(!account?.active||!current.length)throw new TeamInputError(INVALID_LINK)
  await finishChange(tx,account,passwordHash,"RECUPERAR_CLAVE",challenge.id)
  await tx.$executeRaw`UPDATE "RecuperacionClave" SET estado='USADA',"usadaAt"=CURRENT_TIMESTAMP WHERE id=${challenge.id}::uuid`
 })
 return {message:"Contraseña actualizada. Inicia sesión con tu nueva contraseña."}
}
