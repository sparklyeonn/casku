import test from 'node:test'
import assert from 'node:assert/strict'
import {parse} from 'dotenv'
import {encodeEnvironment} from '../scripts/lib/brevo-env.mjs'
test('Brevo: archivo privado conserva exactamente secretos con #, espacios y comillas',()=>{
 for(const value of ['secreto#no-es-comentario',' Casku # equipo ','secreto"con#comilla',"secreto'con#comilla",'secreto\\n#literal'])assert.equal(parse(encodeEnvironment({PRIVATE_TEST_VALUE:value})).PRIVATE_TEST_VALUE,value)
 assert.throws(()=>encodeEnvironment({PRIVATE_TEST_VALUE:'valor\nno permitido'}))
 assert.throws(()=>encodeEnvironment({'BAD=KEY':'valor'}))
})
