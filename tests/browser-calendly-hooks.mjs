import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium, webkit, devices, expect as pwExpect } from "@playwright/test"
const expect=pwExpect.configure({timeout:30000})
export async function browserCalendlyHooks({base,password,adminAccount}){
 const profiles=[
  {name:"desktop-chromium",engine:chromium,options:{viewport:{width:1440,height:1000}}},
  {name:"android-chromium",engine:chromium,options:devices["Pixel 7"]},
  {name:"desktop-webkit",engine:webkit,options:{viewport:{width:1440,height:1000}}},
  {name:"ipad-webkit",engine:webkit,options:devices["iPad (gen 7)"]},
  {name:"small-dark-chromium",engine:chromium,options:{viewport:{width:320,height:740},colorScheme:"dark"}},
 ]
 await mkdir("test-results/calendly-hooks",{recursive:true})
 for(const profile of profiles){
  const browser=await profile.engine.launch({headless:true}),context=await browser.newContext({...profile.options,baseURL:base});let page
  const errors=[]
  try{
   page=await context.newPage();page.on("pageerror",error=>errors.push(error.message))
   await page.goto("/login");await page.getByLabel("Correo",{exact:true}).fill(adminAccount.email);await page.getByLabel("Contraseña",{exact:true}).fill(password)
   await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).toHaveURL(/\/administracion$/)
   await page.goto("/administracion/calendly")
   const panel=page.getByRole("main").getByRole("region",{name:"Avisos automáticos de Calendly",exact:true})
   await expect(panel.getByText("Conexión automática verificada. Puede funcionar con el panel cerrado.",{exact:true})).toBeVisible()
   await panel.getByRole("button",{name:"Verificar conexión y reintentar",exact:true}).click()
   await expect(panel.getByRole("button",{name:"Verificar conexión y reintentar",exact:true})).toBeEnabled()
   await expect(panel.getByRole("alert")).toHaveCount(0)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
   assert.deepEqual(errors,[])
   await page.screenshot({path:`test-results/calendly-hooks/${profile.name}.png`,fullPage:true})
   console.log(`OK avisos automáticos ${profile.name}: estado privado, verificación y reintento sin correos ni desbordamiento.`)
  }catch(error){await page?.screenshot({path:`test-results/calendly-hooks/${profile.name}-error.png`,fullPage:true});throw error}finally{await context.close();await browser.close()}
 }
}
