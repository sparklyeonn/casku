export const measurementGroups = [
  { title:"Medidas", fields:[{key:"ap",label:"Distancia anterior posterior",zero:false},{key:"bp",label:"Distancia biparietal",zero:false}] },
  { title:"Diagonales", fields:[{key:"di",label:"Diagonal izquierda frontal a derecha occipital",zero:false},{key:"dd",label:"Diagonal derecha frontal a izquierda occipital",zero:false}] },
  { title:"Desviaciones occipitales", fields:[{key:"desviacionDer",label:"Desviación del punto rojo posterior (POE) al trago derecho",zero:true},{key:"desviacionIzq",label:"Desviación del punto rojo posterior (POE) al trago izquierdo",zero:true}] },
] as const
export type MeasurementKey = typeof measurementGroups[number]["fields"][number]["key"]
export type MeasurementForm = Record<MeasurementKey,string> & { perimetro?:string }
export type MeasurementValues = { ap:number;bp:number;di:number;dd:number;perimetro?:number;desviacionDer?:number;desviacionIzq?:number }
export function measurementForm(m?:MeasurementValues):MeasurementForm {
  return { ...Object.fromEntries(measurementGroups.flatMap(group=>group.fields.map(({key})=>[key,m?.[key]===undefined?"":String(m[key])]))), ...(m?.perimetro===undefined?{}:{perimetro:String(m.perimetro)}) } as MeasurementForm
}
export function measurementValues(form:MeasurementForm):MeasurementValues {
  return {ap:Number(form.ap),bp:Number(form.bp),di:Number(form.di),dd:Number(form.dd),...(form.perimetro===undefined?{}:{perimetro:Number(form.perimetro)}),...([form.desviacionDer,form.desviacionIzq].some(v=>v!=="")?{desviacionDer:form.desviacionDer===""?NaN:Number(form.desviacionDer),desviacionIzq:form.desviacionIzq===""?NaN:Number(form.desviacionIzq)}:{})}
}
export function validMeasurements(m:MeasurementValues,complete=false) {
 return [m.ap,m.bp,m.di,m.dd].every(v=>Number.isFinite(v)&&v>0) && Number.isFinite(m.bp/m.ap*100) && m.bp/m.ap*100>0 && Number.isFinite(Math.abs(m.di-m.dd)/Math.min(m.di,m.dd)*100) && (m.perimetro===undefined||(Number.isFinite(m.perimetro)&&m.perimetro>0)) && ((!complete&&m.desviacionDer===undefined&&m.desviacionIzq===undefined) || [m.desviacionDer,m.desviacionIzq].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0))
}
export function measurementExtras(m:MeasurementValues) {
 return m.desviacionDer===undefined ? {} : {...(m.perimetro===undefined?{}:{perimetro:m.perimetro}),desviacionDer:m.desviacionDer,desviacionIzq:m.desviacionIzq!}
}
