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
    await browserAgendaChecks(page)
  } finally { await page.unroute(pattern) }
}

async function browserAgendaChecks(page) {
  let failed = false, queries = 0
  const pattern = '**/api/calendly/agenda*'
  await page.route(pattern, async route => {
    const url = new URL(route.request().url())
    if (!url.searchParams.has('consultar')) return route.fulfill({json:{estado:'LISTO_PARA_CONSULTAR'}})
    queries++
    assert.equal(url.searchParams.get('fecha'),'2026-11-20')
    if (failed) return route.fulfill({status:429,json:{error:'Calendly alcanzó su límite de consultas.'}})
    const more = url.searchParams.has('cursor'), canceled = url.searchParams.get('estado')==='canceled'
    return route.fulfill({json:{
      estado:'CONECTADO',fecha:'2026-11-20',zonaHoraria:'America/Santiago',tipoCita:'Expo ficticia',
      consultadoAt:'2026-11-19T16:00:00Z',participantesPendientes:false,turnosSinParticipantes:0,
      siguiente:more||canceled?null:'pagina-2',
      citas:[{id:more?'reserva-2':'reserva-1',reservaId:more?'cita-2':'cita-1',nombreReserva:more?'Familia ficticia Dos':'Familia ficticia Uno',correo:'fixture@example.test',inicio:more?'2026-11-20T13:10:00Z':'2026-11-20T13:00:00Z',fin:more?'2026-11-20T13:20:00Z':'2026-11-20T13:10:00Z',estado:canceled?'CANCELADA':'ACTIVA'}]
    }})
  })
  try {
    await page.goto('/agenda')
    const main=page.getByRole('main')
    await expect(main.getByRole('heading',{name:'Agenda de citas',exact:true})).toBeVisible()
    assert.equal(queries,0)
    await main.getByLabel('Día de atención',{exact:true}).fill('2026-11-20')
    await main.getByRole('button',{name:'Consultar citas',exact:true}).click()
    await expect(main.getByRole('heading',{name:'Familia ficticia Uno',exact:true})).toBeVisible()
    await expect(main.getByText('10:00–10:10',{exact:true})).toBeVisible()
    await expect(main.getByText('Hay más citas para consultar:',{exact:false})).toBeVisible()
    await main.getByRole('button',{name:'Cargar más citas',exact:true}).click()
    await expect(main.getByRole('heading',{name:'Familia ficticia Dos',exact:true})).toBeVisible()
    await expect(main.getByRole('heading',{name:'Familia ficticia Uno',exact:true})).toBeVisible()
    await expect(main.getByRole('button',{name:'Cargar más citas',exact:true})).toHaveCount(0)
    await main.getByLabel('Buscar entre las reservas cargadas',{exact:true}).fill('Dos')
    await expect(main.getByRole('heading',{name:'Familia ficticia Uno',exact:true})).toHaveCount(0)
    await expect(main.getByRole('heading',{name:'Familia ficticia Dos',exact:true})).toBeVisible()
    await main.getByLabel('Buscar entre las reservas cargadas',{exact:true}).fill('')
    failed=true
    await main.getByRole('button',{name:'Actualizar agenda',exact:true}).click()
    await expect(main.getByRole('alert')).toContainText('límite de consultas')
    await expect(main.getByRole('heading',{name:'Familia ficticia Dos',exact:true})).toBeVisible()
    failed=false
    await main.getByLabel('Estado de la reserva',{exact:true}).selectOption('canceled')
    await main.getByRole('button',{name:'Consultar citas',exact:true}).click()
    await expect(main.getByText('Cancelada',{exact:true})).toBeVisible()
    await expect(main.getByRole('alert')).toHaveCount(0)
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
  } finally {await page.unroute(pattern)}
}
