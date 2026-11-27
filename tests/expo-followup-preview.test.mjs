import test from 'node:test'
import assert from 'node:assert/strict'
import {followupPreview,previewPage,WHATSAPP_URL,WHATSAPP_LABEL} from '../scripts/lib/expo-followup-preview.mjs'
import {fictitiousRow,parsePreviewArgs} from '../scripts/previsualizar-seguimiento-expo.mjs'
test('vista: conserva exactamente valores y categorías originales sin modificar su fuente',()=>{
 const row=structuredClone(fictitiousRow),before=structuredClone(row),m=followupPreview(row)
 assert.deepEqual(row,before);assert.deepEqual(m.indicatorsUsed,row.indicadores)
 for(const i of row.indicadores){assert(m.text.includes(i.valor));assert(m.text.includes(i.clasificacion))}
 assert.equal(m.aprobado,false);assert(!Object.hasOwn(m,'to'));assert(!Object.hasOwn(m,'scheduledAt'))
})
test('vista: históricos conservan solo CI/CVA y pendientes nunca se incluyen',()=>{
 const row={...structuredClone(fictitiousRow),protocolo:'casku-pdf-borrador-v1',indicadores:fictitiousRow.indicadores.slice(0,2)}
 assert.deepEqual(followupPreview(row).indicatorsUsed,row.indicadores)
 assert.throws(()=>followupPreview({...row,indicadores:fictitiousRow.indicadores}))
 row.indicadores[0]={nombre:'CI',valor:'x',clasificacion:'Límite por confirmar'}
 const m=followupPreview(row);assert.deepEqual(m.indicatorsUsed.map(i=>i.nombre),['CVA']);assert(!m.html.includes('por confirmar'));assert(!m.text.includes('por confirmar'))
 assert.throws(()=>followupPreview({...row,indicadores:[]}))
})
test('vista: WhatsApp oficial, contacto, fecha de evaluación y cierre; sin consejos nuevos',()=>{
 const m=followupPreview(fictitiousRow)
 assert(m.html.includes(`href="${WHATSAPP_URL}"`));assert(m.text.includes(WHATSAPP_LABEL));assert(m.text.includes('contacto@casku.cl'));assert(m.text.includes('21 de noviembre de 2026'))
 assert(m.text.includes('Gracias por confiar en nosotros'));assert(m.text.includes('Expo Bebé-Niño · Noviembre 2026'));assert(m.text.includes('no recibir nuevos correos de seguimiento'))
 assert(!/ejercicios|casco|tratamiento|resultado revisado por/i.test(m.text))
})
test('vista: escapa identidad y contenido sin introducir HTML ni enlaces clínicos en WhatsApp',()=>{
 const row=structuredClone(fictitiousRow);row.bebe='<script>private</script>';row.profesional='<img onerror=x>';row.indicadores[0].valor='<svg onload=x>'
 const m=followupPreview(row);assert(!m.html.includes('<script>'));assert(!m.html.includes('<img onerror'));assert(m.html.includes('&lt;script&gt;'))
 assert.equal(new URL(WHATSAPP_URL).search,'');assert(!m.html.includes('private</script>'))
})
test('vista: marca datos ficticios o privados fuera del cuerpo propuesto; no aprueba ni programa',()=>{
 const m=followupPreview(fictitiousRow)
 assert(previewPage(m,{fictitious:true}).includes('DATOS FICTICIOS'));assert(previewPage(m).includes('DATOS REALES · USO PRIVADO'))
 assert(!m.html.includes('DATOS FICTICIOS'));assert(previewPage(m).includes('No programado ni enviado'))
 for(const args of [[],['--send'],['--schedule'],['--privadas','--approve']])assert.throws(()=>parsePreviewArgs(args))
 assert.equal(parsePreviewArgs(['--ficticia']),'--ficticia')
})
