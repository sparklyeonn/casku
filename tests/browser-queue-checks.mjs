import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { chromium, webkit, devices, expect as playwrightExpect } from "@playwright/test"
import { familyConsent } from "./privacy-fixtures.mjs"

const expect = playwrightExpect.configure({timeout:30000})

// Navegadores independientes del Chrome personal. Android/iPad son perfiles
// emulados: estas pruebas no certifican cámara, teclado ni hardware físicos.
export async function browserQueueChecks({db,base,accounts,password,admin,family,post,createEvent}) {
  const profiles=[
    {name:"chromium-desktop",engine:chromium,options:{viewport:{width:1440,height:900}}},
    {name:"android-chromium",engine:chromium,options:devices["Pixel 7"]},
    {name:"webkit-desktop",engine:webkit,options:{viewport:{width:1440,height:900}}},
    {name:"ipad-webkit",engine:webkit,options:devices["iPad (gen 7)"]},
  ]
  await mkdir("test-results/devices",{recursive:true})
  for(const [index,profile] of profiles.entries()) {
    const browser=await profile.engine.launch({headless:true})
    const receptionContext=await browser.newContext({...profile.options,baseURL:base})
    const kineContext=await browser.newContext({...profile.options,baseURL:base})
    let reception,kine
    const errors=[]
    try {
      // Observar recursos externos sin interceptar todas las peticiones: WebKit
      // puede producir errores de acceso al cancelar una navegación interceptada.
      // Los envíos del servidor permanecen bloqueados por el preload de prueba.
      for(const context of [receptionContext,kineContext]) {
        context.on("request",request=>{
          const url=new URL(request.url())
          if(!["localhost","127.0.0.1"].includes(url.hostname)) errors.push(`Recurso externo inesperado: ${url.origin}`)
        })
        await context.addInitScript(()=>{
          if(navigator.mediaDevices) navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException("Permiso denegado de prueba","NotAllowedError"))
        })
      }
      reception=await receptionContext.newPage();kine=await kineContext.newPage()
      for(const page of [reception,kine]) {page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(60000);page.on("pageerror",error=>errors.push(error.message))}
      async function login(page,account,path) {
        await page.goto("/login")
        await page.getByLabel("Correo",{exact:true}).fill(account.email)
        await page.getByLabel("Contraseña",{exact:true}).fill(password)
        await page.getByRole("button",{name:"Ingresar",exact:true}).click()
        await expect(page).toHaveURL(new RegExp(`${path}$`))
      }
      await login(reception,accounts[index*2],"/recepcion")
      await login(kine,accounts[index*2+1],"/kinesiologia")
      const event=await createEvent(admin,`Dispositivo ${profile.name}`,4)
      const parent=await family(`device-${index}@example.com`)
      const response=await parent.request("/api/familias/inscripciones",post({...familyConsent,id:randomUUID(),eventoId:event.id,nombreBebe:`Bebé de prueba ${profile.name}`,fechaNacimiento:"2026-01-01",nombreApoderado:"Familia de prueba"}))
      assert.equal(response.status,201)
      const row=(await response.json()).inscripcion
      const {qrToken}= (await db.query('SELECT "qrToken" FROM "Inscripcion" WHERE id=$1',[row.id])).rows[0]
      // El evento se creó después de ingresar; recargar y seleccionarlo en ambas vistas.
      for(const page of [reception,kine]) {
        await page.reload()
        const select=page.getByLabel("Evento de trabajo")
        await expect(select).toBeEnabled();await select.selectOption(event.id)
      }
      const lookup=reception.getByLabel("Número de inscripción o contenido del QR")
      await lookup.fill("99999")
      await reception.getByRole("button",{name:"Buscar inscripción",exact:true}).click()
      await expect(reception.locator("main").getByRole("alert")).toBeVisible()
      await lookup.fill(String(row.numero))
      await reception.getByRole("button",{name:"Buscar inscripción",exact:true}).click()
      await expect(reception.getByRole("heading",{name:row.bebe.nombre,exact:true})).toBeVisible()
      await reception.getByRole("button",{name:"Leer QR con cámara",exact:true}).click()
      await expect(reception.locator("main").getByRole("alert")).toContainText("No pudimos abrir la cámara")
      await reception.getByRole("button",{name:"Cerrar cámara",exact:true}).click()
      await lookup.fill(`CASKU:INSCRIPCION:${qrToken}`)
      await reception.getByRole("button",{name:"Buscar inscripción",exact:true}).click()
      const arrival=reception.getByRole("button",{name:"Confirmar llegada y agregar a la fila",exact:true})
      // El servidor confirma, pero se pierde la respuesta: reintentar no duplica.
      await reception.route("**/api/recepcion/llegadas",async route=>{await route.fetch();await route.abort("failed")},{times:1})
      await arrival.click();await expect(reception.locator("main").getByRole("alert")).toBeVisible()
      await arrival.click();await expect(reception.getByRole("status")).toContainText("ya estaba confirmada")
      assert.equal((await db.query('SELECT count(*)::int n FROM "EntradaFila" WHERE "inscripcionId"=$1',[row.id])).rows[0].n,1)
      await noOverflow(reception,profile.name+" recepción")
      await reception.screenshot({path:`test-results/devices/${profile.name}-recepcion.png`,fullPage:true})
      await kine.getByRole("button",{name:"Actualizar mi atención",exact:true}).click()
      const call=kine.getByRole("button",{name:"Llamar al siguiente",exact:true})
      await expect(call).toBeEnabled()
      await kine.route("**/api/kinesiologia/llamar",async route=>{await route.fetch();await route.abort("failed")},{times:1})
      await call.click()
      // La consulta posterior recupera la atención asignada a pesar de la pérdida.
      await expect(kine.getByRole("link",{name:"Abrir formulario de craneometría",exact:true})).toBeVisible()
      await kine.reload()
      await expect(kine.getByRole("heading",{name:new RegExp(row.bebe.nombre)})).toBeVisible()
      await kine.getByRole("button",{name:"No respondió al llamado",exact:true}).click()
      await expect(kine.getByRole("status")).toContainText("marcada ausente")
      await reception.getByRole("button",{name:"Buscar otra inscripción",exact:true}).click()
      await lookup.fill(String(row.numero));await reception.getByRole("button",{name:"Buscar inscripción",exact:true}).click()
      await reception.getByRole("button",{name:"Confirmar regreso y reincorporar",exact:true}).click()
      await expect(reception.getByRole("status")).toContainText("reincorporada")
      await kine.getByRole("button",{name:"Actualizar mi atención",exact:true}).click();await expect(call).toBeEnabled();await call.click()
      await expect(kine.getByRole("link",{name:"Abrir formulario de craneometría",exact:true})).toBeVisible()
      await noOverflow(kine,profile.name+" kinesiología")
      await kine.screenshot({path:`test-results/devices/${profile.name}-kinesiologia.png`,fullPage:true})
      await kine.getByRole("link",{name:"Abrir formulario de craneometría",exact:true}).click()
      const name=kine.getByPlaceholder("Nombre del bebé",{exact:true})
      await expect(name).toHaveValue(row.bebe.nombre);await expect(name).toHaveAttribute("readonly","")
      for(const [i,value] of ["140","120","135","138"].entries()) await kine.getByRole("spinbutton").nth(i).fill(value)
      await noOverflow(kine,profile.name+" formulario")
      await kine.getByRole("button",{name:"Guardar evaluación",exact:true}).click()
      await expect(kine.getByRole("status").filter({hasText:"Evaluación guardada y atención finalizada"})).toBeVisible()
      assert.equal((await db.query('SELECT count(*)::int n FROM "Evaluacion" e JOIN "EntradaFila" f ON f.id=e."filaId" WHERE f."inscripcionId"=$1',[row.id])).rows[0].n,1)
      await kine.screenshot({path:`test-results/devices/${profile.name}-evaluacion.png`,fullPage:true})
      await kine.getByRole("link",{name:"Volver y llamar al siguiente bebé",exact:true}).click()
      await expect(kine.getByRole("button",{name:"Llamar al siguiente",exact:true})).toBeDisabled()
      assert.deepEqual(errors,[],"No deben producirse excepciones JavaScript")
      console.log(`OK navegador ${profile.name}: acceso, número/QR, cámara denegada, respuesta perdida, recarga, ausencia/regreso y guardado sin duplicados ni desborde.`)
    } catch(error) {
      await Promise.allSettled([reception?.screenshot({path:`test-results/devices/${profile.name}-error-recepcion.png`,fullPage:true}),kine?.screenshot({path:`test-results/devices/${profile.name}-error-kinesiologia.png`,fullPage:true})])
      throw error
    } finally {await receptionContext.close();await kineContext.close();await browser.close()}
  }
}
async function noOverflow(page,description) {
  const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}))
  assert(dimensions.scroll<=dimensions.width+1,`${description}: desborde horizontal ${dimensions.scroll}/${dimensions.width}`)
}
