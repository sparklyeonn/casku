import test from 'node:test'
import assert from 'node:assert/strict'
import {resultListLabel} from '../src/lib/results/list-state.ts'
test('resultados: diferencia copia de contacto aceptada de publicación en cuenta',()=>{
 assert.match(resultListLabel('BORRADOR',false,undefined,{estado:'ACEPTADO',revision:1,actual:true}),/aceptada para envío/)
 assert.doesNotMatch(resultListLabel('BORRADOR',false,undefined,{estado:'ACEPTADO',revision:1,actual:true}),/Solo visible/)
 assert.match(resultListLabel('BORRADOR',false,undefined,{estado:'ACEPTADO',revision:1,actual:false}),/copia anterior/)
 assert.match(resultListLabel('BORRADOR',false,undefined,{estado:'REVISION',revision:1,actual:true}),/por confirmar/)
 assert.match(resultListLabel('PUBLICADO',false,2,{estado:'ACEPTADO',revision:1,actual:false}),/Publicado.*2/)
 assert.match(resultListLabel('RETIRADO',false),/No utilizar/)
})
