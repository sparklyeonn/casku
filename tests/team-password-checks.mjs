import assert from "node:assert/strict"
import {randomBytes,randomUUID,createHmac} from "node:crypto"
export async function teamPasswordChecks({db,client,signIn,admin,anonymous,f1,post,mails,secret,production,setFailure}) {
 const own="/api/equipo/clave",requestPath="/api/equipo/recuperacion/solicitar",consume="/api/equipo/recuperacion/confirmar",accountsPath="/api/administracion/cuentas"
 const hash=value=>createHmac("sha256",secret).update(value).digest("hex")
 const session=async request=>(await (await request("/api/auth/session")).json())?.user
 async function json(request,path,options,code=200){const response=await request(path,options),body=await response.json();assert.equal(response.status,code,`${path}: ${JSON.stringify(body)}`);return body}
 const fresh=async(email,key)=>{const request=client();await signIn(request,"equipo",{email,password:key});return request}
 async function current(id){return (await db.query('SELECT * FROM "CuentaEquipo" WHERE id=$1',[id])).rows[0]}
 async function patch(account,changes){return (await json(admin,`${accountsPath}/${account.id}`,{...post({...account,password:"",...changes}),method:"PATCH"})).cuenta}
 async function create(role) {
  const key=randomBytes(24).toString("base64url"),email=`password-${randomUUID()}@example.com`
  const account=(await json(admin,accountsPath,post({id:randomUUID(),name:`Contraseñas ${role}`,email,role,active:true,password:key,mustChangePassword:false}),201)).cuenta
  assert.equal(account.mustChangePassword,true,"El cliente no puede quitar la marca de contraseña temporal")
  const request=await fresh(email,key)
  assert.equal((await session(request)).mustChangePassword,true)
  for(const path of ["/api/eventos","/api/recepcion/eventos","/api/kinesiologia/eventos","/api/administracion/cuentas","/api/datos-familias/eventos"])assert.equal((await request(path)).status,401)
  assert.equal((await request("/api/evaluaciones",post({}))).status,401)
  const html=await (await request("/equipo/cambiar-clave")).text();assert(html.includes("Debes cambiar tu contraseña temporal"))
  const redirect=await request("/administracion");assert((redirect.headers.get("location")||await redirect.text()).includes("/equipo/cambiar-clave"))
  const chosen=randomBytes(24).toString("base64url")
  await json(request,own,post({actual:key,nueva:chosen,confirmacion:chosen,role:"ADMIN",cuentaId:"otra",mustChangePassword:false}))
  assert(!(await session(request)));assert(!(await session(await fresh(email,key))))
  const active=await fresh(email,chosen);assert.equal((await session(active)).mustChangePassword,false);assert.equal((await session(active)).role,role)
  assert.equal((await active("/api/evaluaciones",post({}))).status,role==="KINESIOLOGO"?400:403)
  return {account:await current(account.id),key:chosen,request:active}
 }
 await json(anonymous,own,post({}),401);await json(f1.request,own,post({}),401)
 await json(anonymous,requestPath,{...post({email:"equipo@example.com"}),headers:{"Content-Type":"application/json",origin:"https://sitio-no-autorizado.example"}},403)
 await json(anonymous,requestPath,post({email:"correo inválido"}),400)
 const kine=await create("KINESIOLOGO"),reception=await create("RECEPCION"),secondAdmin=await create("ADMIN")
 // Cambiar la contraseña exige la actual y revoca las cookies en todos los dispositivos.
 const another=await fresh(kine.account.email,kine.key)
 await json(kine.request,own,post({actual:"clave-incorrecta",nueva:randomBytes(24).toString("base64url"),confirmacion:"diferente"}),400)
 await json(kine.request,own,post({actual:"clave-incorrecta",nueva:"Clave-elegida-de-prueba",confirmacion:"Clave-elegida-de-prueba"}),400)
 await json(kine.request,own,post({actual:kine.key,nueva:kine.key,confirmacion:kine.key}),400)
 const keys=[randomBytes(24).toString("base64url"),randomBytes(24).toString("base64url")]
 const racing=await Promise.all([kine.request(own,post({actual:kine.key,nueva:keys[0],confirmacion:keys[0]})),another(own,post({actual:kine.key,nueva:keys[1],confirmacion:keys[1]}))])
 assert.equal(racing.filter(row=>row.status===200).length,1);assert(racing.every(row=>[200,401,403,409].includes(row.status)))
 kine.key=keys[racing[0].status===200?0:1];kine.account=await current(kine.account.id)
 assert(!(await session(kine.request)));assert(!(await session(another)));kine.request=await fresh(kine.account.email,kine.key)
 assert.equal((await session(kine.request)).id,kine.account.id)
 console.log("OK claves temporales: tres perfiles restringidos en servidor, cambio propio con contraseña actual, rechazo de claves iguales, revocación de sesiones y cambios simultáneos sin pisarse.")
 const recoveryMails=()=>mails.filter(row=>row.subject==="Recupera tu contraseña del equipo Casku")
 const countBefore=recoveryMails().length
 const known=await json(anonymous,requestPath,post({email:reception.account.email}),202),unknown=await json(anonymous,requestPath,post({email:"sin-cuenta-equipo@example.com"}),202),familyOnly=await json(anonymous,requestPath,post({email:f1.user.email}),202)
 assert.deepEqual(known,unknown);assert.deepEqual(known,familyOnly)
 assert(!JSON.stringify(known).match(/token|cuentaId|desafio|navegador|passwordHash/))
 if(production){assert.equal(recoveryMails().length,countBefore);assert.equal((await db.query('SELECT count(*)::int n FROM "RecuperacionClave"')).rows[0].n,0,"Producción no genera enlaces ni correos sin Brevo")}
 else assert.equal(recoveryMails().length,countBefore+1)
 async function issue(account) {
  if(production) {
   const token=randomBytes(32).toString("base64url"),row=await current(account.id)
   await db.query(`UPDATE "RecuperacionClave" SET estado='ANULADA' WHERE "cuentaId"=$1 AND estado IN ('ACTIVA','PENDIENTE')`,[row.id])
   await db.query(`INSERT INTO "RecuperacionClave" (id,"cuentaId","tokenHash","versionCuenta",estado,"expiraAt") VALUES ($1,$2,$3,$4,'ACTIVA',CURRENT_TIMESTAMP+interval '30 minutes')`,[randomUUID(),row.id,hash(`team-recovery:${token}`),row.version])
   return token
  }
  await json(anonymous,requestPath,post({email:account.email}),202)
  const mail=recoveryMails().filter(row=>[].concat(row.to).includes(account.email)).at(-1)
  assert(mail)
  const match=mail.text.match(/http[^\s]+#token=([A-Za-z0-9_-]{43})/);assert(match)
  const link=new URL(match[0]);assert.equal(link.search,"");assert.equal(link.pathname,"/recuperar-clave");assert(!link.toString().includes(account.email))
  return match[1]
 }
 const expireRequestLimit=async account=>db.query('UPDATE "LimiteSolicitud" SET "expiraAt"=CURRENT_TIMESTAMP-interval \'1 second\' WHERE clave=$1',[hash(`team-auth:password:request:key:${account.email}`)])
 // Un fallo de envío no sustituye un enlace válido ni cambia credenciales/sesiones.
 await expireRequestLimit(reception.account)
 const token1=await issue(reception.account)
 if(!production) {
  setFailure(true);await json(anonymous,requestPath,post({email:reception.account.email}),202);setFailure(false)
  assert.equal((await db.query('SELECT estado FROM "RecuperacionClave" WHERE "tokenHash"=$1',[hash(`team-recovery:${token1}`)])).rows[0].estado,"ACTIVA")
 }
 await expireRequestLimit(reception.account)
 const token2=await issue(reception.account)
 await json(anonymous,consume,post({token:token1,nueva:"Una-clave-nueva-de-prueba",confirmacion:"Una-clave-nueva-de-prueba"}),400)
 await db.query(`UPDATE "RecuperacionClave" SET "createdAt"=CURRENT_TIMESTAMP-interval '31 minutes',"expiraAt"=CURRENT_TIMESTAMP-interval '1 second' WHERE "tokenHash"=$1`,[hash(`team-recovery:${token2}`)])
 await json(anonymous,consume,post({token:token2,nueva:"Una-clave-nueva-de-prueba",confirmacion:"Una-clave-nueva-de-prueba"}),400)
 const oldVersion=(await current(reception.account.id)).version,oldKey=reception.key,token3=await issue(reception.account),newKey=randomBytes(24).toString("base64url")
 await json(anonymous,consume,post({token:token3,nueva:oldKey,confirmacion:oldKey}),400)
 await json(anonymous,consume,post({token:token3,nueva:newKey,confirmacion:newKey,cuentaId:secondAdmin.account.id,role:"ADMIN"}))
 reception.key=newKey;reception.account=await current(reception.account.id)
 assert.equal(reception.account.version,oldVersion+1);assert.equal(reception.account.role,"RECEPCION");assert.equal(reception.account.mustChangePassword,false)
 assert(!(await session(reception.request)));assert(!(await session(await fresh(reception.account.email,oldKey))))
 reception.request=await fresh(reception.account.email,newKey);assert.equal((await session(reception.request)).id,reception.account.id)
 await json(anonymous,consume,post({token:token3,nueva:randomBytes(24).toString("base64url"),confirmacion:"no coincide"}),400)
 await json(anonymous,consume,post({token:token3,nueva:"Otra-clave-para-prueba",confirmacion:"Otra-clave-para-prueba"}),400)
 await expireRequestLimit(reception.account)
 const token4=await issue(reception.account),newKeys=[randomBytes(24).toString("base64url"),randomBytes(24).toString("base64url")]
 const race=await Promise.all(newKeys.map(key=>anonymous(consume,post({token:token4,nueva:key,confirmacion:key}))))
 assert.deepEqual(race.map(row=>row.status).sort(),[200,400]);reception.key=newKeys[race[0].status===200?0:1]
 reception.request=await fresh(reception.account.email,reception.key);assert.equal((await session(reception.request)).role,"RECEPCION")
 console.log("OK recuperación: respuesta genérica, enlaces con hash/vencimiento, reemplazo tras entrega, fallo sin anular el anterior, uso único concurrente y sin elegir otro perfil o cuenta.")
 // Una edición administrativa o desactivación invalida los enlaces emitidos.
 const beforeEdit=await issue(secondAdmin.account)
 secondAdmin.account=await patch(secondAdmin.account,{name:"Administradora de prueba corregida"})
 await json(anonymous,consume,post({token:beforeEdit,nueva:"Nueva-clave-para-prueba",confirmacion:"Nueva-clave-para-prueba"}),400)
 const beforeDisable=await issue(secondAdmin.account)
 secondAdmin.account=await patch(secondAdmin.account,{active:false})
 const disabledMessage=await json(anonymous,requestPath,post({email:secondAdmin.account.email}),202);assert.deepEqual(disabledMessage,known)
 await json(anonymous,consume,post({token:beforeDisable,nueva:"Nueva-clave-para-prueba",confirmacion:"Nueva-clave-para-prueba"}),400)
 // La auditoría forma parte de la transacción: no se pierde la clave ni la sesión si falla.
 await db.query('UPDATE "LimiteSolicitud" SET "expiraAt"=CURRENT_TIMESTAMP-interval \'1 second\' WHERE clave=$1',[hash(`team-auth:password:own:key:${kine.account.id}`)])
 const before=await current(kine.account.id),versionBefore=before.version
 await db.exec(`CREATE FUNCTION fail_password_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER password_failure BEFORE INSERT ON "CambioCuentaEquipo" FOR EACH ROW EXECUTE FUNCTION fail_password_audit();`)
 await json(kine.request,own,post({actual:kine.key,nueva:"Clave-nueva-con-auditoria",confirmacion:"Clave-nueva-con-auditoria"}),503)
 assert.equal((await current(kine.account.id)).version,versionBefore);assert.equal((await current(kine.account.id)).passwordHash,before.passwordHash);assert.equal((await session(kine.request)).id,kine.account.id)
 await db.exec('DROP TRIGGER password_failure ON "CambioCuentaEquipo"; DROP FUNCTION fail_password_audit();')
 // Un fallo de auditoría tampoco consume el enlace de recuperación.
 const auditedToken=await issue(kine.account),auditedHash=hash(`team-recovery:${auditedToken}`)
 await db.exec(`CREATE FUNCTION fail_password_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER password_failure BEFORE INSERT ON "CambioCuentaEquipo" FOR EACH ROW EXECUTE FUNCTION fail_password_audit();`)
 await json(anonymous,consume,post({token:auditedToken,nueva:"Clave-para-recuperacion-auditada",confirmacion:"Clave-para-recuperacion-auditada"}),503)
 assert.equal((await current(kine.account.id)).version,versionBefore)
 assert.equal((await db.query('SELECT estado FROM "RecuperacionClave" WHERE "tokenHash"=$1',[auditedHash])).rows[0].estado,"ACTIVA")
 await db.exec('DROP TRIGGER password_failure ON "CambioCuentaEquipo"; DROP FUNCTION fail_password_audit();')
 const audit=JSON.stringify((await db.query('SELECT * FROM "CambioCuentaEquipo" WHERE "cuentaId"=ANY($1)',[[kine.account.id,reception.account.id,secondAdmin.account.id]])).rows)
 for(const value of [kine.key,reception.key,token1,token2,token3,token4])assert(!audit.includes(value))
 const stored=JSON.stringify((await db.query('SELECT * FROM "RecuperacionClave"')).rows,(_,value)=>typeof value==="bigint"?value.toString():value)
 for(const value of [token1,token2,token3,token4])assert(!stored.includes(value))
 assert.equal((await anonymous("/recuperar-clave")).status,200)
 console.log("OK consistencia: cambios administrativos invalidan enlaces, sesión y claves se conservan al fallar auditoría, secretos ausentes de respuestas/historial y correo real desactivado.")
}
