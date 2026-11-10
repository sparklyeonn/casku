export function mailEvent(event: { nombre: string; fecha: Date; lugar: string }) {
  return { nombre: event.nombre, fecha: event.fecha.toISOString().slice(0, 10), lugar: event.lugar }
}
export function readMailEvent(value: unknown): ReturnType<typeof mailEvent> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Comprobante sin datos de evento")
  const row = value as Record<string, unknown>
  if (typeof row.nombre !== "string" || typeof row.lugar !== "string" || typeof row.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.fecha)) throw new Error("Comprobante con evento inválido")
  return { nombre: row.nombre, lugar: row.lugar, fecha: row.fecha }
}
