import { calendlyRead as read, calendlyObject as object, CalendlyUnavailable } from "./client"
import { expo, calendlyLocalDate } from "./agenda"
import { hookConfig, inviteeReference } from "./webhook-policy"
export async function verifyProviderSubscription(signal?: AbortSignal) {
 const config = hookConfig()
 if (!config) throw new CalendlyUnavailable("CONFIGURACION")
 const { user } = await expo(signal ?? AbortSignal.timeout(20000))
 const subscription = object((await read(`/webhook_subscriptions/${config.subscription}`, signal)).resource)
 if (subscription.uri !== `https://api.calendly.com/webhook_subscriptions/${config.subscription}` || subscription.callback_url !== config.callback || subscription.state !== "active" || subscription.scope !== "user" || subscription.user !== user || !Array.isArray(subscription.events) || !["invitee.created","invitee.canceled"].every(value => (subscription.events as unknown[]).includes(value))) throw new CalendlyUnavailable("CONFIGURACION")
 let retryAt:Date|null=null
 if(subscription.retry_started_at!=null){if(typeof subscription.retry_started_at!=="string"||!Number.isFinite(Date.parse(subscription.retry_started_at)))throw new CalendlyUnavailable("RESPUESTA");retryAt=new Date(subscription.retry_started_at)}
 return {...config,retryAt}
}
export async function currentInvitees(uri: string, signal: AbortSignal) {
 const context = await expo(signal)
 async function fetchOne(value: string) {
  const ref = inviteeReference(value), base = `/scheduled_events/${ref.reservaId}`
  const event = object((await read(base, signal)).resource)
  if (event.event_type !== context.type.uri) return null
  if (event.uri !== "https://api.calendly.com" + base || !Array.isArray(event.event_memberships) || !event.event_memberships.some(member => object(member).user === context.user)) throw new CalendlyUnavailable("RESPUESTA")
  const guest = object((await read(new URL(value).pathname, signal)).resource)
  if (guest.uri !== value || guest.event !== event.uri || !["active","canceled"].includes(String(guest.status)) || !["active","canceled"].includes(String(event.status))) throw new CalendlyUnavailable("RESPUESTA")
  const date = (value: unknown) => { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new CalendlyUnavailable("RESPUESTA"); return new Date(value) }
  const inicio = date(event.start_time), fin = date(event.end_time)
  if (fin <= inicio) throw new CalendlyUnavailable("RESPUESTA")
  const oldUri = guest.old_invitee == null ? null : inviteeReference(guest.old_invitee).uri
  const newUri = guest.new_invitee == null ? null : inviteeReference(guest.new_invitee).uri
  if (guest.rescheduled === true && !newUri && guest.status === "canceled") throw new CalendlyUnavailable("RESPUESTA")
  return { ...ref, inicio, fin, fecha: calendlyLocalDate(inicio), estado: guest.status === "active" && event.status === "active" ? "ACTIVA" : "CANCELADA", oldUri, newUri }
 }
 const first = await fetchOne(uri)
 if (!first) return []
 const rows = [first]
 for (const peerUri of [first.oldUri, first.newUri]) {
  if (!peerUri) continue
  if (peerUri === first.uri) throw new CalendlyUnavailable("RESPUESTA")
  const peer = await fetchOne(peerUri)
  if (!peer || (peer.uri === first.oldUri ? peer.newUri !== first.uri : peer.oldUri !== first.uri)) throw new CalendlyUnavailable("RESPUESTA")
  rows.push(peer)
 }
 return rows
}
export type CurrentInvitee = Awaited<ReturnType<typeof currentInvitees>>[number]
