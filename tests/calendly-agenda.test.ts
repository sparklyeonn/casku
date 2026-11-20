import test from "node:test"
import assert from "node:assert/strict"
import { agendaDayRange, parseAgendaDate, parseAgendaStatus, listCalendlyAgenda, agendaForRole } from "../src/lib/calendly/agenda.ts"
import { CalendlyUnavailable } from "../src/lib/calendly/client.ts"
const user = "https://api.calendly.com/users/usuario-qa"
const type = "https://api.calendly.com/event_types/expo-qa"
const eventUri = "https://api.calendly.com/scheduled_events/cita-qa"
const event = { uri: eventUri, event_type: type, status: "active", start_time: "2026-11-20T13:00:00Z", end_time: "2026-11-20T13:10:00Z", meeting_notes_plain: "NOTA_PRIVADA" }
const invitee = { uri: eventUri + "/invitees/invitado-qa", event: eventUri, name: "Nombre ficticio QA", email: "familia@example.test", status: "active", cancel_url: "URL_PRIVADA", questions_and_answers: [{answer:"RESPUESTA_PRIVADA"}], tracking: {secret:"SECRETO_TRACKING"} }
const typeRow = { uri: type, name: "Expo ficticia", scheduling_url: "https://calendly.com/contacto-casku/new-meeting", active: true }
async function mock(run: (calls: URL[]) => Promise<void>, customize?: (url: URL) => Response | undefined) {
 const saved = { CALENDLY_API_TOKEN:process.env.CALENDLY_API_TOKEN,CALENDLY_ENABLED:process.env.CALENDLY_ENABLED }, original = globalThis.fetch, calls:URL[]=[]
 process.env.CALENDLY_API_TOKEN="token-qa-sin-uso"; process.env.CALENDLY_ENABLED="1"
 globalThis.fetch=async (input, options)=>{
  const url=new URL(String(input));calls.push(url)
  assert.equal(url.origin,"https://api.calendly.com");assert.equal(options?.method,"GET");assert.equal(options?.cache,"no-store");assert.equal(options?.redirect,"error")
  assert.equal(new Headers(options?.headers).get("authorization"),"Bearer token-qa-sin-uso")
  const value=customize?.(url);if(value)return value
  if(url.pathname==="/users/me")return Response.json({resource:{uri:user}})
  if(url.pathname==="/event_types")return Response.json({collection:[typeRow],pagination:{}})
  if(url.pathname==="/scheduled_events")return Response.json({collection:[event],pagination:{}})
  assert.equal(url.pathname,"/scheduled_events/cita-qa/invitees")
  return Response.json({collection:[invitee],pagination:{}})
 }
 try{await run(calls)}finally{globalThis.fetch=original;for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
}
test("agenda: fechas reales, estados y día completo de Santiago con cambio de horario",()=>{
 assert.deepEqual(agendaDayRange("2026-11-20"),{inicio:"2026-11-20T03:00:00.000Z",fin:"2026-11-21T03:00:00.000Z"})
 assert.deepEqual(agendaDayRange("2026-06-20"),{inicio:"2026-06-20T04:00:00.000Z",fin:"2026-06-21T04:00:00.000Z"})
 const summer=agendaDayRange("2026-09-06")
 assert.equal(Date.parse(summer.fin)-Date.parse(summer.inicio),23*3600000)
 for(const value of ["2026-02-30","20-11-2026","","2026-11-20T00:00:00Z",null])assert.throws(()=>parseAgendaDate(value))
 assert.equal(parseAgendaStatus(null),"active");assert.throws(()=>parseAgendaStatus("eliminadas"))
})
test("agenda: solo el tipo de Expo confirmado y la cuenta propia, sin datos internos ni enlaces de cancelación",async()=>mock(async calls=>{
 const result=await listCalendlyAgenda({fecha:"2026-11-20",estado:"active"})
 const query=calls.find(url=>url.pathname==="/scheduled_events")!
 assert.equal(query.searchParams.get("user"),user);assert.equal(query.searchParams.get("min_start_time"),"2026-11-20T03:00:00.000Z");assert.equal(query.searchParams.get("max_start_time"),"2026-11-21T03:00:00.000Z")
 assert.equal(result.citas.length,1);assert.equal(result.citas[0].estado,"ACTIVA");assert.equal(result.citas[0].inicio,"2026-11-20T13:00:00.000Z")
 for(const value of ["NOTA_PRIVADA","URL_PRIVADA","RESPUESTA_PRIVADA","SECRETO_TRACKING","token-qa-sin-uso"])assert(!JSON.stringify(result).includes(value))
 assert.equal(agendaForRole(result,"KINESIOLOGO").citas[0].correo,undefined)
 assert.equal(agendaForRole(result,"RECEPCION").citas[0].correo,"familia@example.test")
 assert.equal(agendaForRole(result,"ADMIN").citas[0].correo,"familia@example.test")
},url=>url.pathname==="/scheduled_events"?Response.json({collection:[{...event,uri:"https://api.calendly.com/scheduled_events/otro",event_type:"https://api.calendly.com/event_types/otro"},event],pagination:{}}):undefined))
test("agenda: cancelación y reprogramación no se presentan como horas activas",async()=>mock(async calls=>{
 const result=await listCalendlyAgenda({fecha:"2026-11-20",estado:"canceled"})
 assert.equal(result.citas.length,1);assert.equal(result.citas[0].estado,"REPROGRAMADA")
 assert.equal(calls.find(url=>url.pathname==="/scheduled_events")!.searchParams.get("status"),null)
},url=>url.pathname.endsWith("/invitees")?Response.json({collection:[{...invitee,status:"canceled",rescheduled:true},{...invitee,uri:eventUri+"/invitees/activo"}],pagination:{}}):undefined))
test("agenda: no sigue next_page ajeno y señala páginas o participantes pendientes",async()=>mock(async calls=>{
 const result=await listCalendlyAgenda({fecha:"2026-11-20",estado:"active",cursor:"pagina-qa"})
 assert.equal(result.siguiente,"otra-pagina");assert.equal(result.participantesPendientes,true)
 assert.equal(calls.find(url=>url.pathname==="/scheduled_events")!.searchParams.get("page_token"),"pagina-qa")
},url=>url.pathname==="/scheduled_events"?Response.json({collection:[event],pagination:{next_page_token:"otra-pagina",next_page:"https://ajeno.example/robar"}}):url.pathname.endsWith("/invitees")?Response.json({collection:[invitee],pagination:{next_page_token:"mas-invitados"}}):undefined))
test("agenda: rechaza invitados ajenos y citas con fecha/hora inválida",async()=>{
 for(const bad of [{...invitee,event:"https://api.calendly.com/scheduled_events/otro"},{...invitee,uri:"https://ajeno.example/invitees/token"}]){
  await mock(async()=>{await assert.rejects(listCalendlyAgenda({fecha:"2026-11-20",estado:"active"}),CalendlyUnavailable)},url=>url.pathname.endsWith("/invitees")?Response.json({collection:[bad],pagination:{}}):undefined)
 }
 await mock(async()=>{await assert.rejects(listCalendlyAgenda({fecha:"2026-11-20",estado:"active"}),CalendlyUnavailable)},url=>url.pathname==="/scheduled_events"?Response.json({collection:[{...event,end_time:event.start_time}],pagination:{}}):undefined)
})
test("agenda: día siguiente en el límite UTC no aparece en la fecha anterior y errores no inventan una agenda vacía",async()=>{
 await mock(async calls=>{const result=await listCalendlyAgenda({fecha:"2026-11-20",estado:"active"});assert.equal(result.citas.length,0);assert(!calls.some(url=>url.pathname.endsWith("/invitees")))},url=>url.pathname==="/scheduled_events"?Response.json({collection:[{...event,start_time:"2026-11-21T03:00:00Z",end_time:"2026-11-21T03:10:00Z"}],pagination:{}}):undefined)
 for(const code of [401,403,429,500])await mock(async()=>{await assert.rejects(listCalendlyAgenda({fecha:"2026-11-20",estado:"active"}),error=>error instanceof CalendlyUnavailable&&!error.message.includes("SECRETO"))},()=>Response.json({error:"SECRETO"},{status:code}))
})
test("agenda: tipo ambiguo o enlace ajeno nunca consulta participantes",async()=>mock(async calls=>{
 await assert.rejects(listCalendlyAgenda({fecha:"2026-11-20",estado:"active"}),CalendlyUnavailable)
 assert(!calls.some(url=>url.pathname==="/scheduled_events"))
},url=>url.pathname==="/event_types"?Response.json({collection:[typeRow,{...typeRow,uri:"https://api.calendly.com/event_types/otro"}],pagination:{}}):undefined))
test("agenda: sin activación o token no hace consultas; parámetros inválidos tampoco",async()=>mock(async calls=>{
 process.env.CALENDLY_ENABLED="0"
 await assert.rejects(listCalendlyAgenda({fecha:"2026-11-20",estado:"active"}),CalendlyUnavailable)
 process.env.CALENDLY_ENABLED="1";process.env.CALENDLY_API_TOKEN=""
 await assert.rejects(listCalendlyAgenda({fecha:"2026-11-20",estado:"active"}),CalendlyUnavailable)
 await assert.rejects(listCalendlyAgenda({fecha:"2026-02-30",estado:"active"}))
 assert.equal(calls.length,0)
}))
