import test from "node:test"
import assert from "node:assert/strict"
import { parsePrivacy, paperDeclaration, PRIVACY_VERSION } from "../src/lib/privacy/policy.ts"
const choice={version:PRIVACY_VERSION,datos:true,correoResultados:false,seguimiento:false}
test("privacidad: registro requiere aceptación explícita y versión vigente; los correos son opcionales",()=>{
 assert.deepEqual(parsePrivacy(choice),choice)
 for(const value of [undefined,{}, {...choice,version:"antigua"},{...choice,datos:false},{...choice,datos:"true"},{...choice,seguimiento:undefined}])assert.throws(()=>parsePrivacy(value))
 assert.deepEqual(parsePrivacy({...choice,datos:false},false),{...choice,datos:false})
 assert.throws(()=>parsePrivacy({...choice,datos:false,correoResultados:true},false))
 assert.throws(()=>parsePrivacy({...choice,seguimiento:true}))
 assert.equal(parsePrivacy({...choice,correoResultados:true,seguimiento:true}).seguimiento,true)
})
test("privacidad presencial: exige declaración documentada, apoderado y referencia; no acepta una marca aislada",()=>{
 assert.deepEqual(paperDeclaration({documentada:true,declarante:"Apoderado ficticio",referencia:"DOC-TEST-01"}),{declarante:"Apoderado ficticio",referencia:"DOC-TEST-01"})
 for(const row of [{},{documentada:true},{documentada:false,declarante:"Apoderado",referencia:"DOC"},{documentada:true,declarante:"A",referencia:"DOC"},{documentada:true,declarante:"Apoderado",referencia:"x".repeat(101)}])assert.throws(()=>paperDeclaration(row))
})
