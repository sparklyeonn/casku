import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mailAction,mailFilters,mailId,mailType,pageNumber,MailAdminError } from "../src/lib/mail-admin/input.ts"
const action={id:randomUUID(),accion:"REVISAR",motivo:"REVISION_PROVEEDOR",revision:0,huella:"a".repeat(32)}
test("Gestión de correos: filtros y referencias acotados sin entradas SQL libres",()=>{
 assert.equal(mailFilters(new URLSearchParams()).pagina,1);assert.equal(mailFilters(new URLSearchParams('estado=REBOTES&tipo=CLINICO')).tipo,"CLINICO")
 for(const query of ['tipo=__proto__','eventoId=1%27%20OR%201=1','estado=ENVIAR','seguimiento=ignorar','pagina=-1','pagina=0','pagina=100000'])assert.throws(()=>mailFilters(new URLSearchParams(query)),MailAdminError)
 assert.throws(()=>mailId("abc"),MailAdminError);assert.throws(()=>mailType("familia"),MailAdminError);assert.throws(()=>pageNumber("1.5"),MailAdminError)
})
test("Gestión de correos: acción con versión, huella, motivo cerrado y confirmación explícita",()=>{
 assert.equal(mailAction(action).revision,0)
 for(const values of [{accion:"DESBLOQUEAR"},{motivo:"correo@example.com"},{revision:-1},{huella:"token privado"},{id:"falso"},{accion:"CERRAR"},{accion:"REINTENTAR_CONFIRMACION",confirmado:false}])assert.throws(()=>mailAction({...action,...values}),MailAdminError)
 assert.equal(mailAction({...action,accion:"CERRAR",confirmado:true}).accion,"CERRAR")
})
