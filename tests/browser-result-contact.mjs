import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium, webkit, devices, expect as pwExpect } from "@playwright/test"

const expect = pwExpect.configure({ timeout: 30000 })
export async function browserResultContactChecks({ db, base, email, password, createFixture, resetGlobalLogin, mails, mailAttempts }) {
  assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname), "La UI de pruebas solo usa el servidor local del runner")
  const profiles = [
    { name: "desktop-chromium", engine: chromium, options: { viewport: { width: 1440, height: 1000 } } },
    { name: "android-chromium", engine: chromium, options: devices["Pixel 7"] },
    { name: "desktop-webkit", engine: webkit, options: { viewport: { width: 1440, height: 1000 } } },
    { name: "ipad-webkit", engine: webkit, options: devices["iPad (gen 7)"] },
    { name: "small-320-chromium", engine: chromium, options: { viewport: { width: 320, height: 740 }, colorScheme: "dark", reducedMotion: "reduce" } },
  ]
  await mkdir("test-results/result-contact", { recursive: true })
  // Crear los casos antes de los ingresos de navegador: el límite real de sesiones
  // puede revocar la sesión API original al abrir los últimos dispositivos.
  const fixtures = new Map()
  for (const profile of profiles) fixtures.set(profile.name, await createFixture(profile.name))
  for (const profile of profiles) {
    const fixture = fixtures.get(profile.name)
    await resetGlobalLogin()
    const path = `/api/kinesiologia/resultados/${fixture.id}/contacto`
    const browser = await profile.engine.launch({ headless: true })
    let context, page
    const errors = [], external = [], submissions = []
    try {
      context = await browser.newContext({ ...profile.options, baseURL: base })
      await context.route("**/*", async route => {
        const url = new URL(route.request().url())
        if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol)) return route.continue()
        external.push(url.origin)
        await route.abort("blockedbyclient")
      })
      page = await context.newPage(); page.setDefaultTimeout(30000)
      page.on("pageerror", error => errors.push(error.message))
      page.on("request", request => {
        if (new URL(request.url()).pathname === path && request.method() === "POST") submissions.push(request.postDataJSON())
      })
      const fits = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Sin desbordamiento: ${profile.name}`)
      await page.goto("/login")
      await page.getByLabel("Correo", { exact: true }).fill(email)
      await page.getByLabel("Contraseña", { exact: true }).fill(password)
      await page.getByRole("button", { name: "Ingresar", exact: true }).click()
      await expect(page).toHaveURL(url => url.pathname === "/kinesiologia")
      await page.goto(`/kinesiologia/resultados/${fixture.id}`)
      const panel = page.getByRole("region", { name: "Enviar copia a contacto sin cuenta", exact: true })
      await expect(panel).toBeVisible()
      await expect(panel).toHaveAttribute("aria-busy", "false")
      await expect(panel).toContainText(`Correo guardado: ${fixture.email}`)
      await expect(panel).toContainText(`Apoderado registrado: ${fixture.guardian}`)
      const repeated = panel.getByLabel("Repetir el correo con el apoderado presente", { exact: true })
      const guardian = panel.getByRole("checkbox", { name: fixture.review.textos.confirmarApoderado, exact: true })
      const authorized = panel.getByRole("checkbox", { name: `Revisé esta copia. ${fixture.review.textos.autorizarCorreo}`, exact: true })
      const send = panel.getByRole("button", { name: "Enviar copia autorizada a contacto", exact: true })
      await expect(repeated).toHaveValue("")
      await expect(guardian).not.toBeChecked(); await expect(authorized).not.toBeChecked()
      await expect(send).toBeDisabled()
      await repeated.fill(fixture.email)
      await expect(send).toBeDisabled()
      await guardian.check(); await expect(send).toBeDisabled()
      await guardian.uncheck(); await authorized.check(); await expect(send).toBeDisabled()
      await guardian.check(); await expect(send).toBeEnabled()
      await repeated.fill("destino-ajeno@example.test")
      await expect(send).toBeDisabled()
      assert.equal(submissions.length, 0, "No se envía con casillas incompletas ni destino distinto")
      await repeated.fill(fixture.email); await expect(send).toBeEnabled()
      await fits()
      await page.screenshot({ path: `test-results/result-contact/${profile.name}-ready.png`, fullPage: true })
      const before = { mails: mails.length, attempts: mailAttempts.length }
      const sent = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === "POST")
      await send.click()
      const response = await sent, body = await response.json()
      assert.equal(response.status(), 201, JSON.stringify(body))
      assert.equal(body.envio.estado, "ACEPTADO")
      assert.equal(body.envio.destinatario, fixture.email)
      assert.equal(body.envio.contexto, fixture.review.contexto)
      await expect(panel.getByRole("status").filter({ hasText: "El proveedor aceptó esta copia" }).first()).toBeVisible()
      await expect(send).toHaveCount(0)
      await expect(panel.getByRole("checkbox")).toHaveCount(0)
      assert.equal(submissions.length, 1)
      assert.equal(submissions[0].confirmarApoderado, true); assert.equal(submissions[0].autorizarCorreo, true)
      assert.equal(submissions[0].correoRepetido, fixture.email)
      assert.equal(submissions[0].versionConsentimiento, fixture.review.versionConsentimiento)
      const refreshed = page.waitForResponse(result => new URL(result.url()).pathname === path && result.request().method() === "GET")
      await panel.getByRole("button", { name: "Actualizar estado del contacto", exact: true }).click()
      assert.equal((await refreshed).status(), 200)
      await expect(panel).toHaveAttribute("aria-busy", "false")
      await expect(panel.getByRole("status").filter({ hasText: "El proveedor aceptó esta copia" }).first()).toBeVisible()
      await expect(send).toHaveCount(0)
      const history = panel.locator("details").filter({ has: page.locator("summary", { hasText: /^Copias de contacto guardadas$/ }) })
      await history.locator(":scope > summary").click()
      await expect(history.getByRole("listitem")).toHaveCount(1)
      await expect(history).toContainText(fixture.email)
      await history.locator("summary").filter({ hasText: /^Ver copia conservada$/ }).click()
      await fits()
      await page.screenshot({ path: `test-results/result-contact/${profile.name}-accepted.png`, fullPage: true })
      await page.reload()
      await expect(panel).toHaveAttribute("aria-busy", "false")
      await expect(panel.getByRole("status").filter({ hasText: "El proveedor aceptó esta copia" }).first()).toBeVisible()
      await expect(send).toHaveCount(0)
      await fits()
      assert.equal(submissions.length, 1, "Actualizar y recargar no repiten el POST de contacto")
      assert.equal(mails.length, before.mails + 1); assert.equal(mailAttempts.length, before.attempts + 1)
      assert.deepEqual(mails.at(-1).to, [fixture.email])
      const copies = (await db.query('SELECT id,estado,destinatario,contexto,"confirmarApoderado","autorizarCorreo" FROM "ResultadoContacto" WHERE "evaluacionId"=$1', [fixture.id])).rows
      assert.deepEqual(copies, [{ id: body.envio.id, estado: "ACEPTADO", destinatario: fixture.email, contexto: fixture.review.contexto, confirmarApoderado: true, autorizarCorreo: true }])
      const ledger = (await db.query('SELECT e.estado,e.intentos,e."proveedorId" FROM "EnvioTransaccional" e JOIN "ResultadoContacto" c ON c."claveEnvio"=e.clave WHERE c."evaluacionId"=$1', [fixture.id])).rows
      assert.deepEqual(ledger, [{ estado: "ACEPTADO", intentos: 1, proveedorId: body.envio.proveedorId }])
      assert.deepEqual(errors, [], "Sin errores de página")
      assert.deepEqual(external, [], "Sin recursos ni peticiones de red externa")
      console.log(`OK contacto UI ${profile.name}: correo guardado, dos casillas obligatorias, destino ajeno bloqueado, una sola aceptación, estado persistido y sin desbordamiento.`)
    } catch (error) {
      await page?.screenshot({ path: `test-results/result-contact/${profile.name}-error.png`, fullPage: true }).catch(() => {})
      throw error
    } finally {
      await context?.close()
      await browser.close()
    }
  }
}
