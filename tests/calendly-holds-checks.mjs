import { browserCalendlyHolds } from "./browser-calendly-holds.mjs"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { bookingFixtures, calendlyFixtureState } from "./calendly-link-checks.mjs"
import { familyConsent, paperConsent } from "./privacy-fixtures.mjs"
export async function calendlyHoldsChecks({ db, client, signIn, password, accounts, admin, post, mails, family, secondaryBase, base }) {
 const reception = client(), other = client(secondaryBase), kine = client(), anonymous = client()
 for (const [who, account] of [[reception,accounts[0]],[other,accounts[1]],[kine,accounts[2]]]) await signIn(who,"equipo",{email:account.email,password})
 const apoderado = await family("holds-family@example.test")
 const fecha = new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago"}).format(new Date())
 const eventId = randomUUID(), event = {id:eventId,nombre:"Jornada protegida QA",fecha,lugar:"Recinto ficticio",cupos:3}
 async function json(who,path,body,status=200,method="POST") {
  const res=await who(path,body===undefined?undefined:{...post(body),method}),value=await res.json()
  assert.equal(res.status,status,`${path}: ${JSON.stringify(value)}`);return value
 }
 await json(admin,"/api/eventos",event,201)
 await json(admin,`/api/eventos/${eventId}/inscripciones`,{abiertas:true},200,"PATCH")
 function booking(offset=0) {
  const reservaId="reserva-"+randomUUID(),invitadoId="invitado-"+randomUUID(),inicio=new Date(fecha+"T15:00:00Z")
  inicio.setMinutes(inicio.getMinutes()+offset)
  bookingFixtures.set(reservaId,{invitadoId,inicio,fin:new Date(inicio.getTime()+600000)})
  return {reservaId,invitadoId}
 }
 const a=booking(),b=booking(10),endpoint="/api/calendly/cupos"
 const local=(nombre)=>({...paperConsent,id:randomUUID(),eventoId:eventId,nombreBebe:nombre,fechaNacimiento:"2026-01-01",nombreApoderado:"Apoderado ficticio",correo:""})
 const status=async()=>json(reception,`${endpoint}?eventoId=${eventId}`)
 const sync=()=>json(reception,endpoint,{eventoId:eventId})
 const beforeMails=mails.length,beforeBabies=(await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n
 await json(anonymous,endpoint,{eventoId:eventId},401)
 await json(kine,endpoint,{eventoId:eventId},403)
 await json(reception,endpoint,{eventoId:"invalido"},400)
 const foreign=await reception(endpoint,{...post({eventoId:eventId}),headers:{...post({}).headers,origin:"https://ajeno.test"}});assert.equal(foreign.status,403)
 calendlyFixtureState.pageSize=1
 let value=await sync()
 assert.equal(value.protegidos,2);assert.equal(value.disponibles,1);assert.equal(value.inscritos,0)
 assert.equal((await db.query('SELECT count(*)::int n FROM "Paciente"')).rows[0].n,beforeBabies)
 assert.equal((await db.query('SELECT count(*)::int n FROM "Inscripcion" WHERE "eventoId"=$1',[eventId])).rows[0].n,0)
 assert.equal(mails.length,beforeMails)
 await sync()
 assert.equal((await db.query('SELECT count(*)::int n FROM "ReservaCupoCalendly" WHERE "eventoId"=$1',[eventId])).rows[0].n,2)
 // Shared lease protects two operators and an obsolete worker cannot overwrite its successor.
 calendlyFixtureState.delayMs=100
 const races=await Promise.all([reception(endpoint,post({eventoId:eventId})),other(endpoint,post({eventoId:eventId}))])
 assert.deepEqual(races.map(row=>row.status).sort(),[200,409])
 calendlyFixtureState.delayMs=900
 const oldWorker=reception(endpoint,post({eventoId:eventId}))
 let leased=false
 for(let n=0;n<100;n++) {
  if((await db.query('SELECT "bloqueoToken" FROM "JornadaCalendly" WHERE "eventoId"=$1',[eventId])).rows[0].bloqueoToken && calendlyFixtureState.pausedRequests > 0){leased=true;break}
  await new Promise(resolve=>setTimeout(resolve,10))
 }
 assert(leased)
 await db.query('UPDATE "JornadaCalendly" SET "bloqueoHasta"=$2 WHERE "eventoId"=$1',[eventId,new Date(Date.now()-1000)])
 calendlyFixtureState.delayMs=0
 const newer=await sync()
 assert.equal((await oldWorker).status,409)
 value=await status();assert.equal(value.sincronizadaAt,newer.sincronizadaAt);assert.equal(value.bloqueada,false);assert.equal(value.protegidos,2)
 const normal=await json(reception,"/api/recepcion/presencial",local("Bebé presencial con cupo libre"),201)
 assert(normal.inscripcion.numero)
 const reg={...familyConsent,id:randomUUID(),eventoId:eventId,nombreBebe:"Bebé web bloqueado",fechaNacimiento:"2026-01-01",nombreApoderado:"Apoderado ficticio"}
 await json(apoderado.request,"/api/familias/inscripciones",reg,409)
 await json(other,"/api/recepcion/presencial",local("No robar cupo de Calendly"),409)
 const available=(await json(anonymous,"/api/eventos/disponibles")).eventos.find(row=>row.id===eventId)
 assert.equal(available.disponibles,0);assert.equal(available.listaEspera,true)
 await json(apoderado.request,"/api/familias/lista-espera",{...reg,id:randomUUID(),nombreBebe:"Bebé esperando un cupo",aceptaAsignacion:true})
 const body={id:randomUUID(),eventoId:eventId,...a,nombreBebe:"Bebé con reserva protegida",fechaNacimiento:"2026-01-01",nombreApoderado:"Apoderado QA",correo:"",autorizado:true,confirmado:true,privacidad:{...paperConsent.privacidad}}
 const results=await Promise.all([reception("/api/recepcion/calendly",post(body)),other("/api/recepcion/calendly",post({...body,id:randomUUID()}))])
 for(const result of results)assert.equal(result.status,200,JSON.stringify(await result.clone().json()))
 const receipt=(await results[0].json()).inscripcion
 value=await status();assert.equal(value.inscritos,2);assert.equal(value.protegidos,1);assert.equal(value.ocupados,3);assert.equal(value.disponibles,0)
 assert.equal((await db.query('SELECT count(*)::int n FROM "Inscripcion" WHERE "calendlyInvitadoId"=$1',[a.invitadoId])).rows[0].n,1)
 await sync();assert.equal((await status()).ocupados,3)
 await json(reception,`/api/lista-espera/${eventId}`,{})
 assert.equal((await db.query(`SELECT count(*)::int n FROM "ListaEspera" WHERE "eventoId"=$1 AND estado=$2`,[eventId,"PENDIENTE"])).rows[0].n,1)
 let revision=(await db.query('SELECT revision FROM "Evento" WHERE id=$1',[eventId])).rows[0].revision
 await json(admin,`/api/eventos/${eventId}`,{...event,cupos:2,revision},409,"PATCH")
 // Local cancellation cannot free an active Calendly reservation for somebody else.
 await json(reception,`/api/inscripciones/${receipt.id}/cancelacion`,{eventoId:eventId,motivo:"Cancelación ficticia local"})
 value=await status();assert.equal(value.inscritos,1);assert.equal(value.protegidos,2);assert.equal(value.ocupados,3)
 assert.equal((await db.query(`SELECT count(*)::int n FROM "ListaEspera" WHERE "eventoId"=$1 AND estado=$2`,[eventId,"PENDIENTE"])).rows[0].n,1)
 // The provider confirms cancellation; synchronization frees only the logistics hold, never the historical record.
 bookingFixtures.get(a.reservaId).status="canceled"
 value=await sync();assert.equal(value.protegidos,1);assert.equal(value.disponibles,1)
 assert.equal(mails.length,beforeMails,"Sincronizar y confirmar llegada no programa ni envía correos")
 // Failure on the second page leaves the complete previous snapshot and timestamp intact.
 const stamp=value.sincronizadaAt
 calendlyFixtureState.failPage2=true
 await json(reception,endpoint,{eventoId:eventId},503)
 value=await status();assert.equal(value.protegidos,1);assert.equal(value.sincronizadaAt,stamp);assert(value.bloqueada);assert.equal(value.disponibles,0)
 await json(other,"/api/recepcion/presencial",local("Bloqueado por consulta incompleta"),409)
 calendlyFixtureState.failPage2=false
 calendlyFixtureState.incomplete=true
 await json(reception,endpoint,{eventoId:eventId},400)
 assert.equal((await status()).protegidos,1)
 calendlyFixtureState.incomplete=false
 await sync()
 calendlyFixtureState.omit.add(b.reservaId)
 value=await sync();assert.equal(value.protegidos,1,"Ausencia de una página no prueba una cancelación")
 calendlyFixtureState.omit.clear()
 booking(20);booking(30)
 value=await sync();assert.equal(value.protegidos,3);assert.equal(value.exceso,1);assert.equal(value.disponibles,0)
 await json(other,"/api/recepcion/presencial",local("Bloqueado por capacidad"),409)
 revision=(await db.query('SELECT revision FROM "Evento" WHERE id=$1',[eventId])).rows[0].revision
 await json(admin,`/api/eventos/${eventId}`,{...event,cupos:4,revision},200,"PATCH")
 // Stale status cannot reopen capacity or promote the waiting list.
 await db.query('UPDATE "JornadaCalendly" SET "sincronizadaAt"=$2 WHERE "eventoId"=$1',[eventId,new Date(Date.now()-360000)])
 value=await status();assert(value.bloqueada);assert.equal(value.protegidos,3)
 await json(reception,`/api/lista-espera/${eventId}`,{})
 assert.equal((await db.query(`SELECT count(*)::int n FROM "ListaEspera" WHERE "eventoId"=$1 AND estado=$2`,[eventId,"PENDIENTE"])).rows[0].n,1)
 const otherEvent={...event,id:randomUUID(),nombre:"Otra jornada del mismo día"}
 await json(admin,"/api/eventos",otherEvent,201)
 await json(admin,endpoint,{eventoId:otherEvent.id},409)
 await sync()
 assert.equal((await db.query('SELECT count(*)::int n FROM "CorreoInscripcion" WHERE "inscripcionId" IN (SELECT id FROM "Inscripcion" WHERE "calendlyInvitadoId" IS NOT NULL)')).rows[0].n,0)
 assert.equal(mails.length,beforeMails)
 await browserCalendlyHolds({base,password,account:accounts[0],admin,post,bookingFixtures,db})
 assert.equal(mails.length,beforeMails)
 console.log("OK cupos Calendly: páginas completas, duplicados, disponibilidad compartida, llegada concurrente sin doble cupo, cancelación conservadora, lista de espera, fechas/capacidad protegidas, fallos y cero correos.")
}
