import { Prisma } from "@prisma/client"
import { REFERENCE_VERSION } from "./craneometry-reference"
import type { parseMeasurements } from "./evaluation-input"
export function complementaryData(m:ReturnType<typeof parseMeasurements>) {
 return m.perimetro===undefined ? Prisma.DbNull : {perimetro:m.perimetro,desviacionDer:m.desviacionDer!,desviacionIzq:m.desviacionIzq!,protocolo:REFERENCE_VERSION}
}
export function complementaryValues(value:unknown) {
 if (value===null || value===undefined) return {}
 if(typeof value!=="object"||Array.isArray(value)) throw new Error("Mediciones no disponibles")
 const row=value as Record<string,unknown>
 if(row.protocolo!==REFERENCE_VERSION||typeof row.perimetro!=="number"||!Number.isFinite(row.perimetro)||row.perimetro<=0||![row.desviacionDer,row.desviacionIzq].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0)) throw new Error("Mediciones no disponibles")
 return {perimetro:row.perimetro,desviacionDer:row.desviacionDer as number,desviacionIzq:row.desviacionIzq as number}
}
