import assert from 'node:assert/strict'
import {mkdir,realpath,chmod,open} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {contactSnapshotHash} from '../src/lib/results/contact-policy.ts'
import {readPrivate} from './lib/daily-reminders.mjs'
import {followupPreview,previewPage,PREVIEW_VERSION} from './lib/expo-followup-preview.mjs'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),folder=resolve(root,'test-results/seguimiento-expo-20261130')
export function parsePreviewArgs(args){assert(args.length===1&&['--ficticia','--privadas'].includes(args[0]),'Solo --ficticia o --privadas; sin opciones de programación o envío');return args[0]}
export const fictitiousRow={bebe:'Bebé de ejemplo',profesional:'Profesional de ejemplo',fechaEvaluacion:'2026-11-21T15:00:00.000Z',protocolo:'casku-craneometria-v2',indicadores:[{nombre:'CI',valor:'85,7 %',clasificacion:'Braquicefalia leve'},{nombre:'CVA',valor:'3 mm',clasificacion:'Leve'},{nombre:'CVAI',valor:'2,17 %',clasificacion:'Leve'},{nombre:'DPOE',valor:'3 mm',clasificacion:'Normal'}]}
async function writePrivate(file,body){const h=await open(file,'w',0o600);try{await h.chmod(0o600);await h.writeFile(body);await h.sync()}finally{await h.close()}}
export async function main(args=process.argv.slice(2)){
 const mode=parsePreviewArgs(args),base=resolve(root,'test-results');await mkdir(base,{recursive:true});assert.equal(await realpath(base),base);await mkdir(folder,{recursive:true,mode:0o700});assert.equal(await realpath(folder),folder);await chmod(folder,0o700)
 if(mode==='--ficticia'){
  const message=followupPreview(fictitiousRow),file=resolve(folder,'vista-previa-ficticia.html')
  await writePrivate(file,previewPage(message,{fictitious:true}))
  return {estado:'VISTA_FICTICIA_SIN_ENVIO',archivo:file,aprobado:false,envios:0,programados:0}
 }
 const index=await readPrivate(resolve(folder,'ultima-revision.json'))
 assert(dirname(index.archivo)===folder,'Referencia fuera del informe privado')
 const manifest=await readPrivate(index.archivo),{digest,...core}=manifest
 assert.equal(contactSnapshotHash(core),digest);assert.equal(index.digest,digest)
 assert.equal(manifest.tipo,'REVISION_SEGUIMIENTO_SIN_ENVIO');assert.equal(manifest.capacidades.enviar,false);assert.equal(manifest.capacidades.programar,false)
 const available=manifest.rows.filter(r=>r.tecnicamenteDisponible)
 const rendered=available.map(row=>({row,message:followupPreview(row)}))
 for(const {row,message} of rendered){assert.equal(message.aprobado,false);assert.deepEqual(message.indicatorsUsed,row.indicadores.filter(i=>!/confirmar|pendiente/i.test(i.clasificacion)))}
 const picked=['casku-pdf-borrador-v1','casku-craneometria-v2'].map(protocol=>{
  const candidates=rendered.filter(x=>x.row.protocolo===protocol)
  candidates.sort((a,b)=>b.message.indicatorsUsed.length-a.message.indicatorsUsed.length)
  assert(candidates.length,'Falta una muestra válida del protocolo')
  return candidates[0]
 })
 for(let i=0;i<picked.length;i++)await writePrivate(resolve(folder,`vista-privada-protocolo-${i+1}.html`),previewPage(picked[i].message))
 const page='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vistas privadas de seguimiento</title></head><body style="font:16px/1.7 Arial,sans-serif;max-width:760px;margin:40px auto;padding:20px;color:#004e58"><h1>Propuesta de seguimiento Casku</h1><p><strong>Uso privado · Datos reales · Pendiente de aprobación · Sin programación ni envío.</strong></p><p>Los ejemplos conservan los resultados originales de la revisión privada. No son nuevas mediciones ni recomendaciones clínicas.</p><ul><li><a href="vista-privada-protocolo-1.html">Protocolo histórico · Solo CI y CVA originales disponibles</a></li><li><a href="vista-privada-protocolo-2.html">Protocolo v2 · Indicadores originales disponibles</a></li></ul><p>La autorización aplicable, el contenido y el criterio de destinatarios siguen pendientes. Ninguna vista previa cambia esos controles.</p></body></html>'
 await writePrivate(resolve(folder,'vistas-privadas.html'),page)
 await writePrivate(resolve(folder,'validacion-vistas-previas.json'),JSON.stringify({template:PREVIEW_VERSION,revisionHash:digest,checkedAt:new Date().toISOString(),casosValidados:rendered.length,ejemplosPrivados:2,resultadosOriginalesConservados:true,aprobado:false,programados:0,envios:0},null,2))
 return {estado:'VISTAS_PRIVADAS_SIN_ENVIO',casosValidados:rendered.length,archivo:resolve(folder,'vistas-privadas.html'),aprobado:false,envios:0,programados:0}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(JSON.stringify({estado:'VISTA_DETENIDA',motivo:e instanceof assert.AssertionError?'VALIDACION_DE_REFERENCIAS':e.code||e.name,envios:0,programados:0}));process.exitCode=1})
