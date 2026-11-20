import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { chromium, webkit, devices, expect as pwExpect } from "@playwright/test"
const expect = pwExpect.configure({ timeout: 30000 })
export async function browserCalendlyArrivalChecks({ base, password, account, eventId, payload, bookingFixtures, db, mails }) {
  const profiles = [
    { name: "desktop-chromium", engine: chromium, options: { viewport: { width: 1440, height: 1000 } } },
    { name: "android-chromium", engine: chromium, options: devices["Pixel 7"] },
    { name: "desktop-webkit", engine: webkit, options: { viewport: { width: 1440, height: 1000 } } },
    { name: "ipad-webkit", engine: webkit, options: devices["iPad (gen 7)"] },
    { name: "small-dark-chromium", engine: chromium, options: { viewport: { width: 320, height: 740 }, colorScheme: "dark" } },
  ]
  await mkdir("test-results/calendly-arrival", { recursive: true })
  const initialMails = mails.length
  for (const profile of profiles) {
    const browser = await profile.engine.launch({ headless: true }), context = await browser.newContext({ ...profile.options, baseURL: base })
    const errors = [], fixture = payload({ nombreBebe: "Bebé visual " + randomUUID() }), booking = bookingFixtures.get(fixture.reservaId)
    const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(booking.inicio)
    try {
      const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message))
      await page.goto("/login")
      await page.getByLabel("Correo", { exact: true }).fill(account.email)
      await page.getByLabel("Contraseña", { exact: true }).fill(password)
      await page.getByRole("button", { name: "Ingresar", exact: true }).click()
      await expect(page).toHaveURL(/\/recepcion$/)
      await page.route("**/api/calendly/agenda*", route => route.fulfill({ json: new URL(route.request().url()).searchParams.has("consultar") ? { estado: "CONECTADO", fecha: date, tipoCita: "Expo QA", consultadoAt: new Date().toISOString(), participantesPendientes: false, turnosSinParticipantes: 0, siguiente: null, citas: [{ id: fixture.invitadoId, reservaId: fixture.reservaId, nombreReserva: "Nombre reservado sin inferir bebé", correo: "fixture@example.test", inicio: booking.inicio.toISOString(), fin: booking.fin.toISOString(), estado: "ACTIVA" }] } : { estado: "LISTO_PARA_CONSULTAR" } }))
      await page.goto("/agenda")
      await page.getByLabel("Día de atención", { exact: true }).fill(date)
      await page.getByRole("button", { name: "Consultar citas", exact: true }).click()
      await page.getByRole("button", { name: "Confirmar bebé y llegada", exact: true }).click()
      const form = page.getByRole("region", { name: "Confirmar familia de Calendly", exact: true })
      await expect(form.getByLabel("Nombre del bebé", { exact: true })).toHaveValue("")
      await form.getByRole("combobox").selectOption(eventId)
      await form.getByLabel("Nombre del bebé", { exact: true }).fill(fixture.nombreBebe)
      await form.getByLabel("Fecha de nacimiento del bebé", { exact: true }).fill(fixture.fechaNacimiento)
      await form.getByLabel("Nombre del apoderado", { exact: true }).fill(fixture.nombreApoderado)
      const save = form.getByRole("button", { name: "Vincular cita y confirmar llegada", exact: true })
      await expect(save).toBeDisabled()
      await form.getByRole("checkbox").nth(0).check()
      await form.getByRole("checkbox").nth(1).check()
      await expect(save).toBeEnabled()
      await save.click()
      await expect(form.getByRole("status")).toContainText("Llegada registrada")
      await expect(form.getByRole("status")).toContainText("No se envió ni programó ningún correo")
      assert.equal((await db.query('SELECT count(*)::int n FROM "Inscripcion" WHERE "calendlyInvitadoId"=$1', [fixture.invitadoId])).rows[0].n, 1)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Sin desbordamiento horizontal")
      assert.deepEqual(errors, [])
      await page.screenshot({ path: `test-results/calendly-arrival/${profile.name}.png`, fullPage: true })
      console.log(`OK llegada Calendly ${profile.name}: formulario, autorización, vínculo real a base temporal y sin correos.`)
    } finally { await context.close(); await browser.close() }
  }
  assert.equal(mails.length, initialMails)
}
