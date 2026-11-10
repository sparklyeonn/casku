import { prisma } from "@/lib/prisma"
import { deliverConfirmation } from "@/lib/families/confirmation"
import { promoteLocked } from "./promotion"
export async function notifyAssignments(ids: string[]) {
  // Las reservas ya están confirmadas. Un fallo de correo conserva la orden recuperable.
  const results = await Promise.allSettled(ids.map(id => deliverConfirmation(id)))
  if (results.some(result => result.status === "rejected")) console.error("Confirmación de lista de espera pendiente de reintento")
}
export async function processAvailable(eventoId: string, origen: string) {
  let assigned = 0
  for (let batch = 0; batch < 20; batch++) {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Evento" WHERE id=${eventoId}::uuid FOR UPDATE`
      const before = await tx.listaEspera.count({ where: { eventoId, estado: "PENDIENTE" } })
      const ids = await promoteLocked(tx, eventoId, origen)
      const after = await tx.listaEspera.count({ where: { eventoId, estado: "PENDIENTE" } })
      return { ids, more: after > 0 && after < before }
    }, { timeout: 15000 })
    await notifyAssignments(result.ids)
    assigned += result.ids.length
    if (!result.more) break
  }
  return assigned
}
