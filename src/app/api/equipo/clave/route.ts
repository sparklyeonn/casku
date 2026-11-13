import { getTeamUser } from "@/lib/access"
import { teamJson,teamResponse,teamFailure } from "@/lib/team/http"
import { changeOwnPassword,samePasswordOrigin } from "@/lib/team-passwords/store"
export async function POST(request:Request) {
 if(!samePasswordOrigin(request))return teamResponse({error:"Solicitud no autorizada."},403)
 try {const user=await getTeamUser({allowPasswordChange:true});if(!user)return teamResponse({error:"Inicia sesión con tu cuenta del equipo."},401);return teamResponse(await changeOwnPassword(user,await teamJson(request)))}catch(error){return teamFailure(error)}
}
