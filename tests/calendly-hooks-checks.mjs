import { browserCalendlyHooks } from "./browser-calendly-hooks.mjs"
import assert from "node:assert/strict"
import { randomUUID, createHmac } from "node:crypto"
import { bookingFixtures, calendlyFixtureState } from "./calendly-link-checks.mjs"
import { paperConsent } from "./privacy-fixtures.mjs"
export async function calendlyHooksChecks({db,client,signIn,password,accounts,admin,post,mails,secret,secondaryBase,base,adminAccount}) {
 const reception=client(),kine=client(),kine2=client(),anonymous=client(),other=client(secondaryBase)
 for(const [who,account] of [[reception,accounts[0]],[kine,accounts[2]],[kine2,accounts[3]]])await signIn(who,"equipo",{email:account.email,password})
 const config="/api/administracion/calendly/webhooks",endpoint="/api/calendly/webhook",today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago"}).format(new Date())
 async function json(who,path,body,status=200){const response=await who(path,body===undefined?undefined:post(body)),value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value}
 async function event(date=today){const id=randomUUID();await json(admin,"/api/eventos",{id,nombre:"Expo webhook QA",fecha:date,lugar:"Recinto ficticio",cupos:6},201);return id}
 function booking(date=today,immediate=false){const reservaId="hook-"+randomUUID(),invitadoId="hook-"+randomUUID(),inicio=immediate?new Date():new Date(date+"T15:00:00Z"),uri=`https://api.calendly.com/scheduled_events/${reservaId}/invitees/${invitadoId}`;bookingFixtures.set(reservaId,{invitadoId,inicio,fin:new Date(inicio.getTime()+600000)});return {reservaId,invitadoId,uri}}
 let serial=0
 function notice(row,type="invitee.created"){return {event:type,created_at:new Date(Date.now()+serial++).toISOString(),payload:{uri:row.uri,event:`https://api.calendly.com/scheduled_events/${row.reservaId}`,name:"NOMBRE_NO_GUARDAR",email:"NO_GUARDAR@example.test",questions_and_answers:[{answer:"RESPUESTA_PRIVADA"}]}}}
 function signed(payload,changes={}){const body=typeof payload==="string"?payload:JSON.stringify(payload),t=String(Math.floor(Date.now()/1000)),sig=createHmac("sha256",secret).update(t+".").update(body).digest("hex");return {method:"POST",headers:{"Content-Type":"application/json","Calendly-Webhook-Signature":`t=${t},v1=${sig}`,...changes},body}}
 async function waitFor(row,type="invitee.created",state="PROCESADO"){
  for(let i=0;i<200;i++){const result=(await db.query('SELECT estado,resultado FROM "AvisoCalendly" WHERE "invitadoUri"=$1 AND tipo=$2 ORDER BY "recibidoAt" DESC LIMIT 1',[row.uri,type])).rows[0];if(result?.estado===state)return;await new Promise(resolve=>setTimeout(resolve,50))}
  throw new Error("Aviso no llegó al estado esperado: "+state)
 }
 const initialMails=mails.length,babies=(await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n
 await json(anonymous,config,undefined,401);await json(reception,config,undefined,403);await json(kine,config,undefined,403)
 assert.equal((await admin(config,{method:"POST"})).status,403)
 await json(admin,config,{})
 const eventId=await event(),a=booking()
 await json(reception,"/api/calendly/cupos",{eventoId:eventId})
 const status=()=>json(reception,`/api/calendly/cupos?eventoId=${eventId}`)
 assert.equal((await status()).automatico,true)
 // A quiet webhook connection stays usable without a browser heartbeat after the legacy five minutes.
 await db.query(`UPDATE "EstadoWebhookCalendly" SET "conectadaAt"=$1 WHERE id='expo'`,[new Date(Date.now()-3600000)])
 await db.query('UPDATE "JornadaCalendly" SET "sincronizadaAt"=$2 WHERE "eventoId"=$1',[eventId,new Date(Date.now()-600000)])
 assert.equal((await status()).bloqueada,false)
 const b=booking(),payload=notice(b)
 assert.equal((await anonymous(endpoint,{...signed(payload),headers:{...signed(payload).headers,"Calendly-Webhook-Signature":"t=0,v1="+"0".repeat(64)}})).status,401)
 assert.equal((await anonymous(endpoint,signed({...payload,payload:{...payload.payload,uri:"https://ajeno.test/robar"}}))).status,400)
 assert.equal((await anonymous(endpoint,signed(" ".repeat(131073)))).status,413)
 assert.equal((await anonymous(endpoint,signed({...payload,event:"otro.evento"}))).status,204)
 assert.equal((await db.query('SELECT count(*)::int n FROM "AvisoCalendly"')).rows[0].n,0)
 const duplicate=await Promise.all([anonymous(endpoint,signed(payload)),other(endpoint,signed(payload))]);for(const response of duplicate)assert.equal(response.status,202)
 await waitFor(b)
 assert.equal((await db.query('SELECT count(*)::int n FROM "AvisoCalendly" WHERE "invitadoUri"=$1',[b.uri])).rows[0].n,1)
 assert.equal((await status()).protegidos,2)
 assert.equal((await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n,babies)
 bookingFixtures.get(b.reservaId).status="canceled"
 assert.equal((await anonymous(endpoint,signed(notice(b,"invitee.canceled")))).status,202);await waitFor(b,"invitee.canceled")
 assert.equal((await status()).protegidos,1)
 // An old created notice cannot resurrect an already canceled provider record.
 assert.equal((await anonymous(endpoint,signed(notice(b)))).status,202);await waitFor(b)
 assert.equal((await status()).protegidos,1)
 const next=booking();bookingFixtures.get(a.reservaId).status="canceled";bookingFixtures.get(a.reservaId).rescheduled=true;bookingFixtures.get(a.reservaId).newUri=next.uri;bookingFixtures.get(next.reservaId).oldUri=a.uri
 assert.equal((await anonymous(endpoint,signed(notice(a,"invitee.canceled")))).status,202);await waitFor(a,"invitee.canceled")
 assert.equal((await status()).protegidos,1)
 assert.equal((await anonymous(endpoint,signed(notice(next)))).status,202);await waitFor(next)
 assert.equal((await status()).protegidos,1)
 const tomorrow=new Date(Date.parse(today+"T12:00:00Z")+86400000).toISOString().slice(0,10),tomorrowId=await event(tomorrow)
 await json(reception,"/api/calendly/cupos",{eventoId:tomorrowId})
 const later=booking(tomorrow);bookingFixtures.get(next.reservaId).status="canceled";bookingFixtures.get(next.reservaId).rescheduled=true;bookingFixtures.get(next.reservaId).newUri=later.uri;bookingFixtures.get(later.reservaId).oldUri=next.uri
 assert.equal((await anonymous(endpoint,signed(notice(later)))).status,202);await waitFor(later)
 assert.equal((await status()).protegidos,0)
 assert.equal((await json(reception,`/api/calendly/cupos?eventoId=${tomorrowId}`)).protegidos,1)
 async function arrive(row,name){await anonymous(endpoint,signed(notice(row)));await waitFor(row);return (await json(reception,"/api/recepcion/calendly",{id:randomUUID(),eventoId:eventId,reservaId:row.reservaId,invitadoId:row.invitadoId,nombreBebe:name,fechaNacimiento:"2026-01-01",nombreApoderado:"Apoderado QA",autorizado:true,confirmado:true,privacidad:paperConsent.privacidad})).inscripcion}
 const active=booking(today,true),receipt=await arrive(active,"Bebé webhook activo")
 const called=(await json(kine,"/api/kinesiologia/llamar",{id:randomUUID(),eventoId:eventId})).atencion;assert.equal(called.numero,receipt.numero)
 const original=(await db.query('SELECT id,numero,"qrToken","pacienteId","eventoId","citaInicio" FROM "Inscripcion" WHERE id=$1',[receipt.id])).rows[0]
 bookingFixtures.get(active.reservaId).status="canceled"
 await anonymous(endpoint,signed(notice(active,"invitee.canceled")));await waitFor(active,"invitee.canceled")
 assert.equal((await db.query('SELECT estado FROM "EntradaFila" WHERE "inscripcionId"=$1',[receipt.id])).rows[0].estado,"EN_ATENCION")
 assert.equal((await db.query('SELECT "revisionCalendlyPendiente" FROM "Inscripcion" WHERE id=$1',[receipt.id])).rows[0].revisionCalendlyPendiente,true)
 assert.deepEqual((await db.query('SELECT id,numero,"qrToken","pacienteId","eventoId","citaInicio" FROM "Inscripcion" WHERE id=$1',[receipt.id])).rows[0],original)
 const waiting=booking(today,true),waitingReceipt=await arrive(waiting,"Bebé webhook espera")
 const replacement=booking(today,true)
 const beforeReprogram=(await db.query('SELECT "pacienteId",numero,"qrToken" FROM "Inscripcion" WHERE id=$1',[waitingReceipt.id])).rows[0]
 bookingFixtures.get(waiting.reservaId).status="canceled";bookingFixtures.get(waiting.reservaId).rescheduled=true;bookingFixtures.get(waiting.reservaId).newUri=replacement.uri;bookingFixtures.get(replacement.reservaId).oldUri=waiting.uri
 await anonymous(endpoint,signed(notice(waiting,"invitee.canceled")));await waitFor(waiting,"invitee.canceled")
 const moved=(await db.query('SELECT "pacienteId",numero,"qrToken","calendlyInvitadoId","revisionCalendlyPendiente" FROM "Inscripcion" WHERE id=$1',[waitingReceipt.id])).rows[0]
 for(const key of ["pacienteId","numero","qrToken"])assert.equal(moved[key],beforeReprogram[key])
 assert.equal(moved.calendlyInvitadoId,replacement.invitadoId);assert.equal(moved.revisionCalendlyPendiente,false)
 assert.equal((await db.query('SELECT count(*)::int n FROM "CambioCitaCalendly" WHERE "inscripcionId"=$1',[waitingReceipt.id])).rows[0].n,1)
 bookingFixtures.get(replacement.reservaId).status="canceled";await anonymous(endpoint,signed(notice(replacement,"invitee.canceled")));await waitFor(replacement,"invitee.canceled")
 assert.equal((await json(kine2,"/api/kinesiologia/llamar",{id:randomUUID(),eventoId:eventId})).atencion,null)
 const lookup=await json(reception,"/api/recepcion/buscar",{eventoId:eventId,consulta:String(waitingReceipt.numero)});assert(lookup.inscripcion.revisionCalendlyPendiente)
 await json(reception,"/api/recepcion/llegadas",{eventoId:eventId,inscripcionId:waitingReceipt.id},409)
 const failed=booking();calendlyFixtureState.fail=true
 assert.equal((await anonymous(endpoint,signed(notice(failed)))).status,202);await waitFor(failed,"invitee.created","PENDIENTE")
 for(let n=0;n<100;n++){const row=(await db.query('SELECT resultado FROM "AvisoCalendly" WHERE "invitadoUri"=$1',[failed.uri])).rows[0];if(row?.resultado==="REINTENTAR")break;await new Promise(resolve=>setTimeout(resolve,20))}
 assert.equal((await status()).disponibles,0)
 calendlyFixtureState.fail=false
 await db.query('UPDATE "AvisoCalendly" SET "disponibleAt"=CURRENT_TIMESTAMP WHERE "invitadoUri"=$1',[failed.uri])
 const cron="/api/interno/calendly/procesar"
 assert.equal((await anonymous(cron)).status,401)
 const retry=await anonymous(cron,{headers:{authorization:"Bearer "+secret}});assert.equal(retry.status,200);await waitFor(failed)
 assert.equal((await status()).automatico,true)
 const foreign=booking();bookingFixtures.get(foreign.reservaId).foreign=true
 await anonymous(endpoint,signed(notice(foreign)));await waitFor(foreign,"invitee.created","IGNORADO")
 assert.equal((await db.query('SELECT count(*)::int n FROM "ReservaCupoCalendly" WHERE "invitadoId"=$1',[foreign.invitadoId])).rows[0].n,0)
 const privacy=JSON.stringify((await db.query('SELECT * FROM "AvisoCalendly"')).rows)
 for(const value of ["NOMBRE_NO_GUARDAR","NO_GUARDAR@example.test","RESPUESTA_PRIVADA",secret])assert(!privacy.includes(value))
 assert.equal(mails.length,initialMails)
 assert.equal((await db.query('SELECT count(*)::int n FROM "CorreoInscripcion" WHERE "inscripcionId" IN (SELECT id FROM "Inscripcion" WHERE "calendlyInvitadoId" IS NOT NULL)')).rows[0].n,0)
 // A historical retry timestamp is not the same as a disabled subscription.
 calendlyFixtureState.retryAt=new Date(Date.now()-3600000).toISOString()
 await json(admin,config,{})
 calendlyFixtureState.retryAt=new Date().toISOString()
 await json(admin,config,{},503)
 const recovery=booking();bookingFixtures.get(recovery.reservaId).foreign=true
 await anonymous(endpoint,signed(notice(recovery)));await waitFor(recovery,"invitee.created","IGNORADO")
 assert.equal((await status()).automatico,true)
 calendlyFixtureState.retryAt=null
 // Health has a bounded lifetime; a flag alone never disables the existing safety gate.
 await db.query(`UPDATE "EstadoWebhookCalendly" SET "verificadaAt"=$1 WHERE id='expo'`,[new Date(Date.now()-27*3600000)])
 await db.query('UPDATE "JornadaCalendly" SET "sincronizadaAt"=$2 WHERE "eventoId"=$1',[eventId,new Date(Date.now()-3600000)])
 assert((await status()).bloqueada)
 await json(admin,config,{})
 await browserCalendlyHooks({base,password,adminAccount})
 assert.equal(mails.length,initialMails)
 console.log("OK webhooks Calendly: firmas reales, cola persistente, after sin panel, duplicados, orden inverso, reprogramación entre días, atenciones conservadas, revisión, recuperación privada y cero correos.")
}
