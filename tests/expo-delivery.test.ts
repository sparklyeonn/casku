import test from 'node:test'
import assert from 'node:assert/strict'
import type {Prisma} from '@prisma/client'
import {expoResultKey,expoDeliveryBlocksEdit,expoDeliveryBlocksAnotherMail,previousExpoMail} from '../src/lib/results/expo-delivery.ts'
import {recipientKey} from '../src/lib/mail/webhook-policy.ts'
import {contactSnapshotHash} from '../src/lib/results/contact-policy.ts'
import type {ResultSnapshot} from '../src/lib/results/snapshot.ts'
const snapshot:ResultSnapshot={nombreBebe:'Ficticio',fechaNacimiento:'2026-01-01',profesional:'Ficticia',evento:null,numero:null,fechaEvaluacion:'2026-11-22T12:00:00Z',medidas:{ap:140,bp:120,di:135,dd:138},indiceCraneal:120/140*100,indiceAsimetria:3,diagnostico:'Ficticio',recomendacion:'Ficticia'}
const now=new Date('2026-11-23T02:00:00Z')
function tx(row:Record<string,unknown>|null){return {envioTransaccional:{findUnique:async()=>row}} as unknown as Prisma.TransactionClient}
test('Expo: clave estable por evaluación y revisión; canceladas no bloquean otro envío',()=>{
 assert.equal(expoResultKey('id',1),expoResultKey('id',1));assert.notEqual(expoResultKey('id',1),expoResultKey('id',2))
 assert(expoDeliveryBlocksAnotherMail({estado:'ACEPTADO'}));assert(expoDeliveryBlocksAnotherMail({estado:'REVISION'}));assert(!expoDeliveryBlocksAnotherMail({estado:'CANCELADO'}))
})
test('Expo: edición protegida durante programación y liberada tras el margen de salida',()=>{
 assert(expoDeliveryBlocksEdit({estado:'ACEPTADO',disponibleAt:new Date('2026-11-23T13:00:00Z'),entrega:'SIN_CONFIRMAR'},now))
 assert(!expoDeliveryBlocksEdit({estado:'ACEPTADO',disponibleAt:new Date('2026-11-23T13:00:00Z'),entrega:'SIN_CONFIRMAR'},new Date('2026-11-23T13:06:00Z')))
 assert(!expoDeliveryBlocksEdit({estado:'CANCELADO',disponibleAt:now,entrega:'SIN_CONFIRMAR'},now))
})
test('Expo: publicación familiar conserva aceptación solo para misma copia y destinatario',async t=>{
 const previous=process.env.CASKU_MAIL_SUPPRESSION_SECRET;process.env.CASKU_MAIL_SUPPRESSION_SECRET='s'.repeat(40);t.after(()=>{if(previous===undefined)delete process.env.CASKU_MAIL_SUPPRESSION_SECRET;else process.env.CASKU_MAIL_SUPPRESSION_SECRET=previous})
 const row={clave:expoResultKey('id',1),finalidad:'RESULTADO',estado:'ACEPTADO',proveedorId:'fixture-id',aceptadoAt:now,updatedAt:now,destinatarioClave:recipientKey('family@example.test','s'.repeat(40)),motivo:`EXPO_PROGRAMADO:${contactSnapshotHash(snapshot)}`}
 assert.deepEqual(await previousExpoMail(tx(row),'id',1,'family@example.test',snapshot),{estado:'ACEPTADO',proveedorId:'fixture-id',aceptadoAt:now})
 assert.deepEqual(await previousExpoMail(tx(row),'id',1,'other@example.test',snapshot),{estado:'REVISION'})
 assert.deepEqual(await previousExpoMail(tx(row),'id',1,'family@example.test',{...snapshot,nombreBebe:'Corregido'}),{estado:'REVISION'})
 assert.equal(await previousExpoMail(tx({...row,estado:'CANCELADO'}),'id',1,'family@example.test',snapshot),null)
})
test('Expo: registros ajenos se ignoran y aceptación incierta impide copia nueva',async()=>{
 assert.equal(await previousExpoMail(tx({clave:'another',finalidad:'RESULTADO'}),'id',1,'family@example.test',snapshot),null)
 assert.deepEqual(await previousExpoMail(tx({clave:expoResultKey('id',1),finalidad:'RESULTADO',estado:'REVISION'}),'id',1,'family@example.test',snapshot),{estado:'REVISION'})
})
