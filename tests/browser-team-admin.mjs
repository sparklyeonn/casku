import { browserCalendlyChecks } from "./browser-calendly.mjs"
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium, webkit, devices, expect as pwExpect } from '@playwright/test'
import { hashPassword } from '../src/lib/passwords.mjs'
import { teamNavigate } from './team-navigation.mjs'
const expect = pwExpect.configure({ timeout: 30000 })
export async function browserTeamAdminChecks({ db, base, password }) {
  const profiles = [
    { name: 'desktop-chromium', engine: chromium, options: { viewport: { width: 1440, height: 1000 } } },
    { name: 'android-chromium', engine: chromium, options: devices['Pixel 7'] },
    { name: 'desktop-webkit', engine: webkit, options: { viewport: { width: 1440, height: 1000 } } },
    { name: 'ipad-webkit', engine: webkit, options: devices['iPad (gen 7)'] },
    { name: 'small-dark-chromium', engine: chromium, options: { viewport: { width: 320, height: 740 }, colorScheme: 'dark', reducedMotion: 'reduce' } },
  ]
  await mkdir('test-results/team-admin', { recursive: true })
  for (const profile of profiles) {
    const email = `visual-admin-${randomUUID()}@example.com`
    await db.query(`INSERT INTO "CuentaEquipo" (id,email,name,role,"passwordHash",active,"mustChangePassword",version,"updatedAt") VALUES ($1,$2,'Administración Casku de prueba visual','ADMIN',$3,true,false,1,CURRENT_TIMESTAMP)`, [randomUUID(), email, await hashPassword(password)])
    const browser = await profile.engine.launch({ headless: true }), context = await browser.newContext({ ...profile.options, baseURL: base })
    let page
    const errors = []
    try {
      context.on('request', request => { if (!['localhost', '127.0.0.1'].includes(new URL(request.url()).hostname)) errors.push('Recurso externo inesperado') })
      page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(error.message))
      const fits = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Sin desbordamiento: ${profile.name} ${new URL(page.url()).pathname}`)
      await page.goto('/login'); await page.getByLabel('Correo', { exact: true }).fill(email); await page.getByLabel('Contraseña', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await expect(page).toHaveURL(/\/administracion$/)
      await expect(page.getByRole('button', { name: 'Crear y seleccionar evento', exact: true })).toBeEnabled()
      if (profile.name === 'desktop-chromium' || profile.name === 'desktop-webkit') await expect(page.getByRole('button', { name: 'Menú del equipo', exact: true })).toBeHidden()
      const eventName = `Encuentro de familias · ${profile.name}`
      await page.getByLabel('Nombre del evento', { exact: true }).fill(eventName)
      await page.getByLabel('Fecha', { exact: true }).fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
      await page.getByLabel('Lugar', { exact: true }).fill('Recinto de prueba · Santiago')
      await page.getByLabel('Cupos totales', { exact: true }).fill('8')
      const created = page.waitForResponse(r => r.url().endsWith('/api/eventos') && r.request().method() === 'POST')
      await page.getByRole('button', { name: 'Crear y seleccionar evento', exact: true }).click(); assert.equal((await created).status(), 201)
      const eventRow = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: eventName, exact: true }) })
      await eventRow.getByRole('button', { name: 'Abrir inscripciones', exact: true }).click()
      await expect(eventRow.getByRole('button', { name: 'Cerrar inscripciones', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Resumen del evento', exact: true })).toBeVisible(); await fits()
      await page.evaluate(()=>window.scrollTo(0,0))
      await page.screenshot({ path: `test-results/team-admin/${profile.name}-eventos.png`, fullPage: true })
      await teamNavigate(page, 'Cuentas del equipo')
      await expect(page.getByRole('heading', { name: 'Cuentas del equipo', exact: true })).toBeVisible()
      await page.getByLabel('Nombre', { exact: true }).fill('Recepción visual de prueba')
      const staffEmail = `recepcion-${randomUUID()}@example.com`
      await page.getByLabel('Correo de acceso', { exact: true }).fill(staffEmail)
      await page.getByRole('combobox', { name: 'Perfil', exact: true }).selectOption('RECEPCION')
      await page.getByLabel('Contraseña temporal inicial', { exact: true }).fill(password)
      await page.getByLabel('Confirmar contraseña', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
      await expect(page.getByRole('main').getByRole('status')).toContainText('Cuenta creada con contraseña temporal')
      const stored = (await db.query('SELECT role,"mustChangePassword" FROM "CuentaEquipo" WHERE email=$1', [staffEmail])).rows[0]
      assert.equal(stored.role, 'RECEPCION'); assert(stored.mustChangePassword)
      await fits(); await page.screenshot({ path: `test-results/team-admin/${profile.name}-cuentas.png`, fullPage: true })
      for (const [label, heading] of [['Calendly', 'Conexión con Calendly'], ['Datos de familias', 'Corrección de datos familiares'], ['Correos', 'Gestión de correos'], ['Trazabilidad', 'Trazabilidad de privacidad'], ['Seguridad y sesiones', 'Seguridad y sesiones'], ['Cambiar contraseña', 'Cambiar mi contraseña']]) {
        await teamNavigate(page, label)
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
        await fits()
      }
      await browserCalendlyChecks(page)
      assert.equal((await context.request.get('/api/kinesiologia/atencion')).status(), 403, 'La presentación no otorga permisos clínicos')
      await teamNavigate(page, 'Eventos')
      if (profile.name === 'desktop-chromium') { await page.setViewportSize({ width: 720, height: 500 }); await fits(); await teamNavigate(page, 'Cuentas del equipo'); await fits() }
      const toggle = page.getByRole('button', { name: 'Menú del equipo', exact: true })
      if (await toggle.isVisible()) {
        await toggle.focus(); await page.keyboard.press('Enter'); await expect(toggle).toHaveAttribute('aria-expanded', 'true')
        await expect(page.getByRole('navigation', { name: 'Menú de equipo' }).getByRole('link', { name: 'Eventos', exact: true })).toBeVisible()
        await toggle.press('Enter'); await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      }
      assert.deepEqual(errors, [])
      console.log(`OK administración ${profile.name}: evento, apertura, resumen, cuenta temporal, navegación por perfil, teclado y sin desbordamiento.`)
    } catch (error) { await page?.screenshot({ path: `test-results/team-admin/${profile.name}-error.png`, fullPage: true }); throw error }
    finally { await context.close(); await browser.close() }
  }
}
