import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { chromium, webkit, devices, expect as pwExpect } from "@playwright/test"
const expect = pwExpect.configure({ timeout: 30000 })
export async function browserCalendlyHolds({ base, password, account, admin, post, bookingFixtures, db }) {
 const profiles = [
  { name:"desktop-chromium", engine:chromium, options:{viewport:{width:1440,height:1000}} },
  { name:"android-chromium", engine:chromium, options:devices["Pixel 7"] },
  { name:"desktop-webkit", engine:webkit, options:{viewport:{width:1440,height:1000}} },
  { name:"ipad-webkit", engine:webkit, options:devices["iPad (gen 7)"] },
  { name:"small-dark-chromium", engine:chromium, options:{viewport:{width:320,height:740},colorScheme:"dark"} },
 ]
 await mkdir("test-results/calendly-holds",{recursive:true})
 const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago"}).format(new Date())
 for(const [index,profile] of profiles.entries()) {
  const fecha=new Date(Date.parse(today+"T12:00:00Z")+(index+1)*86400000).toISOString().slice(0,10),id=randomUUID()
  const event={id,nombre:"Protección visual "+profile.name,fecha,lugar:"Recinto ficticio",cupos:2}
  assert.equal((await admin("/api/eventos",post(event))).status,201)
  const reservaId="visual-"+randomUUID(),invitadoId="visual-"+randomUUID(),inicio=new Date(fecha+"T15:00:00Z")
  bookingFixtures.set(reservaId,{invitadoId,inicio,fin:new Date(inicio.getTime()+600000)})
  const browser=await profile.engine.launch({headless:true}),context=await browser.newContext({...profile.options,baseURL:base})
  const errors=[]
  let page
  try {
   page=await context.newPage();page.on("pageerror",error=>errors.push(error.message))
   await page.goto("/login");await page.getByLabel("Correo",{exact:true}).fill(account.email);await page.getByLabel("Contraseña",{exact:true}).fill(password)
   await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).toHaveURL(/\/recepcion$/)
   await page.goto("/agenda")
   const main=page.getByRole("main")
   await expect(main.getByRole("heading",{name:"Agenda de citas",exact:true})).toBeVisible()
   await main.getByLabel("Día de atención",{exact:true}).fill(fecha)
   const panel=main.getByRole("region",{name:"Protección anticipada de cupos",exact:true})
   await panel.getByLabel("Jornada de Casku",{exact:true}).selectOption(id)
   await expect(panel.getByRole("button",{name:"Vincular reservas y proteger cupos",exact:true})).toBeDisabled()
   await panel.getByRole("checkbox").check()
   await panel.getByRole("button",{name:"Vincular reservas y proteger cupos",exact:true}).click()
   await expect(panel.getByRole("status")).toContainText("Cupos de Calendly pendientes de llegada: 1")
   await expect(panel.getByRole("status")).toContainText("Cupos libres: 1")
   await panel.getByRole("button",{name:"Actualizar protección de cupos",exact:true}).click()
   await expect(panel.getByRole("button",{name:"Actualizar protección de cupos",exact:true})).toBeEnabled()
   assert.equal((await db.query('SELECT count(*)::int n FROM "ReservaCupoCalendly" WHERE "eventoId"=$1',[id])).rows[0].n,1)
   assert.equal((await db.query('SELECT count(*)::int n FROM "Inscripcion" WHERE "eventoId"=$1',[id])).rows[0].n,0)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
   assert.deepEqual(errors,[])
   await page.screenshot({path:`test-results/calendly-holds/${profile.name}.png`,fullPage:true})
   console.log(`OK protección anticipada ${profile.name}: activación consciente, cupo previo a la llegada, actualización idempotente y sin desbordamiento.`)
  } catch(error) { await page?.screenshot({path:`test-results/calendly-holds/${profile.name}-error.png`,fullPage:true}); throw error } finally {await context.close();await browser.close()}
 }
}
