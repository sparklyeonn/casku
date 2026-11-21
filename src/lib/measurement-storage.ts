import { measurementExtras, readComplementaryValues } from "./measurement-fields"
import { Prisma } from "@prisma/client"
import { REFERENCE_VERSION } from "./craneometry-reference"
import type { parseMeasurements } from "./evaluation-input"
export function complementaryData(m:ReturnType<typeof parseMeasurements>) {
 if(m.protocolo===REFERENCE_VERSION) {
  const extra=measurementExtras(m)
  readComplementaryValues(extra)
  return extra
 }
 if(m.desviacionDer!==undefined||m.desviacionIzq!==undefined)throw new Error("Recaptura las distancias POE–trago para el protocolo v2")
 return Prisma.DbNull
}
export const complementaryValues=readComplementaryValues
