import { teamNavigate } from "./team-navigation.mjs"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {mkdir} from "node:fs/promises"
import {chromium,webkit,devices,expect as pwExpect} from "@playwright/test"
import {hashPassword} from "../src/lib/passwords.mjs"
const expect=pwExpect.configure({timeout:30000})
export async function browserMailAdminChecks({db,base,password,fixture}){
 const profiles=[{name:"desktop-chromium",engine:chromium,options:{viewport:{width:1440,height:1000}}},{name:"android-chromium",engine:chromium,options:devices["Pixel 7"]},{name:"desktop-webkit",engine:webkit,options:{viewport:{width:1440,height:1000}}},{name:"ipad-webkit",engine:webkit,options:devices["iPad (gen 7)"]}]
 await mkdir("test-results/mail-admin",{recursive:true})
 for(const profile of profiles){
  const id=randomUUID(),email=`browser-mail-${id}@example.com`
  await db.query(`INSERT INTO "CuentaEquipo" (id,email,name,role,"passwordHash",active,"mustChangePassword",version,"updatedAt") VALUES ($1,$2,'Administración navegador','ADMIN',$3,true,false,1,CURRENT_TIMESTAMP)`,[id,email,await hashPassword(password)])
  const browser=await profile.engine.launch({headless:true}),context=await browser.newContext({...profile.options,baseURL:base})
  const errors=[]
  try{
   context.on("request",request=>{if(!["localhost","127.0.0.1"].includes(new URL(request.url()).hostname))errors.push("Recurso externo inesperado")})
   const page=await context.newPage();page.setDefaultTimeout(30000);page.on("pageerror",error=>errors.push(error.message))
   await page.goto('/login');await page.getByLabel('Correo',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).toHaveURL(/\/administracion$/)
   await teamNavigate(page,'Correos');await expect(page.getByRole('heading',{name:'Gestión de correos',exact:true})).toBeVisible()
   await page.getByRole('combobox',{name:/^Evento/}).selectOption(fixture.eventId)
   await expect(page.getByRole('button',{name:'Ver detalle',exact:true})).toHaveCount(1)
   await page.getByRole('button',{name:'Ver detalle',exact:true}).click()
   const detail=page.getByRole('region',{name:'Detalle del correo'})
   await expect(detail).toBeVisible();await expect(detail.getByRole('button',{name:'Reintentar confirmación',exact:true})).toBeDisabled()
   await page.getByLabel('Motivo de la acción').selectOption('SEGUIMIENTO_REALIZADO')
   await page.getByLabel('Confirmo el cierre de revisión o la solicitud de reintento seleccionada.').check()
   const action=page.waitForResponse(response=>response.url().includes('/api/administracion/correos/mensajes/CONFIRMACION/')&&response.request().method()==='POST')
   await detail.getByRole('button',{name:'Cerrar revisión',exact:true}).click();assert.equal((await action).status(),200)
   await expect(detail.getByText(/Seguimiento: Revisión cerrada/)).toBeVisible()
   const current=await context.request.get(`/api/administracion/correos/mensajes/CONFIRMACION/${fixture.confirmationId}`)
   const result=await current.json();assert.equal(result.correo.estado,'ACEPTADO');assert.equal(result.correo.entrega,'QUEJA');assert(result.correo.suprimido)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`Sin desbordamiento en ${profile.name}`)
   await page.screenshot({path:`test-results/mail-admin/${profile.name}.png`,fullPage:true})
   await detail.getByRole('button',{name:'Reabrir revisión',exact:true}).click();await expect(detail.getByText(/Seguimiento: En revisión/)).toBeVisible()
   assert.deepEqual(errors,[])
   console.log(`OK navegador de correos ${profile.name}: filtros, detalle, cierre/reapertura, bloqueos conservados y sin desbordamiento.`)
  } finally{await context.close();await browser.close()}
 }
}
