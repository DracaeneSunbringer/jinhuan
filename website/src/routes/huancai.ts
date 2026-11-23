// 欢彩已下线（2026-11-12 b19）。未开奖彩票已全额退回 D币；页面和购买入口返回 410，购买记录仍可查看。
// 下线时的退款 / 保底结算在 legacy/live-app.js 的 b19RetireHuancai，依赖 ../huancai 与 ../huancai-weekly。
import {Hono} from 'hono'
import type {Ctx} from '../types'
import {fail} from '../lib/http'
import {needMember} from '../services/chat-access'

export const huancai=new Hono<Ctx>()
huancai.get('/api/huancai',c=>c.json({error:'欢彩已下线，未开奖彩票已全额退回 D币',code:'huancai_retired',retired:true},410))
huancai.post('/api/huancai/buy',c=>c.json({error:'欢彩已下线',code:'huancai_retired'},410))
huancai.get('/api/huancai/orders',async c=>{
 const {u}=await needMember(c,1),before=Number(c.req.query('before')||Number.MAX_SAFE_INTEGER)
 if(!Number.isSafeInteger(before)||before<1)fail(400,'记录位置无效')
 const {results}=await c.env.DB.prepare('SELECT id,kind,price,payload,created_at FROM huancai_orders WHERE user_id=? AND id<? ORDER BY id DESC LIMIT 11').bind(u.id,before).all<{id:number;payload:string}>()
 return c.json({orders:results.slice(0,10).map(x=>({...x,payload:JSON.parse(x.payload)})),next:results.length>10?results[9].id:null})
})
