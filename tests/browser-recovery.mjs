import assert from 'node:assert/strict'
import { chromium, webkit, devices, expect as pwExpect } from '@playwright/test'
const expect = pwExpect.configure({ timeout: 30000 })

export async function browserRecoveryChecks({ link, password }) {
  const target = new URL(link), token = new URLSearchParams(target.hash.slice(1)).get('token')
  assert(token && /^[A-Za-z0-9_-]{43}$/.test(token))
  const profiles = [
    { name: 'desktop-chromium', engine: chromium, options: { viewport: { width: 1280, height: 900 } } },
    { name: 'android-chromium', engine: chromium, options: devices['Pixel 7'] },
    { name: 'desktop-webkit', engine: webkit, options: { viewport: { width: 1280, height: 900 } } },
    { name: 'ipad-webkit', engine: webkit, options: devices['iPad (gen 7)'] },
    { name: 'small-dark-chromium', engine: chromium, options: { viewport: { width: 320, height: 740 }, colorScheme: 'dark' } },
  ]
  for (const [index, profile] of profiles.entries()) {
    const browser = await profile.engine.launch()
    const context = await browser.newContext(profile.options)
    const page = await context.newPage(), failures = []
    let documents = 0, posts = 0
    page.on('pageerror', () => failures.push('Error de navegador'))
    page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++
      const url = new URL(request.url())
      assert(!url.search.includes(token), 'El token no debe viajar como consulta')
      assert.equal(url.origin, target.origin, 'Sin recursos externos')
      if (url.pathname === '/api/equipo/recuperacion/confirmar') {
        posts++
        assert.equal(request.postDataJSON().token, token, 'El token capturado debe llegar a la confirmación')
      }
    })
    try {
      // Abrir desde el correo, incluyendo parámetros inocuos de seguimiento.
      const tracked = new URL(link); tracked.searchParams.set('origen', 'prueba')
      await page.goto(tracked.href)
      await expect(page.getByLabel('Nueva contraseña', { exact: true })).toBeVisible()
      await expect(page.getByText('Revisando enlace…', { exact: true })).toHaveCount(0)
      await expect(page).toHaveURL(target.origin + target.pathname + '?origen=prueba')
      const stableDocuments = documents
      await page.getByLabel('Nueva contraseña', { exact: true }).fill(password)
      await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(password + '-distinta')
      await page.getByRole('button', { name: 'Guardar nueva contraseña', exact: true }).click()
      await expect(page.getByRole('main').getByRole('alert')).toHaveText('Las contraseñas no coinciden.')
      assert.equal(posts, 0)
      // Detecta recargas que borraban los datos del formulario, incluso tras quitar el fragmento.
      await page.waitForTimeout(1200)
      await expect(page.getByLabel('Nueva contraseña', { exact: true })).toHaveValue(password)
      assert.equal(documents, stableDocuments)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
      if (index === profiles.length - 1) {
        await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(password)
        await page.getByRole('button', { name: 'Guardar nueva contraseña', exact: true }).click()
        await expect(page.getByRole('main').getByRole('status')).toContainText('Contraseña actualizada.')
        assert.equal(posts, 1)
        await page.goto(link)
        await page.getByLabel('Nueva contraseña', { exact: true }).fill(password + '-otra')
        await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(password + '-otra')
        await page.getByRole('button', { name: 'Guardar nueva contraseña', exact: true }).click()
        await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
        assert.equal(posts, 2)
      } else {
        await page.getByRole('button', { name: 'Solicitar otro enlace', exact: true }).click()
        await expect(page.getByLabel('Correo del equipo', { exact: true })).toBeVisible()
        assert.equal(posts, 0)
      }
      await page.goto(target.origin + target.pathname)
      await expect(page.getByLabel('Correo del equipo', { exact: true })).toBeVisible()
      assert.equal(failures.length, 0)
      console.log(`OK enlace de recuperación ${profile.name}: formulario estable, token privado, validación y sin recargas.`)
    } finally { await context.close(); await browser.close() }
  }
}
