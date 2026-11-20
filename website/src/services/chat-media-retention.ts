// 群附件以消息发送时间为准；纯文字和其他业务的对象不受影响。
export const CHAT_MEDIA_RETENTION_SECONDS=7*86400
export function chatMediaExpired(createdAt:number,hasMedia:boolean,at=Math.floor(Date.now()/1000)){
 return hasMedia && Number.isFinite(createdAt) && createdAt<=at-CHAT_MEDIA_RETENTION_SECONDS
}

// 仅为后续审计提取候选；格式异常一律标记为不安全，不能据此删除对象。
export function chatMediaKeysForAudit(imageKey:string|null,media:string|null):{keys:string[];safe:boolean}{
 const keys=new Set<string>();let safe=true
 const add=(value:unknown)=>{
  if(value===null||value===undefined||value==='')return
  if(typeof value==='string'&&/^[mda]\/[a-zA-Z0-9_./-]+$/.test(value)&&!value.includes('..'))return
  if(typeof value!=='string'||!/^c\/[a-zA-Z0-9_./-]+$/.test(value)||value.includes('..')){safe=false;return}
  keys.add(value)
 }
 add(imageKey)
 if(media){
  let items:unknown;try{items=JSON.parse(media)}catch{return {keys:[...keys],safe:false}}
  if(!Array.isArray(items)||items.length>12)return {keys:[...keys],safe:false}
  for(const item of items){
   if(!item||typeof item!=='object'||Array.isArray(item)){safe=false;continue}
   const m=item as Record<string,unknown>;if(!m.k)safe=false;add(m.k);add(m.p);add(m.o)
  }
 }
 return {keys:[...keys],safe}
}
