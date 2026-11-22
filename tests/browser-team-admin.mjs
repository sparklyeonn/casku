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
      const calendlyPanel = page.getByRole('region', { name: 'Protección anticipada de cupos', exact: true })
      await expect(calendlyPanel.getByRole('heading')).toContainText(eventName)
      await expect(calendlyPanel.getByLabel('Jornada de Casku', { exact: true })).toBeEnabled()
      await expect(calendlyPanel.getByRole('button', { name: 'Vincular reservas y proteger cupos', exact: true })).toBeDisabled()
      await calendlyPanel.getByRole('checkbox').check()
      await expect(calendlyPanel.getByRole('button', { name: 'Vincular reservas y proteger cupos', exact: true })).toBeEnabled()
      const eventRow = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: eventName, exact: true }) })
      await eventRow.getByRole('button', { name: 'Abrir inscripciones', exact: true }).click()
      await expect(eventRow.getByRole('button', { name: 'Cerrar inscripciones', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Resumen del evento', exact: true })).toBeVisible(); await fits()
      await page.evaluate(()=>window.scrollTo(0,0))
      await page.screenshot({ path: `test-results/team-admin/${profile.name}-eventos.png`, fullPage: true })
      // Otro evento, de hoy en Chile, para no cambiar la prueba de protección futura.
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
      const part = type => today.find(value => value.type === type).value
      const onsiteEventId = randomUUID(), onsiteName = `Presencial ADMIN · ${profile.name}`
      const onsiteEventResponse = await context.request.post('/api/eventos', { headers: { origin: base }, data: { id: onsiteEventId, nombre: onsiteName, fecha: `${part('year')}-${part('month')}-${part('day')}`, lugar: 'Recinto presencial ficticio', cupos: 3 } })
      assert.equal(onsiteEventResponse.status(), 201)
      await page.reload()
      const onsiteDetails = page.locator('details').filter({ has: page.locator('summary', { hasText: /^Inscribir presencialmente$/ }) })
      await expect(onsiteDetails).not.toHaveAttribute('open')
      await onsiteDetails.locator('summary').click()
      await expect(onsiteDetails).toHaveAttribute('open', '')
      await expect(onsiteDetails.getByRole('heading', { name: 'Inscripción presencial', exact: true })).toBeVisible()
      await expect(onsiteDetails).toContainText('3 cupos disponibles.')
      const onsiteRequests = []
      const trackOnsite = request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/recepcion/')) onsiteRequests.push(url.pathname) }
      page.on('request', trackOnsite)
      await onsiteDetails.getByLabel('Nombre completo del bebé', { exact: true }).fill(`Bebé ficticio ADMIN ${profile.name}`)
      await onsiteDetails.getByLabel('Fecha de nacimiento', { exact: true }).fill('2026-01-01')
      await onsiteDetails.getByLabel('Nombre del apoderado', { exact: true }).fill('Apoderado ficticio ADMIN')
      await onsiteDetails.getByLabel('Nombre del apoderado que autorizó', { exact: true }).fill('Apoderado ficticio ADMIN')
      await onsiteDetails.getByLabel('Referencia interna del documento', { exact: true }).fill('DOC-ADMIN-FICTICIO')
      await onsiteDetails.getByRole('checkbox', { name: /Revisé la autorización expresa documentada/ }).check()
      const register = onsiteDetails.getByRole('button', { name: 'Registrar y confirmar llegada', exact: true })
      await expect(register).toBeEnabled()
      const onsiteCreated = page.waitForResponse(response => new URL(response.url()).pathname === '/api/recepcion/presencial' && response.request().method() === 'POST')
      await register.click()
      const onsiteResponse = await onsiteCreated
      assert.equal(onsiteResponse.status(), 201)
      const onsiteReceipt = await onsiteResponse.json()
      assert.equal(onsiteReceipt.correo, 'SIN_CORREO')
      await expect(onsiteDetails.getByRole('status')).toContainText('Inscripción registrada y llegada confirmada')
      await expect(onsiteDetails.getByRole('heading', { name: /N.º 001/ })).toContainText(`Bebé ficticio ADMIN ${profile.name}`)
      await expect(onsiteDetails).toContainText('2 cupos disponibles.')
      await expect(onsiteDetails.getByRole('link', { name: 'Descargar QR del comprobante' })).toHaveCount(0)
      await expect(onsiteDetails.getByRole('button', { name: 'Reintentar correo' })).toHaveCount(0)
      page.off('request', trackOnsite)
      assert(onsiteRequests.length > 0)
      assert(onsiteRequests.every(path => path === '/api/recepcion/presencial'), 'El panel ADMIN no consulta otros endpoints de recepción')
      assert.deepEqual((await db.query('SELECT inscritos,"ultimoNumero","ultimoOrdenFila" FROM "Evento" WHERE id=$1', [onsiteEventId])).rows[0], { inscritos: 1, ultimoNumero: 1, ultimoOrdenFila: 1 })
      assert.equal((await context.request.post('/api/recepcion/buscar', { headers: { origin: base }, data: { eventoId: onsiteEventId, consulta: '1' } })).status(), 403)
      assert.equal((await context.request.get(`/api/recepcion/fila?eventoId=${onsiteEventId}`)).status(), 403)
      assert.equal((await context.request.get(`/api/kinesiologia/atencion?eventoId=${onsiteEventId}`)).status(), 403)
      // Cambiar la jornada desde el selector cambia también selección y resumen.
      const selector = page.getByLabel('Jornada de Casku', { exact: true })
      const previousId = await selector.locator('option').filter({ hasText: eventName }).getAttribute('value')
      await selector.selectOption(previousId)
      const overview = page.locator('section').filter({ has: page.locator('#event-overview-title') })
      await expect(overview).toContainText(eventName)
      await page.getByLabel('Jornada de Casku', { exact: true }).selectOption(onsiteEventId)
      await expect(overview).toContainText(onsiteName)
      // Una inscripción desde otra pantalla debe aparecer sin pulsar actualizar.
      const newPatient = randomUUID()
      await db.query('INSERT INTO "Paciente" (id,nombre,"fechaNacimiento") VALUES ($1,\'Bebé de actualización externa\',\'2026-01-01\')', [newPatient])
      await db.query('INSERT INTO "Inscripcion" (id,"solicitudHash","eventoId","pacienteId",numero,"qrToken",origen,"contactoNombre","registradoPorId") VALUES ($1,\'fixture\',$2,$3,2,$4,\'PRESENCIAL\',\'Familia externa ficticia\',\'fixture\')', [randomUUID(), onsiteEventId, newPatient, randomUUID()])
      await db.query('UPDATE "Evento" SET inscritos=2,"ultimoNumero"=2 WHERE id=$1', [onsiteEventId])
      const liveRow = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: onsiteName, exact: true }) })
      await expect(liveRow).toContainText('2 inscritos y reservas / 3 cupos')
      await expect(overview.getByLabel('Inscripciones presenciales', { exact: true })).toContainText('Inscripciones presenciales vigentes: 2')
      await fits(); await page.screenshot({ path: `test-results/team-admin/${profile.name}-presencial.png`, fullPage: true })
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
      console.log(`OK administración ${profile.name}: evento, apertura, resumen, inscripción presencial ADMIN, cuenta temporal, navegación por perfil, teclado y sin desbordamiento.`)
    } catch (error) { await page?.screenshot({ path: `test-results/team-admin/${profile.name}-error.png`, fullPage: true }); throw error }
    finally { await context.close(); await browser.close() }
  }
}
