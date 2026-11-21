import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {runInNewContext} from "node:vm"
import {createRequire} from "node:module"
import {webcrypto} from "node:crypto"
import ts from "typescript"
import {CONTACT_CONSENT_VERSION,CONTACT_CONSENT_TEXT} from "../src/lib/results/contact-policy.ts"
const require=createRequire(import.meta.url)
const source=readFileSync(new URL("../src/components/ResultContactMail.tsx",import.meta.url),"utf8")
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
const flush=()=>new Promise(resolve=>setImmediate(resolve))
const snapshot={nombreBebe:"Bebé ficticio",fechaNacimiento:"2026-01-01",fechaEvaluacion:"2026-11-21T06:00:00Z",profesional:"Profesional ficticia",evento:null,numero:null,medidas:{ap:140,bp:120,di:135,dd:138},indiceCraneal:85.7,indiceAsimetria:3,diagnostico:"Guardado",recomendacion:"Guardada"}
function nodes(tree) {
 if(tree===null||tree===undefined||typeof tree==="boolean")return []
 if(Array.isArray(tree))return tree.flatMap(nodes)
 if(typeof tree!=="object")return [tree]
 return [tree,...nodes(tree.props?.children)]
}
const copy=(contexto="a".repeat(64),state="ACEPTADO")=>({id:"11111111-1111-4111-8111-111111111111",revision:1,contexto,datos:snapshot,destinatario:"contacto@example.invalid",nombreApoderado:"Apoderado ficticio",motivo:null,estado:state,createdAt:"2026-11-21T06:00:00Z",puedeReintentar:false})
function harness(changes={}) {
 const server={review:{revision:1,destinatario:"contacto@example.invalid",nombreApoderado:"Apoderado ficticio",contexto:"a".repeat(64),datos:snapshot,versionConsentimiento:CONTACT_CONSENT_VERSION,textos:CONTACT_CONSENT_TEXT,habilitado:true,motivoBloqueo:null,requiereMotivo:false,envios:[],...changes},mode:"accepted",failGet:false}
 const slots=[],pendingEffects=[];let index=0,tree,starts=0,finishes=0
 const depsEqual=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]))
 const hooks={
  useId:()=>"contact-fixture",
  useState(initial){const at=index++;if(!(at in slots))slots[at]=typeof initial==="function"?initial():initial;return [slots[at],value=>{slots[at]=typeof value==="function"?value(slots[at]):value}]},
  useRef(initial){const at=index++;return slots[at]??=( {current:initial})},
  useCallback(fn,deps){const at=index++;if(!depsEqual(slots[at]?.deps,deps))slots[at]={fn,deps};return slots[at].fn},
  useEffect(fn,deps){const at=index++;if(!depsEqual(slots[at]?.deps,deps)){slots[at]?.cleanup?.();slots[at]={deps};pendingEffects.push(()=>{slots[at].cleanup=fn()})}},
 }
 const calls=[]
 const fetch=async(url,options={})=>{
  calls.push({url,options})
  if(options.method!=="POST"){
   if(server.failGet)throw Error("GET interrumpido")
   return Response.json({contacto:structuredClone(server.review)})
  }
  const body=JSON.parse(options.body),sent={...copy(server.review.contexto,server.mode==="review"?"REVISION":"ACEPTADO"),id:body.id,motivo:body.motivo??null,destinatario:server.review.destinatario}
  server.review.envios=[sent,...server.review.envios.filter(row=>row.id!==sent.id)]
  if(server.mode==="accepted-lost")throw Error("Respuesta perdida")
  return Response.json({envio:sent,nueva:true},{status:server.mode==="review"?202:201})
 }
 const exports={}
 runInNewContext(compiled,{exports,crypto:webcrypto,AbortController,fetch,require:name=>name==="react"?hooks:name==="react/jsx-runtime"?require(name):name==="./ResultCard"?{ResultCard:()=>null}:(()=>{throw Error(`Unexpected dependency ${name}`)})()})
 const props={id:"evaluation",revision:1,disabled:false,onStart:()=>{starts++;return true},onFinish:()=>{finishes++}}
 const render=()=>{index=0;tree=exports.ResultContactMail(props);return tree}
 const find=predicate=>nodes(tree).find(node=>node&&typeof node==="object"&&predicate(node))
 const form=()=>find(node=>node.type==="form")
 const sendButton=()=>find(node=>node.type==="button"&&node.props.type==="submit")
 const postCalls=()=>calls.filter(call=>call.options.method==="POST")
 const input=(type,value)=>{const target=find(node=>node.type==="input"&&node.props.type===type);assert(target,`Missing input ${type}`);target.props.onChange({target:{value}});render()}
 const check=at=>{const target=nodes(tree).filter(node=>node?.type==="input"&&node.props.type==="checkbox")[at];assert(target);target.props.onChange({target:{checked:true}});render()}
 const confirm=()=>{input("email",server.review.destinatario);check(0);check(1)}
 const submit=async()=>{const target=form();assert(target);await target.props.onSubmit({preventDefault(){}});render()}
 const refresh=async()=>{const button=find(node=>node.type==="button"&&node.props.children==="Actualizar estado del contacto");assert(button);button.props.onClick();await flush();render()}
 const mount=async()=>{render();for(const effect of pendingEffects.splice(0))effect();await flush();render()}
 return {server,props,mount,render,find,form,sendButton,postCalls,input,check,confirm,submit,refresh,calls,text:()=>nodes(tree).filter(node=>typeof node==="string").join(" "),starts:()=>starts,finishes:()=>finishes}
}
test("contacto UI: requiere repetición exacta y dos casillas; envía únicamente contrato permitido una vez",async()=>{
 const h=harness();await h.mount();assert(h.form());assert.equal(h.postCalls().length,0);assert.equal(h.sendButton().props.disabled,true)
 h.input("email","otro@example.invalid");h.check(0);h.check(1);assert.equal(h.sendButton().props.disabled,true)
 h.input("email"," CONTACTO@example.invalid ");assert.equal(h.sendButton().props.disabled,false)
 const form=h.form();const first=form.props.onSubmit({preventDefault(){}}),second=form.props.onSubmit({preventDefault(){}})
 await Promise.all([first,second]);h.render()
 assert.equal(h.postCalls().length,1);assert.equal(h.starts(),1);assert.equal(h.finishes(),1)
 const body=JSON.parse(h.postCalls()[0].options.body)
 assert.deepEqual(Object.keys(body).sort(),["id","revision","contexto","correoRepetido","confirmarApoderado","autorizarCorreo","versionConsentimiento"].sort())
 assert.equal(body.confirmarApoderado,true);assert.equal(body.autorizarCorreo,true)
 assert.equal(h.form(),undefined);assert.match(h.text(),/aceptó esta copia/)
})
test("contacto UI: misma revisión con contexto distinto permite nueva autorización y exige motivo",async()=>{
 const old=copy("b".repeat(64));const h=harness({envios:[old]});await h.mount()
 assert(h.form());h.confirm();assert.equal(h.sendButton().props.disabled,true)
 h.find(node=>node.type==="textarea").props.onChange({target:{value:"Corregir correo con apoderado presente"}});h.render()
 assert.equal(h.sendButton().props.disabled,false);await h.submit()
 const body=JSON.parse(h.postCalls()[0].options.body)
 assert.notEqual(body.id,old.id);assert.equal(body.contexto,"a".repeat(64));assert.match(body.motivo,/Corregir correo/)
 assert.equal(h.server.review.envios.length,2)
})
test("contacto UI: solo oculta el formulario cuando revisión y contexto actuales ya tienen copia",async()=>{
 const h=harness({envios:[copy()]});await h.mount();assert.equal(h.form(),undefined)
 h.server.review.contexto="c".repeat(64);h.server.review.destinatario="corregido@example.invalid";await h.refresh()
 assert(h.form());assert.equal(h.sendButton().props.disabled,true)
 assert.equal(h.find(node=>node.type==="input"&&node.props.type==="email").props.value,"")
 assert(nodes(h.render()).filter(node=>node?.type==="input"&&node.props.type==="checkbox").every(node=>node.props.checked===false))
 assert(h.find(node=>node.type==="textarea"));assert.equal(h.postCalls().length,0)
})
test("contacto UI: respuesta perdida o incierta solo permite consultar, nunca repetir a ciegas",async()=>{
 for(const mode of ["accepted-lost","review"]){
  const h=harness();h.server.mode=mode;await h.mount();h.confirm();await h.submit()
  assert.equal(h.postCalls().length,1);assert.equal(h.form(),undefined)
  await h.refresh();assert.equal(h.postCalls().length,1);assert.equal(h.form(),undefined)
 }
})
test("contacto UI: edición pendiente, revisión obsoleta, permiso retirado o GET fallido bloquean envío",async()=>{
 const editing=harness();editing.props.disabled=true;await editing.mount();assert.equal(editing.form(),undefined)
 const stale=harness({revision:2});await stale.mount();assert.equal(stale.form(),undefined);assert.match(stale.text(),/revisión cambió/)
 const withdrawn=harness({habilitado:false,motivoBloqueo:"Autorización retirada"});await withdrawn.mount();assert.equal(withdrawn.form(),undefined);assert.match(withdrawn.text(),/Autorización retirada/)
 const failed=harness();await failed.mount();failed.confirm();failed.server.failGet=true;await failed.refresh();assert.equal(failed.form(),undefined)
 for(const h of [editing,stale,withdrawn,failed])assert.equal(h.postCalls().length,0)
})
test("contacto UI: un reintento confirmado usa la misma copia y pide nuevamente las dos casillas",async()=>{
 const row={...copy("a".repeat(64),"REINTENTABLE"),puedeReintentar:true}
 const h=harness({envios:[row]});await h.mount();assert(h.form());assert.equal(h.sendButton().props.disabled,true)
 h.confirm();await h.submit();assert.equal(JSON.parse(h.postCalls()[0].options.body).id,row.id)
 assert.equal(h.postCalls().length,1)
})
