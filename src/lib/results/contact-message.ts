import { resultMessage } from "./message.ts"
import type { ResultSnapshot } from "./snapshot.ts"
export function contactMessage(data:ResultSnapshot, to:string) {
  return {to,...resultMessage(data,null,"CONTACTO")}
}
