import { LEGACY_REFERENCE_VERSION, REFERENCE_VERSION } from "./craneometry-reference.ts"
export const measurementGroups = [
  { title:"Medidas", fields:[{key:"ap",label:"Distancia anterior posterior",zero:false},{key:"bp",label:"Distancia biparietal",zero:false}] },
  { title:"Diagonales", fields:[{key:"di",label:"Diagonal izquierda frontal a derecha occipital",zero:false},{key:"dd",label:"Diagonal derecha frontal a izquierda occipital",zero:false}] },
  { title:"Distancias POE–trago", fields:[{key:"distanciaPOEtragusDer",label:"Distancia del punto occipital externo (POE) al trago derecho",zero:false},{key:"distanciaPOEtragusIzq",label:"Distancia del punto occipital externo (POE) al trago izquierdo",zero:false}] },
] as const
// Para mostrar copias v1 sin renombrar sus desviaciones como distancias v2.
export const legacyMeasurementGroups = [
  ...measurementGroups.slice(0,2),
  {title:"Desviaciones occipitales · registro histórico",fields:[{key:"desviacionDer",label:"Desviación del punto rojo posterior (POE) al trago derecho",zero:true},{key:"desviacionIzq",label:"Desviación del punto rojo posterior (POE) al trago izquierdo",zero:true}]},
] as const
export type MeasurementKey = typeof measurementGroups[number]["fields"][number]["key"]
export type MeasurementForm = Record<MeasurementKey,string> & { perimetro?:string }
export type MeasurementValues = { ap:number;bp:number;di:number;dd:number;perimetro?:number;protocolo?:typeof REFERENCE_VERSION|typeof LEGACY_REFERENCE_VERSION;distanciaPOEtragusDer?:number;distanciaPOEtragusIzq?:number;desviacionDer?:number;desviacionIzq?:number }
export function measurementForm(m?:MeasurementValues):MeasurementForm {
  // No copiar las desviaciones históricas: ambas distancias deben recapturarse.
  const current=m?.protocolo===REFERENCE_VERSION
  return { ...Object.fromEntries(measurementGroups.flatMap(group=>group.fields.map(({key})=>[key,(!current&&key.startsWith("distanciaPOE"))||m?.[key]===undefined?"":String(m[key])]))), ...(m?.perimetro===undefined?{}:{perimetro:String(m.perimetro)}) } as MeasurementForm
}
export function measurementValues(form:MeasurementForm):MeasurementValues {
  return {ap:Number(form.ap),bp:Number(form.bp),di:Number(form.di),dd:Number(form.dd),protocolo:REFERENCE_VERSION,...(form.perimetro===undefined?{}:{perimetro:Number(form.perimetro)}),distanciaPOEtragusDer:form.distanciaPOEtragusDer===""?NaN:Number(form.distanciaPOEtragusDer),distanciaPOEtragusIzq:form.distanciaPOEtragusIzq===""?NaN:Number(form.distanciaPOEtragusIzq)}
}
export function validMeasurements(m:MeasurementValues,complete=false) {
 return [m.ap,m.bp,m.di,m.dd].every(v=>Number.isFinite(v)&&v>0) && Number.isFinite(m.bp/m.ap*100) && m.bp/m.ap*100>0 && Number.isFinite(Math.abs(m.di-m.dd)/Math.max(m.di,m.dd)*100) && (m.perimetro===undefined||(Number.isFinite(m.perimetro)&&m.perimetro>0)) && m.desviacionDer===undefined && m.desviacionIzq===undefined && ((!complete&&m.protocolo===undefined&&m.distanciaPOEtragusDer===undefined&&m.distanciaPOEtragusIzq===undefined) || (m.protocolo===REFERENCE_VERSION&&[m.distanciaPOEtragusDer,m.distanciaPOEtragusIzq].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>0)))
}
export function measurementExtras(m:MeasurementValues):Omit<MeasurementValues,"ap"|"bp"|"di"|"dd"> {
 const perimeter=m.perimetro===undefined?{}:{perimetro:m.perimetro}
 if(m.protocolo===REFERENCE_VERSION) return {...perimeter,protocolo:REFERENCE_VERSION,distanciaPOEtragusDer:m.distanciaPOEtragusDer!,distanciaPOEtragusIzq:m.distanciaPOEtragusIzq!}
 return m.desviacionDer===undefined ? perimeter : {...perimeter,protocolo:LEGACY_REFERENCE_VERSION,desviacionDer:m.desviacionDer,desviacionIzq:m.desviacionIzq!}
}
// Lectura únicamente: conserva los campos y la versión históricos, sin migrar valores.
export function readComplementaryValues(value:unknown):Omit<MeasurementValues,"ap"|"bp"|"di"|"dd"> {
 if(value===null||value===undefined)return {}
 if(typeof value!=="object"||Array.isArray(value))throw new Error("Mediciones no disponibles")
 const row=value as Record<string,unknown>,v2=row.protocolo===REFERENCE_VERSION
 if(!v2&&row.protocolo!==LEGACY_REFERENCE_VERSION)throw new Error("Mediciones no disponibles")
 const keys=v2?["distanciaPOEtragusDer","distanciaPOEtragusIzq"]:["desviacionDer","desviacionIzq"]
 const incompatible=v2?["desviacionDer","desviacionIzq"]:["distanciaPOEtragusDer","distanciaPOEtragusIzq"]
 if(incompatible.some(k=>row[k]!==undefined)||!keys.every(k=>typeof row[k]==="number"&&Number.isFinite(row[k])&&(v2?Number(row[k])>0:Number(row[k])>=0))||(row.perimetro!==undefined&&(typeof row.perimetro!=="number"||!Number.isFinite(row.perimetro)||row.perimetro<=0)))throw new Error("Mediciones no disponibles")
 return {...(row.perimetro===undefined?{}:{perimetro:row.perimetro as number}),protocolo:row.protocolo as MeasurementValues["protocolo"],...Object.fromEntries(keys.map(k=>[k,row[k]]))}
}
