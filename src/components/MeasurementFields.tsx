"use client"
import { useId } from "react"
import { measurementGroups, type MeasurementForm, type MeasurementKey } from "@/lib/measurement-fields"
export function MeasurementFields({value,onChange,required=false}:{value:MeasurementForm;onChange:(key:MeasurementKey,value:string)=>void;required?:boolean}) {
 const id=useId()
 return <div className="craneometry-measurements">{measurementGroups.map((group,index)=><fieldset key={group.title} className="craneometry-group"><legend><span>{String(index+1).padStart(2,"0")}</span>{group.title}</legend>{index===2&&<p className="craneometry-help">Registra las distancias completas desde el punto occipital externo (POE) hasta cada trago, en mm. DPOE es la diferencia absoluta entre ambas distancias. Las desviaciones históricas no equivalen a estas distancias.</p>}<div className="craneometry-fields">{group.fields.map(({key,label,zero})=><label key={key} htmlFor={`${id}-${key}`}>{label} <span className="craneometry-unit">(mm)</span><input id={`${id}-${key}`} name={key} type="number" inputMode="decimal" min={zero?"0":"0.1"} step="any" required={required} placeholder={zero?"Ej. 0":"En milímetros"} value={value[key]} onChange={event=>onChange(key,event.target.value)}/></label>)}</div></fieldset>)}</div>
}
