// Shared trust boundary for imported files, browser recovery and cloud writes.
export function validArcadeSave(game,value,{partial=false}={}){
 let nodes=0
 const safe=(v,depth=0)=>{
  if(++nodes>40000||depth>20)return false
  if(v===null||typeof v==='boolean')return true
  if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER
  if(typeof v==='string')return v.length<=4000&&(game!=='rift'||!/[<>]/.test(v))
  if(typeof v!=='object'||(Array.isArray(v)&&v.length>2000))return false
  return Object.entries(v).every(([k,x])=>/^[\w.-]{1,100}$/.test(k)&&!['__proto__','constructor','prototype'].includes(k)&&safe(x,depth+1))
 }
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v)
 if(!object(value)||!safe(value))return false
 const nonnegative=(s,keys)=>keys.every(k=>partial&&s[k]===undefined||typeof s[k]==='number'&&s[k]>=0)
 if(game==='mole'){
  const s=value
  return Number.isSafeInteger(s.level)&&s.level>=1&&nonnegative(s,['xp','coins','sprouts','depth','totalDigs','lastSavedAt'])&&['forest','city','rainforest'].includes(s.activeMap)&&object(s.inventory)&&object(s.skills)&&Array.isArray(s.logs)&&s.logs.length<=30&&s.logs.every(x=>object(x)&&typeof x.time==='string'&&x.time.length<=80&&typeof x.message==='string'&&x.message.length<=2000)&&typeof s.playerName==='string'&&s.playerName.length<=80
 }
 if(game!=='rift'||![1,2].includes(value.version)||!object(value.state)||typeof value.savedAt!=='number'||value.savedAt<0)return false
 const s=value.state
 if(!nonnegative(s,['level','gold','exp','floor','maxFloor']))return false
 if(s.inventory!==undefined&&(!Array.isArray(s.inventory)||s.inventory.length>1500))return false
 if(s.equipment!==undefined&&!object(s.equipment))return false
 const items=[...(s.inventory||[]),...Object.values(s.equipment||{}).filter(Boolean)]
 for(const item of items){
  if(!object(item)||typeof item.id!=='string'||!/^[-\w]{1,120}$/.test(item.id)||typeof item.name!=='string'||item.name.length>200||!['common','fine','rare','epic','legendary','mythic'].includes(item.quality)||!['weapon','helmet','chest','gloves','boots','ring','necklace','ring1','ring2'].includes(item.slotType))return false
  if(item.enh!==undefined&&(typeof item.enh!=='number'||item.enh<0))return false
  if(item.stats!==undefined&&!(Array.isArray(item.stats)||object(item.stats)))return false
 }
 if(s.log!==undefined&&(!Array.isArray(s.log)||s.log.length>150||s.log.some(x=>!object(x)||typeof x.text!=='string'||(x.type!==undefined&&!/^[a-zA-Z0-9_-]{1,30}$/.test(x.type))||(x.cat!==undefined&&!/^[a-zA-Z0-9_-]{1,30}$/.test(x.cat)))))return false
 return true
}
