const months=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]
export function formatResultBirthDate(value:string) {
 const [year,month,day]=value.split('-').map(Number)
 return `${day} de ${months[month-1]} de ${year}`
}
// Assemble the text explicitly: Intl dateStyle/timeStyle uses different literals
// in Node and WebKit (", 6:00 a. m." versus "a las 6:00 a.m.").
export function formatResultDateTime(value:string) {
 const parts=new Intl.DateTimeFormat('en-US-u-nu-latn',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value))
 const part=(key:string)=>parts.find(p=>p.type===key)!.value
 return `${Number(part('day'))} de ${months[Number(part('month'))-1]} de ${part('year')}, ${part('hour').padStart(2,'0')}:${part('minute').padStart(2,'0')}`
}
