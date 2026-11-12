import { adminAccess } from "@/lib/team/http"
import { familyFailure,familyResponse } from "@/lib/families/http"
import { parseEventId } from "@/lib/events/input"
import { prisma } from "@/lib/prisma"
export async function GET(request:Request) {
  const access=await adminAccess();if(access.response)return access.response
  try {
    const eventoId=parseEventId(new URL(request.url).searchParams.get("eventoId"))
    const estados=await prisma.ordenCorreo.groupBy({by:["etapa","estado","entrega"],where:{publicacion:{evaluacion:{fila:{is:{eventoId}}}}},_count:{_all:true}})
    return familyResponse({automatizacion:process.env.CASKU_MAIL_AUTOMATION==="1",estados:estados.map(row=>({etapa:row.etapa,estado:row.estado,entrega:row.entrega,cantidad:row._count._all}))})
  }catch(error){return familyFailure(error)}
}
