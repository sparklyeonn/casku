import Link from "next/link"
import { requireTeamRole } from "@/lib/access"
import { TeamShell } from "./TeamShell"
import { roleLabels, type Role } from "@/lib/roles"
const scope: Record<Role, string> = {
  KINESIOLOGO: "Registrar mediciones y guardar evaluaciones con tu nombre profesional.",
  RECEPCION: "Gestionar inscripciones, llegadas y fila. No incluye acceso clínico.",
  ADMIN: "Configurar eventos y gestionar accesos. No incluye permiso clínico.",
}
export async function RoleWorkspace({ role }: { role: Role }) {
  const user = await requireTeamRole([role])
  return <TeamShell user={user}><main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
    <h1 className="text-3xl font-semibold">{roleLabels[role]}</h1><p>{scope[role]}</p>
    <section className="rounded-xl border p-6"><h2 className="text-xl font-medium">Disponible en esta etapa</h2>
      <p className="mt-3">Inicio y cierre de sesión, cuenta individual y restricciones de acceso por perfil.</p>
      {role === "KINESIOLOGO" ? <Link href="/evaluacion" className="mt-5 inline-block rounded-lg bg-teal-700 px-5 py-3 text-white">Abrir formulario de craneometría</Link> : <p className="mt-4 text-sm text-gray-500">{role === "RECEPCION" ? "La inscripción y la fila se incorporarán después de integrar los registros del evento." : "La configuración de eventos y la administración visual de cuentas se incorporarán en las siguientes etapas. Las cuentas se habilitan por configuración de servidor."}</p>}
    </section>
    <section className="rounded-xl border p-6"><h2 className="text-xl font-medium">Tus permisos</h2><p className="mt-3">{scope[role]}</p><p className="mt-3 text-sm text-gray-500">Los permisos se comprueban en el servidor. Cambiar una dirección web no concede acceso a otro perfil.</p></section>
  </main></TeamShell>
}
