import { Prisma } from "@prisma/client"
import { EventConflict, EventEditConflict } from "./store"
import { EventInputError } from "./input"

export function eventResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } })
}
export function eventFailure(error: unknown) {
  if (error instanceof EventInputError) return eventResponse({ error: error.message, field: error.field }, 400)
  if (error instanceof EventEditConflict) return eventResponse({ error: error.message }, 409)
  if (error instanceof EventConflict) return eventResponse({ error: "Este envío ya corresponde a otro evento. Recarga la página antes de continuar." }, 409)
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) return eventResponse({ error: "La base de eventos necesita actualizarse antes de continuar.", code: "EVENT_SCHEMA_PENDING" }, 503)
  console.error("Gestión de eventos no disponible", error instanceof Error ? error.name : "Error")
  return eventResponse({ error: "No pudimos completar la operación. Intenta nuevamente." }, 503)
}

export async function readEventJson(request: Request) {
  // También impide envíos mediante formularios externos con text/plain.
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new EventInputError("Envía los datos en formato JSON.")
  try { return await request.json() } catch { throw new EventInputError("El formulario no contiene datos válidos.") }
}
