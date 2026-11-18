import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
export async function browserCalendlyChecks(page) {
  let failed = false, consulted = 0
  const pattern = '**/api/administracion/calendly*'
  await page.route(pattern, async route => {
    const url = new URL(route.request().url())
    if (!url.searchParams.has('consultar')) return route.fulfill({ json: { estado: 'LISTO_PARA_CONSULTAR' } })
    consulted++
    if (failed) return route.fulfill({ status: 429, json: { error: 'Calendly alcanzó su límite de consultas. Espera antes de volver a consultar.' } })
    const more = url.searchParams.has('cursor')
    return route.fulfill({ json: { estado: 'CONECTADO', cuenta: { nombre: 'Casku ficticio', zonaHoraria: 'America/Santiago' }, tipos: [{ id: more ? 'tipo-2' : 'tipo-1', nombre: more ? 'Consulta ficticia' : 'Expo Bebé ficticia', duracion: 15, activo: true, enlace: 'https://calendly.com/casku-ficticio/expo', preguntas: [{ nombre: 'Nombre del bebé', requerida: true, tipo: 'text', posicion: 0 }] }], siguiente: more ? null : 'pagina-2' } })
  })
  try {
    await page.goto('/administracion/calendly')
    const main = page.getByRole('main')
    await expect(main.getByRole('status')).toContainText('Acceso configurado.')
    assert.equal(consulted, 0, 'Abrir el panel no consulta reservas')
    await main.getByRole('button', { name: 'Consultar tipos de cita', exact: true }).click()
    await expect(main.getByRole('heading', { name: 'Expo Bebé ficticia', exact: true })).toBeVisible()
    await main.getByText('Preguntas de inscripción (1)', { exact: true }).click()
    await expect(main.getByText('Nombre del bebé · Obligatoria', { exact: true })).toBeVisible()
    await main.getByRole('button', { name: 'Ver más tipos de cita', exact: true }).click()
    await expect(main.getByRole('heading', { name: 'Consulta ficticia', exact: true })).toBeVisible()
    await expect(main.getByRole('heading', { name: 'Expo Bebé ficticia', exact: true })).toBeVisible()
    failed = true
    await main.getByRole('button', { name: 'Consultar tipos de cita', exact: true }).click()
    await expect(main.getByRole('alert')).toContainText('límite de consultas')
    failed = false
    await main.getByRole('button', { name: 'Consultar tipos de cita', exact: true }).click()
    await expect(main.getByRole('alert')).toHaveCount(0)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  } finally { await page.unroute(pattern) }
}
