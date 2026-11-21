export type ContactListCopy={estado:string;revision:number;actual:boolean}
export function resultListLabel(state:string|undefined,family:boolean,version?:number,contact?:ContactListCopy|null) {
 if(state==="RETIRADO")return "Retirado · No utilizar como resultado vigente"
 if(family||state==="PUBLICADO")return `Publicado${version?` · Versión ${version}`:""}`
 if(contact?.estado==="ACEPTADO")return contact.actual?"Copia de contacto aceptada para envío · Sin publicación en cuenta":"Borrador de nueva revisión · Hay una copia anterior enviada"
 if(contact&&["PENDIENTE","ENVIANDO","REINTENTABLE","REVISION"].includes(contact.estado))return "Resultado guardado · Envío de contacto por confirmar"
 return "Borrador · Solo visible para su autora"
}
