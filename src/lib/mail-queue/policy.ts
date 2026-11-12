import type { ResultSnapshot } from "../results/snapshot.ts"
import { resultMessage } from "../results/message.ts"
export const STAGES = ["INICIAL", "SEMANA", "MES"] as const
export type Stage = typeof STAGES[number]
export const MAX_ATTEMPTS = 5
export const LEASE_MS = 120_000
export type CalendarPolicy = { version: string; protocolo: string; plantillasAprobadas: true; zona: "America/Santiago"; hora: number; tardios: "OMITIR" }
export type Eligibility = { plagiocefalia: "NORMAL" | "ALTERADA" | "PENDIENTE"; forma: "NORMAL" | "ALTERADA" | "PENDIENTE" }
export type Message = { subject: string; text: string; html: string }
export class DeliveryFailure extends Error {
  kind: "TRANSITORIO" | "PERMANENTE" | "INCIERTO"
  constructor(kind: DeliveryFailure["kind"]) { super(kind); this.kind = kind }
}
export type MailTransport = { name: string; idempotencyWindowMs: number; send: (message: Message & { to: string }, key: string) => Promise<string> }
export function eligible(value: Eligibility) {
  if (value.plagiocefalia === "ALTERADA" || value.forma === "ALTERADA") return "SI"
  if (value.plagiocefalia === "NORMAL" && value.forma === "NORMAL") return "NO"
  return "PENDIENTE"
}
function parts(date: Date) {
  const values = new Intl.DateTimeFormat("en", {timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(date)
  const get = (name: string) => Number(values.find(value=>value.type===name)!.value)
  return {year:get("year"),month:get("month"),day:get("day"),hour:get("hour")}
}
export function calendar(evaluated: Date, published: Date, policy: CalendarPolicy) {
  if (!policy.version?.trim() || !policy.protocolo?.trim() || policy.plantillasAprobadas!==true || policy.zona!=="America/Santiago" || policy.tardios!=="OMITIR" || !Number.isInteger(policy.hora) || policy.hora<6 || policy.hora>21 || !Number.isFinite(evaluated.getTime()) || !Number.isFinite(published.getTime())) throw new Error("Política de calendario no aprobada")
  const local = parts(evaluated), publication = parts(published)
  function date(stage: Stage) {
    if(stage==="INICIAL")return local.year===publication.year && local.month===publication.month && local.day===publication.day ? published : null
    const nominal = stage==="SEMANA" ? new Date(Date.UTC(local.year,local.month-1,local.day+7)) : new Date(Date.UTC(local.year,local.month,Math.min(local.day,new Date(Date.UTC(local.year,local.month+1,0)).getUTCDate())))
    let result = new Date(Date.UTC(nominal.getUTCFullYear(),nominal.getUTCMonth(),nominal.getUTCDate(),policy.hora+3))
    for(let index=0;index<3;index++) {const actual=parts(result);const target=Date.UTC(nominal.getUTCFullYear(),nominal.getUTCMonth(),nominal.getUTCDate(),policy.hora);result=new Date(result.getTime()+target-Date.UTC(actual.year,actual.month-1,actual.day,actual.hour))}
    return result.getTime()<published.getTime() ? null : result
  }
  return Object.fromEntries(STAGES.map(stage=>[stage,date(stage)])) as Record<Stage,Date|null>
}
export function stageMessage(snapshot: ResultSnapshot, url: string | null, stage: Stage): Message {
  const initial=resultMessage(snapshot,url)
  if(stage==="INICIAL")return initial
  const intro=stage==="SEMANA" ? "Te recordamos la evaluación realizada en Casku. Revisa el resultado y las indicaciones que publicó tu profesional." : "Compartimos nuevamente el resultado de la evaluación en Casku para cerrar este seguimiento. Mantén presentes las indicaciones publicadas por tu profesional."
  return {subject:stage==="SEMANA"?"Recordatorio de tu evaluación en Casku":"Seguimiento de tu evaluación en Casku",text:`${intro}\n\n${initial.text}`,html:`<p>${intro}</p>${initial.html}`}
}
export const retryDelay = (attempt: number) => Math.min(60_000 * 2 ** (attempt-1), 3_600_000)
