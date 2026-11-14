import assert from "node:assert/strict"
import {createHmac,randomUUID} from "node:crypto"
export async function brevoWebhookChecks({request,db,secret,suppressionSecret}) {
 const path="/api/webhooks/brevo",messageId=`http-${randomUUID()}@brevo.test`,key=`hook-${randomUUID()}`,email="webhook-http@example.com"
 const recipient=createHmac("sha256",suppressionSecret).update(`mail:${email}`).digest("hex")
 const headers={"content-type":"application/json",authorization:`Bearer ${secret}`}
 const event={event:"delivered",id:123,email,"message-id":messageId,ts_event:1794614400,subject:"No conservar",reason:"No conservar"}
 const post=(data,other={})=>request(path,{method:"POST",headers:{...headers,...other},body:JSON.stringify(data)})
 assert.equal((await request(path)).status,405)
 assert.equal((await post(event,{authorization:""})).status,401)
 assert.equal((await request(`${path}?token=${secret}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(event)})).status,401)
 assert.equal((await post(event,{authorization:`Bearer ${"x".repeat(secret.length)}`})).status,401)
 assert.equal((await post(event,{"content-type":"text/plain"})).status,415)
 assert.equal((await post([event,null])).status,400)
 assert.equal((await post({...event,ts_event:"fecha"})).status,400)
 assert.equal((await post({event:"opened"})).status,200)
 assert.equal((await db.query(`SELECT count(*)::int n FROM "NotificacionCorreo" WHERE "mensajeId"=$1`,[messageId])).rows[0].n,0)
 // El evento entra antes de registrar la aceptación; no suprime correos ajenos.
 assert.equal((await post({...event,event:"spam"})).status,200)
 assert.equal((await db.query(`SELECT count(*)::int n FROM "SupresionCorreo" WHERE clave=$1`,[recipient])).rows[0].n,0)
 await db.query(`INSERT INTO "EnvioTransaccional" (clave,finalidad,estado,"proveedorId","destinatarioClave") VALUES ($1,'CONFIRMACION','ACEPTADO',$2,$3)`,[key,`<${messageId}>`,recipient])
 const duplicates=await Promise.all([post({...event,event:"spam"}),post({...event,event:"spam","message-id":`<${messageId}>`})])
 assert(duplicates.every(response=>response.status===200))
 assert.equal((await db.query(`SELECT entrega,estado FROM "EnvioTransaccional" WHERE clave=$1`,[key])).rows[0].entrega,"QUEJA")
 assert.equal((await db.query(`SELECT count(*)::int n FROM "NotificacionCorreo" WHERE "mensajeId"=$1`,[messageId])).rows[0].n,1)
 assert.equal((await post([event,{...event,event:"soft_bounce"},{...event,event:"hard_bounce"}])).status,200)
 assert.equal((await db.query(`SELECT entrega,estado FROM "EnvioTransaccional" WHERE clave=$1`,[key])).rows[0].entrega,"QUEJA")
 assert.equal((await db.query(`SELECT motivo FROM "SupresionCorreo" WHERE clave=$1`,[recipient])).rows[0].motivo,"QUEJA")
 const privateRows=(await db.query(`SELECT to_jsonb(n) data FROM "NotificacionCorreo" n WHERE "mensajeId"=$1`,[messageId])).rows
 assert(!JSON.stringify(privateRows).includes(email));assert(!JSON.stringify(privateRows).includes("No conservar"))
 console.log("OK webhook HTTP: Bearer, rechazo de tokens en URL, validación atómica, eventos tempranos/repetidos/desordenados y privacidad; envíos reales desactivados.")
}
