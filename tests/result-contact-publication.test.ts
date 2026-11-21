import test from 'node:test'
import assert from 'node:assert/strict'
import type {Prisma} from '@prisma/client'
import {previousContactMail} from '../src/lib/results/contact-publication.ts'
import type {ResultSnapshot} from '../src/lib/results/snapshot.ts'
import {contactSnapshotHash,contactDeliveryDecision} from '../src/lib/results/contact-policy.ts'
const now=new Date('2026-11-21T09:00:00Z')
const snapshot:ResultSnapshot={nombreBebe:'Ficticio',fechaNacimiento:'2026-01-01',profesional:'Ficticia',evento:null,numero:null,fechaEvaluacion:now.toISOString(),medidas:{ap:140,bp:120,di:135,dd:138},indiceCraneal:120/140*100,indiceAsimetria:3,diagnostico:'Ficticio',recomendacion:'Ficticia'}
function db(row:Record<string,unknown>|null,ledger:Record<string,unknown>|null){return {resultadoContacto:{findMany:async({where}:{where:Record<string,unknown>})=>{assert.equal(where.evaluacionId,'evaluation');assert.equal(where.revision,1);assert.equal(where.destinatario,'ficticio@example.invalid');assert.equal(where.hashDatos,contactSnapshotHash(snapshot));return row?[{claveEnvio:'key',updatedAt:now,...row}]:[]}},envioTransaccional:{findUnique:async()=>ledger}} as unknown as Prisma.TransactionClient}
test('publicación tras contacto: conserva evidencia de aceptación sin solicitar otro correo',async()=>{
 const result=await previousContactMail(db({estado:'ENVIANDO'},{estado:'ACEPTADO',proveedorId:'id-fixture',aceptadoAt:now}),'evaluation',1,'FICTICIO@example.invalid',snapshot,now)
 assert.deepEqual(result,{estado:'ACEPTADO',proveedorId:'id-fixture',aceptadoAt:now})
 assert.equal(await previousContactMail(db(null,null),'evaluation',1,'ficticio@example.invalid',snapshot,now),null)
})
test('publicación tras contacto: envío en curso o incierto no produce un correo automático nuevo',async()=>{
 assert.deepEqual(await previousContactMail(db({estado:'ENVIANDO'},null),'evaluation',1,'ficticio@example.invalid',snapshot,now),{estado:'ENVIANDO'})
 assert.deepEqual(await previousContactMail(db({estado:'REVISION'},{estado:'REVISION'}),'evaluation',1,'ficticio@example.invalid',snapshot,now),{estado:'REVISION'})
 assert.deepEqual(await previousContactMail(db({estado:'ENVIANDO'},{estado:'ENVIANDO',bloqueoHasta:new Date(now.getTime()-1)}),'evaluation',1,'ficticio@example.invalid',snapshot,now),{estado:'REVISION'})
})
test('contacto: una conexión libre para ledger; ausencia durable permite recuperar un intento no iniciado',()=>{
 assert.deepEqual(contactDeliveryDecision('ENVIANDO',{estado:'PENDIENTE',intentos:0},now.getTime(),now),{send:false,state:'ENVIANDO'})
 assert.equal(contactDeliveryDecision('PENDIENTE',{estado:'PENDIENTE',intentos:0},now.getTime()).send,true)
 assert.equal(contactDeliveryDecision('ENVIANDO',null,now.getTime(),new Date(now.getTime()-120001)).send,true)
 assert.deepEqual(contactDeliveryDecision('ENVIANDO',null,now.getTime(),now),{send:false,state:'ENVIANDO'})
 assert.deepEqual(contactDeliveryDecision('ENVIANDO',{estado:'ENVIANDO',bloqueoHasta:new Date(now.getTime()+1)},now.getTime(),now),{send:false,state:'ENVIANDO'})
 assert.equal(contactDeliveryDecision('ENVIANDO',{estado:'ENVIANDO',bloqueoHasta:new Date(now.getTime()-1)},now.getTime(),now).state,'REVISION')
})
