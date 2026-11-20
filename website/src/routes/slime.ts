import {Hono} from 'hono'
import type {Ctx} from '../types'
import {needUser} from '../services/auth'
import {validWorld} from '../../vendor/slime-game/src/world/storage'

const MAX_BYTES=512*1024
type Save={revision:number;state:string;state_hash:string;operation:string;updated_at:number}
export function validSlimeSave(value:unknown):boolean{
 let nodes=0
 const safe=(v:unknown,depth=0):boolean=>{
  if(++nodes>50000||depth>32)return false
  if(v===null||typeof v==='boolean')return true
  if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER
  if(typeof v==='string')return v.length<=12000
  if(typeof v!=='object')return false
  return Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype'].includes(k)&&safe(x,depth+1))
 }
 if(!safe(value)||!value||typeof value!=='object'||Array.isArray(value))return false
 const s=value as Record<string,any>
 if(s.saveVersion!==4||typeof s.started!=='boolean'||!Array.isArray(s.slimes)||s.slimes.length>500||!Array.isArray(s.monsters)||s.monsters.length>500)return false
 const creatures=[...s.slimes,...s.monsters],ids=new Set<number>()
 for(const p of creatures){if(!p||!Number.isSafeInteger(p.id)||p.id<1||ids.has(p.id)||typeof p.name!=='string'||p.name.length>200)return false;ids.add(p.id)}
 if(['coins','points','summonerExp','totalEarned','lastActive'].some(k=>typeof s[k]!=='number'||!Number.isFinite(s[k])||s[k]<0))return false
 if(['level','abyssLevel','abyssUnlocked','seq'].some(k=>!Number.isSafeInteger(s[k])||s[k]<1))return false
 return validWorld(s.world,s.slimes.map((p:{id:number})=>p.id))
}
export const slime=new Hono<Ctx>()
slime.get('/slime',async c=>{
 if(!c.get('user'))return c.redirect('/login?next=%2Fslime')
 needUser(c)
 const url=new URL(c.req.url);url.pathname='/slime-game.html';url.search=''
 const response=await c.env.ASSETS.fetch(new Request(url))
 return new Response(response.body,{status:response.status,headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'}})
})
slime.use('/api/slime/*',async(c,next)=>{needUser(c);c.header('cache-control','no-store');await next()})
slime.get('/api/slime/state',async c=>{
 const u=needUser(c),row=await c.env.DB.prepare('SELECT revision,state,operation,updated_at FROM slime_saves WHERE user_id=?').bind(u.id).first<Save>()
 return c.json({user_id:u.id,revision:row?.revision??0,state:row?JSON.parse(row.state):null,operation:row?.operation??null,updated_at:row?.updated_at??null})
})
slime.post('/api/slime/state',c=>{needUser(c);return c.json({error:'史莱姆已下线，历史云存档可继续导出',code:'slime_retired'},410)})
