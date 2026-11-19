import { measurementExtras } from "./measurement-fields"
import { Prisma } from "@prisma/client"
import { REFERENCE_VERSION } from "./craneometry-reference"
import type { parseMeasurements } from "./evaluation-input"
export function complementaryData(m:ReturnType<typeof parseMeasurements>) {
 return m.desviacionDer===undefined ? Prisma.DbNull : {...measurementExtras(m),protocolo:REFERENCE_VERSION}
}
export function complementaryValues(value:unknown): {perimetro?:number;desviacionDer?:number;desviacionIzq?:number} {
 if (value===null || value===undefined) return {}
 if(typeof value!=="object"||Array.isArray(value)) throw new Error("Mediciones no disponibles")
 const row=value as Record<string,unknown>
 if(row.protocolo!==REFERENCE_VERSION||(row.perimetro!==undefined&&(typeof row.perimetro!=="number"||!Number.isFinite(row.perimetro)||row.perimetro<=0))||![row.desviacionDer,row.desviacionIzq].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0)) throw new Error("Mediciones no disponibles")
 return {...(row.perimetro===undefined?{}:{perimetro:row.perimetro as number}),desviacionDer:row.desviacionDer as number,desviacionIzq:row.desviacionIzq as number}
}
