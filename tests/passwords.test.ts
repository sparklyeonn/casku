import test from "node:test"
import assert from "node:assert/strict"
import { passwordInput } from "../src/lib/team-passwords/input.ts"
const data={actual:"Clave-actual-de-prueba",nueva:"Una-nueva-clave-segura",confirmacion:"Una-nueva-clave-segura"}
test("contraseñas: longitud, confirmación y clave actual explícitas sin aceptar privilegios",()=>{
 assert.deepEqual(passwordInput({...data,role:"ADMIN",mustChangePassword:false},true),{actual:data.actual,nueva:data.nueva,token:null})
 for(const raw of [null,[],{...data,actual:""},{...data,nueva:"corta",confirmacion:"corta"},{...data,confirmacion:"otra"},{...data,nueva:"x".repeat(129)}])assert.throws(()=>passwordInput(raw,true))
})
test("recuperación: token aleatorio completo y nueva clave confirmada, sin elegir cuenta",()=>{
 const token="a".repeat(43)
 assert.deepEqual(passwordInput({...data,token,cuentaId:"otra"},false),{actual:null,nueva:data.nueva,token})
 for(const value of [undefined,"", "x".repeat(42),"x".repeat(44),"/".repeat(43)])assert.throws(()=>passwordInput({...data,token:value},false))
})
