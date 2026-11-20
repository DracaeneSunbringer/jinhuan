import {LOTTO_PRIZES,LOTTO_V2,LOTTO_JACKPOT,SCRATCH_PRIZES,jackpotPayout,lottoPayout,fixedJackpotPayout,LOTTO_FIXED_PRIZES} from '../shared/huancai-rules'
import {Hono} from 'hono'
import type {Ctx} from '../types'
import {boundedJson,fail,sameOrigin} from '../lib/http'
import {needMember} from '../services/chat-access'
import {now} from '../lib/time'
import {ensureCoinWallet} from '../farm/coin-packets'
import {buyHuancai,ensureRound,huancaiDay,HuancaiError,SCRATCH_THEMES} from '../huancai'
export const huancai=new Hono<Ctx>()
huancai.get('/api/huancai',async c=>{
 const {u}=await needMember(c,1),db=c.env.DB,t=now(),next=await ensureRound(db,t)
 await ensureCoinWallet(db,u.id,t)
 const [wallet,round,usage,scratch,history,tickets,jackpot,weekly,daily]=await Promise.all([
  db.prepare('SELECT balance FROM coin52_wallets WHERE user_id=?').bind(u.id).first(),
  db.prepare('SELECT day,closes_at,special,tickets,sales,rules_version FROM huancai_rounds WHERE day=?').bind(next.day).first(),
  db.prepare('SELECT lotto_count FROM huancai_usage WHERE user_id=? AND day=?').bind(u.id,next.day).first(),
  db.prepare('SELECT scratch_spent FROM huancai_usage WHERE user_id=? AND day=?').bind(u.id,huancaiDay(t)).first(),
  db.prepare("SELECT day,special,front,back,tickets,pool,rules_version,prize_counts,pool_paid FROM huancai_rounds WHERE state='paid' ORDER BY closes_at DESC LIMIT 7").all<{day:string;special:number;front:string;back:string;tickets:number;pool:number;rules_version:number;prize_counts:string|null;pool_paid:number}>(),
  db.prepare('SELECT min(t.id) AS id,t.day,t.front,t.back,t.weight,sum(t.payout) AS payout,max(t.settled_at) AS settled_at,count(*) AS count,r.rules_version FROM huancai_tickets t JOIN huancai_rounds r ON r.day=t.day WHERE t.user_id=? AND t.day>=? GROUP BY t.day,t.front,t.back,t.weight,(t.settled_at IS NOT NULL) ORDER BY CASE WHEN sum(t.payout)>0 THEN 0 ELSE 1 END,t.day DESC,min(t.id) LIMIT 100').bind(u.id,huancaiDay(t-6*86400)).all(),
  db.prepare('SELECT seed,available,reserved,contributed,paid,topups FROM huancai_jackpot WHERE id=1').first<{seed:number;available:number;reserved:number;contributed:number;paid:number;topups:number}>(),
  db.prepare('SELECT w.week,w.mode,w.payout,w.user_id,w.created_at,COALESCE(u.nick,u.name,u.username) AS name FROM huancai_weekly w LEFT JOIN users u ON u.id=w.user_id ORDER BY w.week DESC LIMIT 8').all(),
  db.prepare('SELECT d.day,d.sales,d.payout,d.user_id,COALESCE(u.nick,u.name,u.username) AS name FROM huancai_daily d LEFT JOIN users u ON u.id=d.user_id WHERE d.user_id IS NOT NULL ORDER BY d.day DESC LIMIT 7').all(),
 ])
 const records=history.results.map(r=>{const counts=r.prize_counts?JSON.parse(r.prize_counts):{};return {...r,prize_counts:undefined,first_count:counts[1]||0,first_prize:r.rules_version>=2?(r.rules_version>=4?fixedJackpotPayout:r.rules_version>=3?jackpotPayout:lottoPayout)(1,counts,r.pool):0}})
 return c.json({balance:wallet?.balance||0,round,weekly:weekly.results,daily:daily.results,lotto_rules:LOTTO_V2,jackpot_rules:LOTTO_JACKPOT,jackpot:jackpot?{...jackpot,total:jackpot.available+jackpot.reserved,first_estimate:next.rules_version>=4?LOTTO_FIXED_PRIZES[1]:jackpot.reserved?null:jackpotPayout(1,{'1':1},jackpot.available)}:null,prizes:LOTTO_PRIZES.map(p=>next.rules_version>=4?{...p,prize:LOTTO_FIXED_PRIZES[p.tier].toLocaleString('zh-CN')+' D币 / 注'}:next.rules_version>=3&&p.tier<3?{...p,prize:p.tier===1?'开奖奖池10% · 同档均分':'开奖奖池1% · 同档均分'}:p),scratch_prizes:SCRATCH_PRIZES,scratch_win_percent:40.02,scratch_rtp:65,lotto_count:usage?.lotto_count||0,scratch_spent:scratch?.scratch_spent||0,themes:SCRATCH_THEMES,history:records,tickets:tickets.results})
})
huancai.post('/api/huancai/buy',async c=>{
 sameOrigin(c);const {u}=await needMember(c,1),body=await boundedJson(c,16384)
 try{return c.json({order:await buyHuancai(c.env.DB,u.id,body,now())})}catch(e){if(e instanceof HuancaiError)fail(409,e.message);console.error('huancai_buy_failed');fail(503,'结算状态暂未确认，请重试原订单，不会重复扣款')}
})
huancai.get('/api/huancai/orders',async c=>{
 const {u}=await needMember(c,1),before=Number(c.req.query('before')||Number.MAX_SAFE_INTEGER)
 if(!Number.isSafeInteger(before)||before<1)fail(400,'记录位置无效')
 const {results}=await c.env.DB.prepare('SELECT id,kind,price,payload,created_at FROM huancai_orders WHERE user_id=? AND id<? ORDER BY id DESC LIMIT 11').bind(u.id,before).all<{id:number;payload:string}>()
 return c.json({orders:results.slice(0,10).map(x=>({...x,payload:JSON.parse(x.payload)})),next:results.length>10?results[9].id:null})
})
