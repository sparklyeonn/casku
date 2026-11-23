import{readFile}from'node:fs/promises'
import{resolve,dirname,basename}from'node:path'
import{fileURLToPath}from'node:url'
import{createHash}from'node:crypto'
import{parse}from'dotenv'
import{readPrivate,withLock}from'./lib/daily-reminders.mjs'
import{validateResultBatch}from'../src/lib/results/expo-scheduled-message.ts'
import{cancelScheduledExpoItem}from'./lib/result-batch-scheduler.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dir=resolve(root,'test-results/resultados-expo-20261123/programacion')
const check=(ok,code)=>{if(!ok)throw Error(code)}
export async function main(args=process.argv.slice(2)){
 check(args.length===6&&args[0]==='--evaluation-id'&&args[2]==='--database-env'&&args[4]==='--approve','INVALID_ARGUMENTS')
 check(basename(args[3])==='.env.vercel-ensayo','EXPECTED_OPERATIONAL_DATABASE_FILE')
 const plan=await readPrivate(resolve(dir,'plan.json'));validateResultBatch(plan,args[5])
 const item=plan.items.find(x=>x.evaluacionId===args[1]);check(item,'ITEM_OUTSIDE_APPROVED_BATCH')
 const connectionString=parse(await readFile(resolve(root,args[3]))).DATABASE_URL
 check(connectionString&&createHash('sha256').update(connectionString).digest('hex')===plan.databaseFingerprint,'DATABASE_TARGET_CHANGED')
 const local=parse(await readFile(resolve(root,'.env.local'))),{PrismaClient}=await import('@prisma/client'),{PrismaPg}=await import('@prisma/adapter-pg')
 check(local.BREVO_API_KEY,'MISSING_API_KEY')
 const db=new PrismaClient({adapter:new PrismaPg({connectionString})})
 try{return await withLock(dir,async()=>{const result=await cancelScheduledExpoItem({dir,plan,item,db,config:{baseUrl:'https://api.brevo.com',key:local.BREVO_API_KEY},fetcher:globalThis.fetch});await db.accesoPrivado.create({data:{actorId:'operacion:resultados-expo-20261123',perfilActor:'OPERACION_AUTORIZADA_CASKU',accion:'CANCELAR_CORREO_EXPO',recurso:'EVALUACION',recursoId:item.evaluacionId}});return result})}finally{await db.$disconnect()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error(JSON.stringify({estado:'CANCELACION_NO_CONFIRMADA_REVISAR_RECIBOS',envios:0}));process.exitCode=1})
