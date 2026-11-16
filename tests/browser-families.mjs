import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium, webkit, devices, expect as pwExpect } from '@playwright/test'
const expect = pwExpect.configure({ timeout: 30000 })
export async function browserFamilyChecks({ base, mails, admin, createEvent, publish }) {
  const event = await createEvent(admin, 'Encuentro familiar Casku · Evaluación y orientación para tu bebé', 20)
  const profiles = [
    { name: 'desktop-chromium', engine: chromium, options: { viewport: { width: 1440, height: 1000 } } },
    { name: 'android-chromium', engine: chromium, options: devices['Pixel 7'] },
    { name: 'desktop-webkit', engine: webkit, options: { viewport: { width: 1440, height: 1000 } } },
    { name: 'ipad-webkit', engine: webkit, options: devices['iPad (gen 7)'] },
    { name: 'small-dark-chromium', engine: chromium, options: { viewport: { width: 320, height: 740 }, colorScheme: 'dark', reducedMotion: 'reduce' } },
  ]
  await mkdir('test-results/families', { recursive: true })
  for (const profile of profiles) {
    const browser = await profile.engine.launch({ headless: true })
    const context = await browser.newContext({ ...profile.options, baseURL: base })
    const errors = []
    try {
      context.on('request', request => {
        if (!['localhost', '127.0.0.1'].includes(new URL(request.url()).hostname)) errors.push('Recurso externo inesperado')
      })
      const page = await context.newPage()
      page.setDefaultTimeout(30000)
      page.on('pageerror', error => errors.push(error.message))
      const fits = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Sin desbordamiento: ${profile.name} ${new URL(page.url()).pathname}`)
      await page.goto(`/login?portal=familias&evento=${event.id}`)
      await expect(page.getByRole('heading', { name: 'Espacio de las familias' })).toBeVisible()
      await fits()
      await page.screenshot({ path: `test-results/families/${profile.name}-login.png`, fullPage: true })
      const email = `familia-${randomUUID()}@example.com`
      await page.getByLabel('Correo del apoderado', { exact: true }).fill(email)
      await page.getByRole('button', { name: 'Recibir código de acceso' }).click()
      await expect(page.getByLabel('Código de 6 dígitos')).toBeVisible()
      const mail = mails.findLast(m => m.to.includes(email) && m.subject === 'Tu código de acceso a Casku')
      assert(mail, 'Código únicamente desde el proveedor simulado')
      await page.getByLabel('Código de 6 dígitos').fill(mail.text.match(/es (\d{6})\./)[1])
      await page.getByRole('button', { name: 'Verificar e ingresar' }).click()
      await expect(page).toHaveURL(/\/familias\?evento=/)
      await expect(page.getByRole('combobox', { name: 'Evento', exact: true })).toHaveValue(event.id)
      await expect(page.getByText('Todavía no tienes inscripciones.', { exact: false })).toBeVisible()
      const confirm = page.getByRole('button', { name: 'Confirmar inscripción', exact: true })
      await expect(confirm).toBeDisabled()
      await page.getByLabel('Nombre completo del bebé', { exact: true }).fill('Bebé de prueba visual')
      await page.getByLabel('Fecha de nacimiento', { exact: true }).fill('2026-01-01')
      await page.getByLabel('Nombre del apoderado', { exact: true }).fill('Apoderado de prueba visual')
      await page.getByRole('checkbox', { name: /^Declaro ser el apoderado/ }).check()
      await expect(page.getByRole('checkbox', { name: /^Autorizo recibir los resultados/ })).not.toBeChecked()
      await expect(page.getByRole('checkbox', { name: /^Autorizo los correos de seguimiento/ })).not.toBeChecked()
      const saved = page.waitForResponse(r => r.url().endsWith('/api/familias/inscripciones') && r.request().method() === 'POST')
      await confirm.click()
      const savedResponse = await saved
      assert.equal(savedResponse.status(), 201)
      const receipt = (await savedResponse.json()).inscripcion
      const qr = page.getByRole('img', { name: /^QR de la inscripción/ })
      await expect(qr).toBeVisible()
      await expect.poll(() => qr.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
      await expect(page.getByRole('heading', { name: 'Bebé de prueba visual', exact: true })).toBeVisible()
      assert.equal((await context.request.get('/api/eventos')).status(), 401, 'La nueva presentación no concede permisos del equipo')
      await fits()
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: `test-results/families/${profile.name}-portal.png`, fullPage: true })
      await page.getByRole('navigation', { name: 'Espacio familiar' }).getByRole('link', { name: 'Resultados publicados', exact: true }).click()
      await expect(page.getByText('Todavía no hay resultados publicados para tu cuenta.')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Resultados publicados', exact: true })).toHaveAttribute('aria-current', 'page')
      await fits()
      await publish(receipt)
      await page.getByRole('button', { name: 'Actualizar resultados', exact: true }).click()
      await page.getByRole('link', { name: 'Ver resultado', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Resultado publicado', exact: true })).toBeVisible()
      await expect(page.getByRole('table')).toContainText('140 mm')
      await fits()
      await page.screenshot({ path: `test-results/families/${profile.name}-result.png`, fullPage: true })
      await page.getByRole('link', { name: 'Mis autorizaciones', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Guardar autorizaciones' })).toBeVisible()
      await fits()
      await page.screenshot({ path: `test-results/families/${profile.name}-privacy.png`, fullPage: true })
      await page.getByRole('link', { name: 'Mis inscripciones', exact: true }).click()
      await expect(page.getByRole('img', { name: /^QR de la inscripción/ })).toBeVisible()
      // Error visible y recuperable, conservando los datos guardados en servidor.
      await page.route('**/api/eventos/disponibles', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'No pudimos consultar los eventos. Intenta nuevamente.' }) }))
      await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
      await expect(page.getByRole('main').getByRole('alert')).toContainText('No pudimos consultar los eventos')
      await fits()
      await page.unroute('**/api/eventos/disponibles')
      await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
      await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
      await expect(qr).toBeVisible()
      await page.getByText('Gestionar o cancelar inscripción', { exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Cancelación de inscripción', exact: true })).toBeVisible()
      if (profile.name === 'desktop-chromium') {
        // 1440 px con área útil equivalente a 200 % de zoom.
        await page.setViewportSize({ width: 720, height: 500 })
        await fits()
        await expect(page.getByRole('link', { name: 'Mis autorizaciones', exact: true })).toBeVisible()
      }
      await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
      await expect(page).toHaveURL(/\/login\?portal=familias/)
      await expect(page.getByLabel('Correo del apoderado', { exact: true })).toBeVisible()
      await page.waitForLoadState('networkidle')
      await page.goto('/inscripcion')
      await expect(page.getByRole('heading', { name: 'Elige tu evento', exact: true })).toBeVisible()
      await fits()
      assert.deepEqual(errors, [])
      console.log(`OK familias ${profile.name}: código, inscripción, QR, autorizaciones, resultados vacíos/publicados, error recuperable, cierre y sin desbordamiento.`)
    } finally { await context.close(); await browser.close() }
  }
}
