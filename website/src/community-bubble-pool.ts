import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import type {Ctx} from './types'
import {needMember} from './services/chat-access'
import {isOwner} from './services/auth'
import {boundedJson,fail,sameOrigin} from './lib/http'
import {ensureCoinWallet} from './farm/coin-packets'
import {now} from './lib/time'
import {raffleRoll} from './title-growth'
import {readCommunityCatalog} from './community-skins/sync.mjs'

const PRICE=100,PITY=60,PREFIX='bubble:community:',LIMITED_CHANCE=5,CARD_PACK='owner52b'
export const BUBBLE_PRIZE_CUTOFF=1793548800
export const BUBBLE_PRIZE_POLICY={denominator:10000,jackpotBand:1,jackpotAmount:120000,baseMin:12,baseSpan:9988} as const
const CARD_CATALOG=[
 {id:'0',name:'玛奇玛',rarity:'UR',description:'链锯人角色；冷静、支配与红色环纹。',asset:'/assets/owner52-v033/cards/0-makima.webp',back:'/assets/owner52-v033/cards/back.webp'},
 {id:'1',name:'蕾塞',rarity:'SSR',description:'链锯人角色；深色短发、花朵与爆裂蓝紫。',asset:'/assets/owner52-v033/cards/1-reze.webp',back:'/assets/owner52-v033/cards/back.webp'},
 {id:'2',name:'杀手皇后',rarity:'SR',description:'JoJo 替身；保持粉色猫头人形替身轮廓。',asset:'/assets/owner52-v033/cards/2-killer-queen.webp',back:'/assets/owner52-v033/cards/back.webp'},
 {id:'3',name:'山田',rarity:'R',description:'《在超市后门吸烟的二人》角色；红色三角头巾与亲和笑容。',asset:'/assets/owner52-v033/cards/3-yamada.webp',back:'/assets/owner52-v033/cards/back.webp'},
 {id:'4',name:'田山',rarity:'R',description:'《在超市后门吸烟的二人》角色；酒红齐刘海、低束发与黑色颈圈。',asset:'/assets/owner52-v033/cards/4-tayama.webp',back:'/assets/owner52-v033/cards/back.webp'},
 {id:'5',name:'初音未来',rarity:'SSR',description:'Piapro Character；青绿色双马尾与舞台麦克风。',asset:'/assets/owner52-v033/cards/5-miku.webp',back:'/assets/owner52-v033/cards/back.webp'},
 {id:'6',name:'雪之下雪乃',rarity:'UR',description:'《我的青春恋爱喜剧果然有问题》角色；黑长发、冷静眼神与书本。',asset:'/assets/owner52-v033/cards/6-yukino.webp',back:'/assets/owner52-v033/cards/back.webp'},
] as const
class BubbleRuleError extends Error {}
type Bubble={id:string;name:string;author:string;components:{bubble?:unknown;title?:unknown;badge?:unknown;reply?:unknown}}
type Catalog={source:string;entries:Bubble[]}
type Receipt={request_id:string;item_id:string|null;won:number;duplicate:number;guaranteed:number;pity_after:number;chance:number;finger_level:number;catalog_source:string;card_id:string|null;card_duplicate:number;reward_amount:number;created_at:number}
const available=(catalog:Catalog)=>catalog.entries.filter((x,i,a)=>x.components?.bubble&&/^[a-z0-9][a-z0-9-]{2,47}$/.test(x.id)&&a.findIndex(y=>y.id===x.id)===i)
const ownerId=(value:string|undefined)=>{const text=(value||'').split(',')[0]?.trim();return /^\d+$/.test(text||'')?Number(text):0}
const randomIndex=(length:number)=>{const limit=Math.floor(4294967296/length)*length;let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0]}while(n>=limit);return n%length}
export const bubblePrizeReward=(won:boolean,owner:boolean,pick=randomIndex,t=now())=>{
 if(won||owner||t>=BUBBLE_PRIZE_CUTOFF)return 0
 const band=pick(BUBBLE_PRIZE_POLICY.denominator)
 if(band<BUBBLE_PRIZE_POLICY.jackpotBand)return BUBBLE_PRIZE_POLICY.jackpotAmount
 return BUBBLE_PRIZE_POLICY.baseMin+pick(BUBBLE_PRIZE_POLICY.baseSpan)
}
const result=(r:Receipt)=>({request_id:r.request_id,item_id:r.item_id,won:!!r.won,duplicate:!!r.duplicate,guaranteed:!!r.guaranteed,pity:r.pity_after,chance:r.chance,level:r.finger_level,source:r.catalog_source,card_id:r.card_id,card_duplicate:!!r.card_duplicate,reward:r.reward_amount,created_at:r.created_at,price:PRICE,refund:r.duplicate?PRICE:0})
export async function bubbleReceipt(db:D1Database,uid:number,id:string){return db.prepare('SELECT request_id,item_id,won,duplicate,guaranteed,pity_after,chance,finger_level,catalog_source,card_id,card_duplicate,reward_amount,created_at FROM community_bubble_draws WHERE user_id=? AND request_id=?').bind(uid,id).first<Receipt>()}
export async function drawCommunityBubble(db:D1Database,bucket:R2Bucket,p:{uid:number;id:string;ownerId:number;owner:boolean;t:number},roll=raffleRoll,pick=randomIndex){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id)||!Number.isSafeInteger(p.ownerId)||p.ownerId<1)throw new BubbleRuleError('抽奖参数或奖池账户无效')
 const prior=await bubbleReceipt(db,p.uid,p.id);if(prior)return result(prior)
 const catalog=await readCommunityCatalog(bucket) as Catalog,items=available(catalog);if(!catalog.source||!items.length)throw new BubbleRuleError('限定气泡池暂未上新')
 await ensureCoinWallet(db,p.uid,p.t);if(p.ownerId!==p.uid)await ensureCoinWallet(db,p.ownerId,p.t)
 await db.prepare("INSERT OR IGNORE INTO community_bubble_progress(user_id) SELECT id FROM users WHERE id=? AND kind='user' AND disabled=0 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=?)").bind(p.uid,p.uid).run()
 const state=await db.prepare('SELECT p.pity,p.revision FROM community_bubble_progress p WHERE p.user_id=?1').bind(p.uid).first<{pity:number;revision:number}>();if(!state)throw new BubbleRuleError('账号不可用')
 const cardId=String(randomIndex(CARD_CATALOG.length)),cardOwned=await db.prepare('SELECT 1 FROM collectible_cards WHERE user_id=? AND pack_id=? AND card_id=?').bind(p.uid,CARD_PACK,cardId).first(),cardDuplicate=cardOwned?1:0
 const chance=LIMITED_CHANCE,guaranteed=state.pity>=PITY-1,won=guaranteed||roll()<chance,item=won?items[pick(items.length)]:null,pity=won?0:state.pity+1,attempt=crypto.randomUUID(),level=0
 const bank=await db.prepare('SELECT balance FROM coin52_wallets WHERE user_id=?').bind(p.ownerId).first<{balance:number}>();
 const rewardAmount=bubblePrizeReward(won,p.ownerId===p.uid,pick,p.t)
 if(rewardAmount>0&&(!bank||bank.balance<rewardAmount))throw new BubbleRuleError('奖池站长余额不足，暂时无法发放本次D币奖励')
 const current=await readCommunityCatalog(bucket) as Catalog;if(current.source!==catalog.source)throw new BubbleRuleError('奖池刚刚更新，请刷新后重试')
 const gate='EXISTS(SELECT 1 FROM community_bubble_draws WHERE attempt=?1)',duplicate=gate+' AND EXISTS(SELECT 1 FROM community_bubble_draws WHERE attempt=?1 AND duplicate=1)'
 const sql=[db.prepare(`INSERT OR IGNORE INTO community_bubble_draws(user_id,request_id,attempt,owner_id,item_id,won,duplicate,guaranteed,pity_after,chance,finger_level,catalog_source,card_id,card_duplicate,reward_amount,created_at)
 SELECT ?1,?2,?3,?4,?5,?6,CASE WHEN ?6=1 AND EXISTS(SELECT 1 FROM user_unlocks WHERE user_id=?1 AND item=?7) THEN 1 ELSE 0 END,?8,?9,?10,?11,?12,?13,?14,?15,?16
 FROM coin52_wallets w JOIN coin52_wallets bank ON bank.user_id=?4 JOIN community_bubble_progress progress ON progress.user_id=?1
 WHERE w.user_id=?1 AND w.balance>=100 AND (bank.user_id=?1 OR bank.balance<=9007199254740891) AND progress.revision=?17
 AND EXISTS(SELECT 1 FROM users u JOIN chat_members cm ON cm.user_id=u.id AND cm.group_id=1 WHERE u.id=?1 AND u.disabled=0 AND u.kind='user')
 AND EXISTS(SELECT 1 FROM users WHERE id=?4 AND disabled=0 AND kind='user')
 AND NOT EXISTS(SELECT 1 FROM chat_bans WHERE group_id=1 AND user_id=?1)
 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id IN(?1,?4))
 AND (bank.user_id=?1 OR bank.balance>=?15)`).bind(p.uid,p.id,attempt,p.ownerId,item?.id??null,won?1:0,item?PREFIX+item.id:'',guaranteed?1:0,pity,chance,level,catalog.source,cardId,cardDuplicate,rewardAmount,p.t,state.revision)]
 const money=(uid:number,kind:string,amount:number,suffix:string,condition:string)=>{
  sql.push(db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT ?2,?3,?4,?5,?6,balance+?6,?7 FROM coin52_wallets WHERE user_id=?2 AND ${condition}`).bind(attempt,uid,kind,p.id,attempt+suffix,amount,p.t))
  sql.push(db.prepare(`UPDATE coin52_wallets SET balance=balance+?3,revision=revision+1,updated_at=?4 WHERE user_id=?2 AND ${condition}`).bind(attempt,uid,amount,p.t))
 }
 money(p.uid,'bubble-pool-pay',-PRICE,':pay',gate);money(p.ownerId,'bubble-pool-income',PRICE,':income',gate)
 money(p.ownerId,'bubble-pool-refund-pay',-PRICE,':refund-pay',duplicate);money(p.uid,'bubble-pool-refund',PRICE,':refund',duplicate)
 if(rewardAmount){const rewardGate=gate+' AND balance>='+rewardAmount;money(p.ownerId,'bubble-pool-prize-pay',-rewardAmount,':prize-pay',rewardGate);money(p.uid,'bubble-pool-prize',rewardAmount,':prize',gate)}
 sql.push(db.prepare(`INSERT OR IGNORE INTO user_unlocks(user_id,item,at) SELECT user_id,?2,?3 FROM community_bubble_draws WHERE attempt=?1 AND won=1`).bind(attempt,item?PREFIX+item.id:'',p.t))
 sql.push(db.prepare(`INSERT INTO collectible_cards(user_id,pack_id,card_id,first_at,last_at,count) SELECT ?2,?3,card_id,?4,?4,1 FROM community_bubble_draws WHERE attempt=?1 AND card_id IS NOT NULL ON CONFLICT(user_id,pack_id,card_id) DO UPDATE SET last_at=excluded.last_at,count=collectible_cards.count+1`).bind(attempt,p.uid,CARD_PACK,p.t))
 sql.push(db.prepare(`UPDATE community_bubble_progress SET pity=?3,draws=draws+1,revision=revision+1 WHERE user_id=?2 AND ${gate}`).bind(attempt,p.uid,pity))
 await db.batch(sql)
 const saved=await bubbleReceipt(db,p.uid,p.id);if(!saved)throw new BubbleRuleError('余额不足、参与资格或保底进度发生变化，请刷新后重试；未扣款')
 return result(saved)
}
export const communityBubblePool=new Hono<Ctx>()
communityBubblePool.onError((error,c)=>{
 if(error instanceof HTTPException)return c.json({error:error.message},error.status)
 console.error('community bubble pool error',error)
 return c.json({error:'限定气泡池暂时不可用，请稍后重试'},500)
})
const ownedBubbles=async(db:D1Database,uid:number)=>(await db.prepare('SELECT item FROM user_unlocks WHERE user_id=?1 AND item>=?2 AND item<?3').bind(uid,PREFIX,PREFIX+'\uffff').all<{item:string}>()).results.map(x=>x.item.slice(PREFIX.length))
communityBubblePool.get('/api/community-bubbles/owned',async c=>{
 const u=c.get('user');if(!u||u.disabled||u.kind==='bot')fail(401,'请先登录')
 c.header('Cache-Control','no-store');return c.json({owned:await ownedBubbles(c.env.DB,u!.id),all:isOwner(c,u)})
})
communityBubblePool.get('/api/me/owner52b-cards',async c=>{
 const {u}=await needMember(c,1),rows=await c.env.DB.prepare('SELECT card_id,count,first_at,last_at FROM collectible_cards WHERE user_id=? AND pack_id=? ORDER BY card_id').bind(u.id,CARD_PACK).all<{card_id:string;count:number;first_at:number;last_at:number}>(),owned=new Map(rows.results.map(x=>[x.card_id,x]))
 c.header('Cache-Control','no-store');return c.json({packs:[{id:CARD_PACK,name:'52B角色巡展',cards:CARD_CATALOG.map(card=>({...card,owned:owned.has(card.id),count:owned.get(card.id)?.count||0,first_at:owned.get(card.id)?.first_at||null,last_at:owned.get(card.id)?.last_at||null})),owned:rows.results.length,total:CARD_CATALOG.length}]})
})
communityBubblePool.get('/api/community-bubbles/pool',async c=>{
 const {u}=await needMember(c,1),catalog=await readCommunityCatalog(c.env.BUCKET) as Catalog,items=available(catalog),owner=isOwner(c,u)
 const state=await c.env.DB.prepare('SELECT COALESCE((SELECT balance FROM coin52_wallets WHERE user_id=?1),0) AS balance,COALESCE((SELECT pity FROM community_bubble_progress WHERE user_id=?1),0) AS pity,COALESCE((SELECT level FROM instant_card_fingers WHERE user_id=?1),0) AS level').bind(u.id).first<{balance:number;pity:number;level:number}>()
 const owned=await ownedBubbles(c.env.DB,u.id)
 const level=owner?5:Math.max(0,Math.min(5,Number(state?.level)||0));c.header('Cache-Control','no-store')
 return c.json({items:items.map(x=>({id:x.id,name:x.name,author:x.author,owned:owner||owned.includes(x.id)})),owned,balance:state?.balance||0,pity:state?.pity||0,level:0,chance:LIMITED_CHANCE,price:PRICE,pity_limit:PITY,source:catalog.source,cards:CARD_CATALOG})
})
communityBubblePool.post('/api/community-bubbles/draw',async c=>{
 sameOrigin(c);const {u}=await needMember(c,1),b=await boundedJson(c,1024),id=String(b.id||'')
 try{return c.json(await drawCommunityBubble(c.env.DB,c.env.BUCKET,{uid:u.id,id,ownerId:ownerId(c.env.ADMIN_USER_IDS),owner:isOwner(c,u),t:now()}))}catch(e){if(e instanceof BubbleRuleError)fail(409,e.message);fail(503,'结算状态暂未确认，请重试原请求，不会重复扣款')}
})
