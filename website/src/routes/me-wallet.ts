import {Hono} from 'hono'
import type {Ctx} from '../types'
import {needUser} from '../services/auth'
import {fail} from '../lib/http'

export const meWallet=new Hono<Ctx>()
meWallet.get('/api/me/wealth',async c=>{
 needUser(c);c.header('cache-control','private,max-age=30')
 const sort=c.req.query('sort')||'balance';if(!['balance','total'].includes(sort))fail(400,'排序方式无效')
 const table=sort==='total'?'coin52_wealth':'coin52_wallets',value=sort==='total'?'earned':'balance',index=sort==='total'?'idx_coin52_wealth_rank':'idx_coin52_wallet_rank'
 const rows=await c.env.DB.prepare(`SELECT u.id,u.username,COALESCE(NULLIF(u.nick,''),NULLIF(u.name,''),u.username) AS name,w.${value} AS amount FROM ${table} w INDEXED BY ${index} JOIN users u ON u.id=w.user_id WHERE u.kind='user' AND u.disabled=0 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id) ORDER BY w.${value} DESC,w.user_id LIMIT 50`).all()
 return c.json({sort,rows:rows.results})
})
meWallet.get('/api/me/wallet',async c=>{
 const u=needUser(c),raw=c.req.query('before'),before=raw===undefined?Number.MAX_SAFE_INTEGER:Number(raw)
 c.header('cache-control','no-store')
 if(raw!==undefined&&(!/^[1-9]\d{0,15}$/.test(raw)||!Number.isSafeInteger(before)))fail(400,'流水游标无效')
 const wallet=await c.env.DB.prepare('SELECT balance,updated_at FROM coin52_wallets WHERE user_id=?').bind(u.id).first<{balance:number;updated_at:number}>()
 if(c.req.query('ledger')!=='1')return c.json({balance:wallet?.balance??0,updated_at:wallet?.updated_at??null})
 const result=await c.env.DB.prepare('SELECT id,kind,delta,balance_after,created_at FROM coin52_ledger WHERE user_id=? AND id<? ORDER BY id DESC LIMIT 21').bind(u.id,before).all<{id:number}>()
 const rows=result.results.slice(0,20)
 return c.json({balance:wallet?.balance??0,updated_at:wallet?.updated_at??null,rows,next:result.results.length>20?rows.at(-1)!.id:null})
})
