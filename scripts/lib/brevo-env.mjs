// Preserve private values when round-tripping through dotenv; never silently trim secrets.
export function encodeEnvValue(value) {
 if(typeof value!=='string'||!value||/[\r\n\0]/.test(value))throw new Error('INVALID_ENV_VALUE')
 if(/^[A-Za-z0-9_:@./+-]+$/.test(value))return value
 const quote=["'",'"','`'].find(q=>!value.includes(q)&&(q!=='"'||!value.includes('\\')))
 if(!quote)throw new Error('ENV_VALUE_NEEDS_REVIEW')
 return quote+value+quote
}
export function encodeEnvironment(env){return Object.entries(env).map(([key,value])=>{if(!/^[A-Z][A-Z0-9_]*$/.test(key))throw new Error('INVALID_ENV_KEY');return `${key}=${encodeEnvValue(value)}`}).join('\n')+'\n'}
