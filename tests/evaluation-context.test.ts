import test from "node:test"
import assert from "node:assert/strict"
import { readFile,readdir } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import {parseEvaluationEvent,registeredEvaluationOrigin,evaluationOriginLabel,EvaluationContextError} from "../src/lib/evaluation-context.ts"
test("contexto: toda atención directa requiere evento explícito; origen se deriva de la inscripción",()=>{
 for(const value of [undefined,null,"","2026-11-20",{},"not-an-event"])assert.throws(()=>parseEvaluationEvent(value),EvaluationContextError)
 const id=randomUUID();assert.equal(parseEvaluationEvent(id.toUpperCase()),id)
 assert.equal(registeredEvaluationOrigin({origen:"PREVIA"}),"WEB")
 assert.equal(registeredEvaluationOrigin({origen:"PRESENCIAL"}),"PRESENCIAL")
 assert.equal(registeredEvaluationOrigin({origen:"PREVIA",calendlyReservaId:"booking",calendlyInvitadoId:"guest"}),"CALENDLY")
 assert.throws(()=>registeredEvaluationOrigin({origen:"PREVIA",calendlyInvitadoId:"incomplete"}))
 assert.equal(evaluationOriginLabel(null),"Origen no registrado (histórico)")
 assert.equal(evaluationOriginLabel("DIRECTA_SIN_INSCRIPCION"),"Atención directa sin inscripción")
})
test("migración de contexto: conserva íntegros los históricos y rechaza asociaciones inconsistentes",async()=>{
 const {PGlite}=await import("@electric-sql/pglite"),db=new PGlite(),folder=new URL("../prisma/migrations/",import.meta.url),target="20261127000100_contexto_evaluaciones"
 const event=randomUUID(),other=randomUUID(),patient="fixture-baby",legacy="fixture-legacy",permission=randomUUID()
 try{
  await db.waitReady
  for(const entry of(await readdir(folder,{withFileTypes:true})).filter(x=>x.isDirectory()&&x.name<target).sort((a,b)=>a.name.localeCompare(b.name)))await db.exec(await readFile(new URL(entry.name+"/migration.sql",folder),"utf8"))
  for(const id of[event,other])await db.query('INSERT INTO "Evento" (id,nombre,fecha,lugar,cupos,"creadoPorId","updatedAt") VALUES ($1,\'Evento ficticio\',\'2026-11-27\',\'Prueba\',10,\'fixture\',CURRENT_TIMESTAMP)',[id])
  await db.query('INSERT INTO "Paciente" (id,nombre,"fechaNacimiento") VALUES ($1,\'Bebé ficticio\',\'2026-01-01\')',[patient])
  await db.query('INSERT INTO "AutorizacionPrivacidad" (id,ambito,"pacienteId",datos,"versionTexto","updatedAt") VALUES ($1,\'fixture\',$2,true,\'2026-11-11.1\',CURRENT_TIMESTAMP)',[permission,patient])
  const insert='INSERT INTO "Evaluacion" (id,"pacienteId","autorizacionId",anteroposterior,biparietal,"diagonalIzq","diagonalDer","indiceCraneal","indiceAsimetria",diagnostico,recomendacion,kinesiologa) VALUES ($1,$2,$3,140,120,135,138,85.7,3,\'Texto original\',\'Indicación original\',\'Profesional\')'
  await db.query(insert,[legacy,patient,permission]);const before=(await db.query<{value:Record<string,unknown>}>('SELECT to_jsonb(e) value FROM "Evaluacion" e WHERE id=$1',[legacy])).rows[0].value
  await db.exec(await readFile(new URL(target+"/migration.sql",folder),"utf8"))
  const after=(await db.query<{value:Record<string,unknown>}>('SELECT to_jsonb(e) value FROM "Evaluacion" e WHERE id=$1',[legacy])).rows[0].value
  assert.equal(after.eventoId,null);assert.equal(after.origen,null);delete after.eventoId;delete after.origen;assert.deepEqual(after,before)
  const newInsert=insert.replace('kinesiologa)','kinesiologa,"eventoId",origen,"filaId")').replace("'Profesional')","'Profesional',$4,$5,$6)")
  await db.query(newInsert,['direct',patient,permission,event,'DIRECTA_SIN_INSCRIPCION',null])
  for(const params of [['bad-half',patient,permission,event,null,null],['bad-direct',patient,permission,event,'WEB',null],['unknown-event',patient,permission,randomUUID(),'DIRECTA_SIN_INSCRIPCION',null]])await assert.rejects(db.query(newInsert,params))
  await assert.rejects(db.query('UPDATE "Evaluacion" SET "eventoId"=$1 WHERE id=\'direct\'',[other]),(e:unknown)=>typeof e==='object'&&e!==null&&'code' in e&&e.code==='23514')
  for(const [kind,origin] of [['PREVIA','WEB'],['PRESENCIAL','PRESENCIAL'],['PREVIA','CALENDLY']]){
   const reg=randomUUID(),entry=randomUUID(),parent=randomUUID(),n=origin==='WEB'?1:origin==='PRESENCIAL'?2:3
   await db.query('INSERT INTO "Apoderado" (id,correo,"updatedAt") VALUES ($1,$2,CURRENT_TIMESTAMP)',[parent,origin.toLowerCase()+'@example.test'])
   await db.query('INSERT INTO "Paciente" (id,nombre,"fechaNacimiento") VALUES ($1,\'Otro bebé ficticio\',\'2026-01-01\')',[patient+origin])
   await db.query('INSERT INTO "Inscripcion" (id,"solicitudHash","eventoId","pacienteId",numero,"qrToken",origen,"calendlyReservaId","calendlyInvitadoId","apoderadoId","contactoNombre","registradoPorId","citaInicio","citaFin","citaConfirmadaAt") VALUES ($1,\'fixture\',$2,$3,$4,$5,$6,$7,$8,$9,\'Familia ficticia\',\'fixture\',CASE WHEN $8::text IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,CASE WHEN $8::text IS NULL THEN NULL ELSE CURRENT_TIMESTAMP+interval \'10 minutes\' END,CASE WHEN $8::text IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END)',[reg,event,patient+origin,n,randomUUID(),kind,origin==='CALENDLY'?'booking':null,origin==='CALENDLY'?'guest':null,parent])
   await db.query('INSERT INTO "EntradaFila" (id,"eventoId","inscripcionId",orden,"confirmadoPorId") VALUES ($1,$2,$3,$4,\'fixture\')',[entry,event,reg,n])
   await assert.rejects(db.query(newInsert,['mismatch'+origin,patient+origin,permission,other,origin,entry]),(e:unknown)=>typeof e==='object'&&e!==null&&'code' in e&&e.code==='23514')
   await db.query(newInsert,['linked'+origin,patient+origin,permission,event,origin,entry])
  }
  assert.equal((await db.query<{eventoId:string|null}>('SELECT "eventoId" FROM "Evaluacion" WHERE id=$1',[legacy])).rows[0].eventoId,null)
 }finally{await db.close()}
})
