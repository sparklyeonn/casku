"use client"
import Link from "next/link"
import { PRIVACY_TEXT, PRIVACY_VERSION, type PrivacyChoice } from "@/lib/privacy/policy"
export type PaperDeclaration = { documentada: boolean; declarante: string; referencia: string }
export const emptyDeclaration: PaperDeclaration = { documentada: false, declarante: "", referencia: "" }
export function PrivacyFields({ value, onChange, disabled = false }: { value: PrivacyChoice; onChange: (value: PrivacyChoice) => void; disabled?: boolean }) {
  function choose(key: "datos" | "correoResultados" | "seguimiento", checked: boolean) {
    const next={...value,version:PRIVACY_VERSION,[key]:checked}
    if(!next.datos){next.correoResultados=false;next.seguimiento=false}
    if(!next.correoResultados)next.seguimiento=false
    onChange(next)
  }
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border p-4"><legend className="px-2 font-semibold">Autorizaciones del apoderado</legend>{(["datos","correoResultados","seguimiento"] as const).map(key=><label key={key} className="flex items-start gap-3 text-sm"><input type="checkbox" checked={value[key]} disabled={key!=="datos"&&!value.datos || key==="seguimiento"&&!value.correoResultados} onChange={event=>choose(key,event.target.checked)} /><span>{PRIVACY_TEXT[key]}{key!=="datos"&&" (Opcional)"}</span></label>)}<p className="text-xs">No aceptar correos no impide inscribirte ni consultar resultados publicados. <Link href="/privacidad" target="_blank" className="underline">Privacidad y uso de datos</Link> · Texto {PRIVACY_VERSION}</p></fieldset>
}
export function PaperPrivacy({ value, onChange, disabled = false }: { value: PaperDeclaration; onChange: (value: PaperDeclaration) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border p-4"><legend className="px-2 font-semibold">Autorización documentada del apoderado</legend><p className="text-sm">{PRIVACY_TEXT.datos}</p><label className="block text-sm">Nombre del apoderado que autorizó<input required maxLength={120} value={value.declarante} onChange={e=>onChange({...value,declarante:e.target.value})} className="mt-1 w-full rounded border bg-white p-2 text-gray-900 dark:bg-gray-900 dark:text-gray-100" /></label><label className="block text-sm">Referencia interna del documento<input required maxLength={100} value={value.referencia} onChange={e=>onChange({...value,referencia:e.target.value})} className="mt-1 w-full rounded border bg-white p-2 text-gray-900 dark:bg-gray-900 dark:text-gray-100" /></label><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={value.documentada} onChange={e=>onChange({...value,documentada:e.target.checked})} /><span>Revisé la autorización expresa documentada del apoderado y dejé su referencia. No estoy aceptando por él ni habilitando correos clínicos.</span></label><p className="text-xs">Conservar el documento de respaldo según el procedimiento de Casku. No ingresar RUT, diagnósticos ni el contenido del documento en la referencia. Texto {PRIVACY_VERSION}.</p></fieldset>
}
