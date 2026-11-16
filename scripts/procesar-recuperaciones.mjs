import {config} from "dotenv"
config({path:[".env.local",".env"],quiet:true})
try {
 const origin=new URL(process.env.AUTH_URL||process.env.NEXTAUTH_URL||"")
 if(origin.username||origin.password||!(origin.protocol==="https:"||(origin.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(origin.hostname))))throw new Error()
 const secret=process.env.CASKU_PASSWORD_RECOVERY_WORKER_SECRET||""
 if(secret.length<32||secret.length>256||!/^[A-Za-z0-9_-]+$/.test(secret))throw new Error()
 const response=await fetch(new URL("/api/interno/recuperaciones/procesar",origin.origin),{method:"POST",headers:{authorization:`Bearer ${secret}`},redirect:"error",signal:AbortSignal.timeout(90_000)})
 if(!response.ok)throw new Error()
 const body=await response.json()
 if(body.estado==="DESACTIVADO")console.log("Proceso de recuperación desactivado o pendiente de configuración.")
 else console.log(JSON.stringify({procesadas:body.procesadas,enviadas:body.enviadas,omitidas:body.omitidas,fallidas:body.fallidas,revision:body.revision}))
} catch {console.error("No se pudo ejecutar el proceso privado de recuperación. Revisa configuración y conectividad.");process.exitCode=1}
