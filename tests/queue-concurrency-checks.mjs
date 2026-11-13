import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { setTimeout as pause } from "node:timers/promises"
import { familyConsent } from "./privacy-fixtures.mjs"

export async function queueConcurrencyChecks({db,base,secondaryBase,client,signIn,password,accounts,admin,family,post,createEvent}) {
  const requests=accounts.map((_,i)=>client(i<2?base:secondaryBase))
  for(let i=0;i<accounts.length;i++) assert.equal((await signIn(requests[i],"equipo",{email:accounts[i].email,password})).role,accounts[i].role)
  const [reception,kine,otherReception,otherKine]=requests
  const event=await createEvent(admin,"Concurrencia entre instancias",8)
  const parent=await family("concurrency@example.com"),rows=[]
  for(let i=0;i<4;i++){
    const response=await parent.request("/api/familias/inscripciones",post({...familyConsent,id:randomUUID(),eventoId:event.id,nombreBebe:`Concurrencia ficticia ${i}`,fechaNacimiento:"2026-01-01",nombreApoderado:"Familia ficticia"}))
    assert.equal(response.status,201);rows.push((await response.json()).inscripcion)
  }
  // Mantener el evento bloqueado hasta observar solicitudes de ambas instancias
  // esperando un bloqueo real. Promise.all por sí solo no prueba solapamiento.
  async function contend(operations) {
    const connection=await db.pool.connect()
    let pending,blocked=false
    try {
      await connection.query("BEGIN")
      await connection.query('SELECT id FROM "Evento" WHERE id=$1 FOR UPDATE',[event.id])
      pending=Promise.all(operations.map(operation=>operation()))
      // Adjuntar manejador inmediatamente; el resultado se comprobará tras liberar.
      pending.catch(()=>{})
      for(const start=Date.now();Date.now()-start<15000;){
        const {rows:[row]}=await db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND cardinality(pg_blocking_pids(pid))>0")
        if(row.n>=2){blocked=true;break}
        await pause(50)
      }
    } finally {await connection.query("ROLLBACK");connection.release()}
    const responses=await pending
    assert(blocked,"Ambas solicitudes deben competir por bloqueos PostgreSQL reales")
    return responses
  }
  const arrival={eventoId:event.id,inscripcionId:rows[0].id}
  let responses=await contend([()=>reception("/api/recepcion/llegadas",post(arrival)),()=>otherReception("/api/recepcion/llegadas",post(arrival))])
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,201])
  for(const row of rows.slice(1)) assert.equal((await reception("/api/recepcion/llegadas",post({eventoId:event.id,inscripcionId:row.id}))).status,201)
  const payloads=[{id:randomUUID(),eventoId:event.id},{id:randomUUID(),eventoId:event.id}]
  responses=await contend([()=>kine("/api/kinesiologia/llamar",post(payloads[0])),()=>otherKine("/api/kinesiologia/llamar",post(payloads[1]))])
  assert(responses.every(r=>r.status===200))
  const [first,second]=await Promise.all(responses.map(async r=>(await r.json()).atencion))
  assert.notEqual(first.id,second.id);assert.deepEqual([first.numero,second.numero].sort(),[1,2])
  // Reintentar una respuesta perdida en otra instancia no reserva otro bebé.
  const sameProfessional=client(secondaryBase)
  await signIn(sameProfessional,"equipo",{email:accounts[1].email,password})
  assert.equal((await (await sameProfessional("/api/kinesiologia/llamar",post(payloads[0]))).json()).atencion.id,first.id)
  const absent=await kine("/api/kinesiologia/ausente",post({atencionId:first.id,reservaId:first.reservaId}));assert.equal(absent.status,200)
  const {ausenciaId}=await absent.json()
  const back={eventoId:event.id,inscripcionId:rows.find(r=>r.numero===first.numero).id,ausenciaId}
  responses=await contend([()=>reception("/api/recepcion/reincorporar",post(back)),()=>otherReception("/api/recepcion/reincorporar",post(back))])
  assert(responses.every(r=>r.status===200))
  const rejoins=await Promise.all(responses.map(r=>r.json()));assert.deepEqual(rejoins.map(r=>r.reincorporada).sort(),[false,true])
  const calls=await Promise.all([kine,sameProfessional].map(r=>r("/api/kinesiologia/llamar",post({id:randomUUID(),eventoId:event.id}))))
  assert(calls.every(r=>r.status===200))
  const active=await Promise.all(calls.map(async r=>(await r.json()).atencion));assert.equal(active[0].id,active[1].id)
  assert.equal((await db.query(`SELECT count(*)::int n FROM "EntradaFila" WHERE "profesionalId"=$1 AND estado='EN_ATENCION'`,[accounts[1].id])).rows[0].n,1)
  const record={atencionId:active[0].id,reservaId:active[0].reservaId,ap:140,bp:120,di:135,dd:138}
  const competing=await Promise.all([kine("/api/evaluaciones",post(record)),sameProfessional("/api/kinesiologia/ausente",post(record))])
  assert([201,409].includes(competing[0].status));assert([200,409].includes(competing[1].status));assert.notEqual(competing[0].status===201,competing[1].status===200)
  const state=(await db.query('SELECT estado FROM "EntradaFila" WHERE id=$1',[active[0].id])).rows[0].estado
  assert.equal(state,competing[0].status===201?"ATENDIDO":"AUSENTE")
  assert.equal((await db.query('SELECT count(*)::int n FROM "Evaluacion" WHERE "filaId"=$1',[active[0].id])).rows[0].n,competing[0].status===201?1:0)
  assert.equal((await db.query('SELECT count(*)::int n FROM "EntradaFila" WHERE "inscripcionId"=$1',[rows[0].id])).rows[0].n,1)
  assert.equal((await db.query('SELECT inscritos FROM "Evento" WHERE id=$1',[event.id])).rows[0].inscritos,4)
  await otherKine("/api/kinesiologia/devolver",post({atencionId:second.id,reservaId:second.reservaId}))
  console.log("OK PostgreSQL entre dos instancias: bloqueos observados, doble llegada, llamados exclusivos, reintento en otro servidor, reincorporación única y guardar frente a ausencia.")
}
