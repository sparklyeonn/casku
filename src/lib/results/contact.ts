import { prisma } from "@/lib/prisma"
import { takeLimit } from "@/lib/families/security"
import { mailConfig } from "../mail/brevo.ts"
import { deliverOnce } from "../mail/delivery-store.ts"
import { createResultContactService } from "./contact-store.ts"
export const resultContactService=createResultContactService(prisma,{
  enabled:()=>process.env.CASKU_CLINICAL_MAIL_ENABLED==="1",
  config:()=>mailConfig("RESULTADO"),
  deliver:(message,key,config)=>deliverOnce(prisma,message,key,"RESULTADO",config),
})
export async function limitResultContact(actorId:string,mutation:boolean) {
  await prisma.$transaction(tx=>takeLimit(tx,`result-contact:${mutation?"post":"get"}:${actorId}`,mutation?12:60,mutation?600000:60000))
}
