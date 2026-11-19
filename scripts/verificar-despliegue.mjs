import { checkDeploymentEnvironment } from '../src/lib/deployment-policy.ts'
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--stage' || !['ensayo', 'produccion'].includes(args[1])) {
  console.error('Uso: npm run deploy:check -- --stage ensayo|produccion. Recibe variables del proceso; no carga .env.local ni contacta servicios.')
  process.exitCode = 1
} else {
  const result = checkDeploymentEnvironment(process.env, args[1])
  console.log(JSON.stringify(result, null, 2))
  if (!result.variablesValidas) process.exitCode = 1
}
