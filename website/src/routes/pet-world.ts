import { Hono } from 'hono'
import type { Ctx } from '../types'
import { boundedJson, fail, sameOrigin } from '../lib/http'
import { needUser } from '../services/auth'
import { applyActions, AUTO, autoConfig, AUTO_DEFAULT, autoSettle, BASE_PRICE, newWorld, priceOf, refresh, seasonOf, weatherOf, worldDay, WELCOME_GIFT, WORLD } from '../shared/pet-world'
import type { Action, WorldState } from '../shared/pet-world'
import { petGrant } from './pet-battle'

// 小岛接口：GET 读状态与当日集市；POST 一次提交一批动作（前端合并连续操作，最多 40 个）。
// 每次 POST：读世界 1 行 + 读钱包 1 行 + 批量写（世界 1 行；涉及 D币 时流水和钱包各 1–2 行；卖出时每种物品 1 次量计数）。
// 无轮询、无定时任务。规则表（作物、价格走势算法）由前端同一份代码在本地计算，不经接口下发。
// 防脚本：同一用户两次提交至少间隔 WORLD.minGap 秒（用世界行里的 updated_at 判断，不额外读写）。
export const petWorld = new Hono<Ctx>()
petWorld.use('/api/pet/world/*', async (c, next) => { needUser(c); c.header('cache-control', 'no-store'); await next() })
petWorld.use('/api/pet/world', async (c, next) => { needUser(c); c.header('cache-control', 'no-store'); await next() })

// 当日价格：每个 Worker 实例每 10 分钟最多查一次前一天卖出量（≤ 33 行，主键范围），其余走内存。
const worldMarketCaches = new WeakMap<D1Database, Map<string, { prices: Record<string, number>; at: number }>>()
async function worldMarket(db: D1Database, day: string) {
  let worldMarketCache = worldMarketCaches.get(db)
  if (!worldMarketCache) { worldMarketCache = new Map(); worldMarketCaches.set(db, worldMarketCache) }
  const hit = worldMarketCache.get(day)
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.prices
  const y = new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10)
  const rows = (await db.prepare('SELECT item,n FROM pet_market_volume WHERE day=?').bind(y).all<{ item: string; n: number }>()).results
  const sold = new Map(rows.map((r) => [r.item, r.n]))
  const prices = Object.fromEntries(Object.keys(BASE_PRICE).map((id) => [id, priceOf(id, day, sold.get(id) || 0)]))
  worldMarketCache.set(day, { prices, at: Date.now() })
  if (worldMarketCache.size > 3) worldMarketCache.delete(worldMarketCache.keys().next().value!)
  return prices
}
const worldBalance = async (db: D1Database, userId: number) => (await db.prepare('SELECT balance FROM coin52_wallets WHERE user_id=?').bind(userId).first<{ balance: number }>())?.balance ?? 0
type WorldRow = { rev: number; state: string; op: string | null; updated_at: number }
async function worldLoad(db: D1Database, userId: number, t: number) {
  const q = 'SELECT rev,state,op,updated_at FROM pet_world WHERE user_id=?'
  let row = await db.prepare(q).bind(userId).first<WorldRow>()
  if (!row) {
    await db.prepare(`INSERT OR IGNORE INTO pet_world(user_id,rev,state,updated_at) SELECT ?1,1,?2,0 WHERE EXISTS(SELECT 1 FROM users WHERE id=?1 AND disabled=0 AND kind='user')`).bind(userId, JSON.stringify(newWorld(t))).run()
    row = await db.prepare(q).bind(userId).first<WorldRow>()
    if (!row) fail(403, '账号不可用')
  }
  let state = JSON.parse(row!.state) as WorldState
  if ((state as { v: number }).v !== 2) state = newWorld(t) // 只有内测期的 v1 数据，直接换新
  return { rev: row!.rev, op: row!.op, at: row!.updated_at, state: refresh(state, t) }
}

petWorld.get('/api/pet/world', async (c) => {
  const u = needUser(c), db = c.env.DB, t = Math.floor(Date.now() / 1000), day = worldDay(t)
  const [w, coins, prices] = await Promise.all([worldLoad(db, u.id, t), worldBalance(db, u.id), worldMarket(db, day)])
  return c.json({ rev: w.rev, state: w.state, coins, now: t, day, season: seasonOf(day), weather: weatherOf(day), prices })
})

// 一次写入：世界状态 + D币 流水 / 钱包 + 全站卖出量，全部以「世界行 op = 本次编号」为前提，成败一起。
type WorldDelta = { spend: number; earn: number; xp: number; sold: Map<string, number> }
async function worldCommit(db: D1Database, userId: number, t: number, day: string, w: { rev: number; state: WorldState }, op: string, d: WorldDelta) {
  if (!Number.isSafeInteger(d.spend) || !Number.isSafeInteger(d.earn) || d.spend < 0 || d.earn < 0) fail(400, '动作无效')
  const raw = JSON.stringify(w.state)
  if (raw.length > 48 * 1024) fail(413, '小岛数据过大')
  const gate = `EXISTS(SELECT 1 FROM pet_world WHERE user_id=?1 AND op=?2)`
  const stmts: D1PreparedStatement[] = []
  if (d.earn > 0) stmts.push(db.prepare(`INSERT OR IGNORE INTO coin52_wallets(user_id,balance,revision,updated_at) VALUES(?,0,0,?)`).bind(userId, t))
  // 同一批次可以「先卖后买」：世界写入的门槛是 余额 + 本批收入 ≥ 本批支出；钱包先入账再扣款，流水余额连续。
  stmts.push(db.prepare(`UPDATE pet_world SET state=?3,rev=rev+1,op=?2,updated_at=?4 WHERE user_id=?1 AND rev=?5 AND (?6=0 OR EXISTS(SELECT 1 FROM coin52_wallets WHERE user_id=?1 AND balance+?7>=?6))`).bind(userId, op, raw, t, w.rev, d.spend, d.earn))
  // 流水：查 coin52_ledger 一律带 user_id；同一批次的支出 / 收入（卖货、每日目标、卖动物、管家代卖）各合并成一条。
  if (d.earn > 0) stmts.push(
    db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT ?1,'pet-world-income',?2,'world-income:'||?2,?3,balance+?3,?4 FROM coin52_wallets WHERE user_id=?1 AND ${gate}`).bind(userId, op, d.earn, t),
    db.prepare(`UPDATE coin52_wallets SET balance=balance+?3,revision=revision+1,updated_at=?4 WHERE user_id=?1 AND ${gate}`).bind(userId, op, d.earn, t))
  if (d.spend > 0) stmts.push(
    db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT ?1,'pet-world-buy',?2,'world-buy:'||?2,-?3,balance-?3,?4 FROM coin52_wallets WHERE user_id=?1 AND ${gate}`).bind(userId, op, d.spend, t),
    db.prepare(`UPDATE coin52_wallets SET balance=balance-?3,revision=revision+1,updated_at=?4 WHERE user_id=?1 AND ${gate}`).bind(userId, op, d.spend, t))
  for (const [item, n] of d.sold) stmts.push(db.prepare(`INSERT INTO pet_market_volume(day,item,n) SELECT ?3,?4,?5 WHERE ${gate} ON CONFLICT(day,item) DO UPDATE SET n=n+excluded.n`).bind(userId, op, day, item, n))
  const r = await db.batch(stmts)
  if (!r[d.earn > 0 ? 1 : 0].meta.changes) return false
  if (d.xp) await petGrant(db, userId, d.xp, t).catch(() => 0)
  return true
}
const opOk = (op: unknown): op is string => typeof op === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(op)
// 管家补算（如果到点了）：并进本次写入
function worldAuto(state: WorldState, t: number, day: string, prices: Record<string, number>, coins: number, rand: () => number, d: WorldDelta) {
  const r = autoSettle(state, { now: t, today: day, rand, prices, coins })
  if (!r) return null
  d.spend += r.spend; d.earn += r.earn; d.xp += r.xp
  for (const [id, n] of Object.entries(r.sold)) d.sold.set(id, (d.sold.get(id) || 0) + n)
  return r.log
}
const worldRand = () => { const rnd = crypto.getRandomValues(new Uint32Array(4096)); let ri = 0; return () => rnd[ri++ % 4096] / 2 ** 32 }

petWorld.post('/api/pet/world/act', async (c) => {
  sameOrigin(c)
  const u = needUser(c), db = c.env.DB, t = Math.floor(Date.now() / 1000), day = worldDay(t)
  const body = await boundedJson(c, 16 * 1024) as { rev?: unknown; operation?: unknown; actions?: unknown }
  const op = body.operation
  if (!opOk(op)) return fail(400, '操作编号无效')
  if (!Array.isArray(body.actions) || !body.actions.length || body.actions.length > WORLD.maxActions) fail(400, '动作数量无效')
  const [w, coins, prices] = await Promise.all([worldLoad(db, u.id, t), worldBalance(db, u.id), worldMarket(db, day)])
  // 重试：上一次已经用这个 operation 写入成功（世界行里记着最后一次 op）
  if (w.op === op) return c.json({ rev: w.rev, state: w.state, coins, now: t, duplicate: true, out: [] })
  if (body.rev !== w.rev) return c.json({ error: '小岛状态已变化', code: 'world_conflict', rev: w.rev, state: w.state, coins, now: t }, 409)
  if (t - w.at < WORLD.minGap) return c.json({ error: '操作太快了，歇一下', code: 'world_slow', retry: WORLD.minGap - (t - w.at) }, 429)
  const rand = worldRand(), d: WorldDelta = { spend: 0, earn: 0, xp: 0, sold: new Map() }
  // 管家先把到点的巡视补完，再执行玩家这一批操作（保证时间顺序）
  const autoLog = worldAuto(w.state, t, day, prices, coins, rand, d)
  const res = applyActions(w.state, (body.actions as Action[]).filter((a) => a && typeof a === 'object'), { t, day, rand, prices, coins: coins - d.spend + d.earn })
  d.spend += res.spend; d.earn += res.earn; d.xp += res.xp
  ;(body.actions as Action[]).forEach((a, k) => { if (a?.a === 'sell' && res.out[k]?.ok) d.sold.set(String(a.id), (d.sold.get(String(a.id)) || 0) + Math.max(1, Math.floor(Number(a.n)) || 1)) })
  if (!(await worldCommit(db, u.id, t, day, w, op, d))) {
    const now = await worldLoad(db, u.id, t)
    return c.json({ error: d.spend > 0 ? 'D币不足或状态已变化' : '小岛状态已变化', code: 'world_conflict', rev: now.rev, state: now.state, coins: await worldBalance(db, u.id), now: t }, 409)
  }
  return c.json({ rev: w.rev + 1, state: w.state, out: res.out, coins: coins - d.spend + d.earn, spend: res.spend, earn: res.earn, xp: d.xp, now: t, autoLog })
})

// 挂机管家：保存策略（可选）+ 把到点的巡视补算并入账。前端在进入小岛时若「到点了」调用一次；保存策略时也调用。
petWorld.post('/api/pet/world/auto', async (c) => {
  sameOrigin(c)
  const u = needUser(c), db = c.env.DB, t = Math.floor(Date.now() / 1000), day = worldDay(t)
  const body = await boundedJson(c, 4 * 1024) as { rev?: unknown; operation?: unknown; config?: unknown }
  const op = body.operation
  if (!opOk(op)) return fail(400, '操作编号无效')
  const [w, coins, prices] = await Promise.all([worldLoad(db, u.id, t), worldBalance(db, u.id), worldMarket(db, day)])
  if (w.op === op) return c.json({ rev: w.rev, state: w.state, coins, now: t, duplicate: true })
  if (body.rev !== w.rev) return c.json({ error: '小岛状态已变化', code: 'world_conflict', rev: w.rev, state: w.state, coins, now: t }, 409)
  if (t - w.at < WORLD.minGap) return c.json({ error: '操作太快了，歇一下', code: 'world_slow', retry: WORLD.minGap - (t - w.at) }, 429)
  const rand = worldRand(), d: WorldDelta = { spend: 0, earn: 0, xp: 0, sold: new Map() }
  const prev = w.state.auto
  // 先按旧策略把到点的巡视补完，再换新策略
  const autoLog = worldAuto(w.state, t, day, prices, coins, rand, d)
  if (body.config !== undefined) {
    const cfg = autoConfig(body.config, prev || AUTO_DEFAULT)
    // 第一次打开要付一次雇佣费
    let hired = prev?.hired
    if (cfg.on && !hired) {
      if (coins - d.spend + d.earn < AUTO.hire) fail(400, `雇佣管家需要 ${AUTO.hire.toLocaleString()} D币`)
      d.spend += AUTO.hire; hired = t
    }
    // 刚打开管家：从现在开始计时（不补算开之前的时间）
    w.state.auto = { ...cfg, hired, t: cfg.on && !prev?.on ? t : (w.state.auto?.t ?? t) }
  } else if (!autoLog) return c.json({ rev: w.rev, state: w.state, coins, now: t, nothing: true })
  if (!(await worldCommit(db, u.id, t, day, w, op, d))) {
    const now = await worldLoad(db, u.id, t)
    return c.json({ error: 'D币不足或状态已变化', code: 'world_conflict', rev: now.rev, state: now.state, coins: await worldBalance(db, u.id), now: t }, 409)
  }
  return c.json({ rev: w.rev + 1, state: w.state, coins: coins - d.spend + d.earn, spend: d.spend, earn: d.earn, xp: d.xp, now: t, autoLog, every: AUTO.every })
})

// 新人礼：每个账号一次 100 万 D币。双重保证只发一次：世界状态里的 gift 标记 + 流水 UNIQUE(user_id,kind,ref)（就算小岛数据被重置也领不到第二次）。
// 一个批次：写标记（同时 rev+1、op=本次编号）→ 流水 → 钱包；后两步都以「世界行的 op 等于本次编号」为前提。
petWorld.post('/api/pet/world/welcome', async (c) => {
  sameOrigin(c)
  const u = needUser(c), db = c.env.DB, t = Math.floor(Date.now() / 1000)
  const body = await boundedJson(c, 1024) as { operation?: unknown }
  const op = body.operation
  if (typeof op !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(op)) fail(400, '操作编号无效')
  const w = await worldLoad(db, u.id, t)
  if (w.state.gift) return c.json({ already: true, rev: w.rev, state: w.state, coins: await worldBalance(db, u.id) })
  const gate = `EXISTS(SELECT 1 FROM pet_world WHERE user_id=?1 AND op=?2)`
  const r = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO coin52_wallets(user_id,balance,revision,updated_at) SELECT ?1,0,0,?2 WHERE EXISTS(SELECT 1 FROM users WHERE id=?1 AND disabled=0 AND kind='user')`).bind(u.id, t),
    db.prepare(`UPDATE pet_world SET state=json_set(state,'$.gift',?3),rev=rev+1,op=?2,updated_at=?3 WHERE user_id=?1 AND json_extract(state,'$.gift') IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=?1 AND disabled=0 AND kind='user') AND EXISTS(SELECT 1 FROM coin52_wallets WHERE user_id=?1)`).bind(u.id, op, t),
    db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT ?1,'pet-world-welcome','v1','world-welcome:v1',?3,balance+?3,?4 FROM coin52_wallets WHERE user_id=?1 AND ${gate}`).bind(u.id, op, WELCOME_GIFT, t),
    db.prepare(`UPDATE coin52_wallets SET balance=balance+?3,revision=revision+1,updated_at=?4 WHERE user_id=?1 AND ${gate}`).bind(u.id, op, WELCOME_GIFT, t),
  ]).catch((e) => { if (/UNIQUE/i.test(String(e?.message || e))) return null; throw e })
  // 流水里已经有新人礼（例如小岛数据被重置过）：只补上标记，不再发钱
  if (!r) await db.prepare(`UPDATE pet_world SET state=json_set(state,'$.gift',?2),rev=rev+1,updated_at=?2 WHERE user_id=?1 AND json_extract(state,'$.gift') IS NULL`).bind(u.id, t).run()
  const now = await worldLoad(db, u.id, t), coins = await worldBalance(db, u.id)
  if (!r || !r[1].meta.changes) return c.json({ already: true, rev: now.rev, state: now.state, coins })
  return c.json({ ok: true, gift: WELCOME_GIFT, rev: now.rev, state: now.state, coins })
})

// ---------- 2026-11-04 降价后的「一键回收」：仅限当天（北京时间 24 点前），每个账号一次 ----------
// 回收 = 鱼鱼谷里花掉的 D币 全部退回、卖货等赚到的 D币 全部扣回（流水 kind pet-world-buy / pet-world-income），小岛重置成新号。
// 新人礼（pet-world-welcome）和降价补偿（pet-world-refund）不动；新人礼不能再领第二次。算下来要扣钱但余额不够的，不能回收。
export const WORLD_REFUND = { until: Date.parse('2026-11-05T00:00:00+08:00') / 1000, ref: 'refund-20261104', kind: 'pet-world-refund-all' }
async function worldRefundQuote(db: D1Database, userId: number) {
  const [sum, done, coins] = await Promise.all([
    db.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='pet-world-buy' THEN -delta ELSE 0 END),0) AS spent, COALESCE(SUM(CASE WHEN kind='pet-world-income' THEN delta ELSE 0 END),0) AS earned FROM coin52_ledger WHERE user_id=?1 AND kind IN ('pet-world-buy','pet-world-income')`).bind(userId).first<{ spent: number; earned: number }>(),
    db.prepare(`SELECT created_at,delta FROM coin52_ledger WHERE user_id=?1 AND kind=?2 AND ref=?3`).bind(userId, WORLD_REFUND.kind, WORLD_REFUND.ref).first<{ created_at: number; delta: number }>(),
    worldBalance(db, userId),
  ])
  const spent = sum?.spent ?? 0, earned = sum?.earned ?? 0, net = spent - earned
  return { spent, earned, net, coins, done: done ? { at: done.created_at, delta: done.delta } : null, played: spent > 0 || earned > 0 }
}
petWorld.get('/api/pet/world/refund', async (c) => {
  const u = needUser(c), t = Math.floor(Date.now() / 1000)
  if (t >= WORLD_REFUND.until) return c.json({ available: false, until: WORLD_REFUND.until })
  const q = await worldRefundQuote(c.env.DB, u.id)
  return c.json({ available: q.played && !q.done, until: WORLD_REFUND.until, ...q, enough: q.coins + q.net >= 0 })
})
petWorld.post('/api/pet/world/refund', async (c) => {
  sameOrigin(c)
  const u = needUser(c), db = c.env.DB, t = Math.floor(Date.now() / 1000)
  if (t >= WORLD_REFUND.until) fail(403, '一键回收只在今天有效，已经过期了')
  const body = await boundedJson(c, 1024) as { operation?: unknown }
  const op = body.operation
  if (!opOk(op)) return fail(400, '操作编号无效')
  const [w, q] = await Promise.all([worldLoad(db, u.id, t), worldRefundQuote(db, u.id)])
  if (q.done) return c.json({ already: true, ...q })
  if (!q.played) fail(400, '你还没在🌟🐟谷花过或赚过 D币，不需要回收')
  if (q.coins + q.net < 0) fail(409, `回收要扣回 ${-q.net} D币，余额不够`)
  const fresh = newWorld(t)
  if (w.state.gift) fresh.gift = w.state.gift // 新人礼已经领过，重置后不能再领
  const gate = `EXISTS(SELECT 1 FROM pet_world WHERE user_id=?1 AND op=?2)`
  const attempt = WORLD_REFUND.kind + ':' + WORLD_REFUND.ref
  try {
    await db.batch([
      // 小岛重置：版本对不上（期间又买卖过）就整批回滚，让用户重新看一眼金额
      db.prepare(`UPDATE pet_world SET state=?3,rev=rev+1,op=?2,updated_at=?4 WHERE user_id=?1 AND rev=?5`).bind(u.id, op, JSON.stringify(fresh), t, w.rev),
      db.prepare(`SELECT json(CASE WHEN ${gate} THEN '1' ELSE 'conflict' END) AS ok`).bind(u.id, op),
      db.prepare(`INSERT OR IGNORE INTO coin52_wallets(user_id,balance,revision,updated_at) VALUES(?1,0,0,?2)`).bind(u.id, t),
      // 流水唯一（user_id,kind,ref）：已经回收过会直接报错回滚
      db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT ?1,?3,?4,?5,?6,balance+?6,?7 FROM coin52_wallets WHERE user_id=?1 AND balance+?6>=0 AND ${gate}`).bind(u.id, op, WORLD_REFUND.kind, WORLD_REFUND.ref, attempt, q.net, t),
      db.prepare(`UPDATE coin52_wallets SET balance=balance+?3,revision=revision+1,updated_at=?4 WHERE user_id=?1 AND balance+?3>=0 AND EXISTS(SELECT 1 FROM coin52_ledger WHERE user_id=?1 AND attempt=?2 AND created_at=?4)`).bind(u.id, attempt, q.net, t),
      db.prepare(`SELECT json(CASE WHEN EXISTS(SELECT 1 FROM coin52_ledger WHERE user_id=?1 AND attempt=?2 AND created_at=?3) THEN '1' ELSE 'poor' END) AS ok`).bind(u.id, attempt, t),
    ])
  } catch {
    return c.json({ error: '金额刚刚有变化（或余额不够），请重新打开看一下再确认', code: 'refund_conflict', ...(await worldRefundQuote(db, u.id)) }, 409)
  }
  const after = await worldLoad(db, u.id, t)
  return c.json({ ok: true, net: q.net, spent: q.spent, earned: q.earned, coins: q.coins + q.net, rev: after.rev, state: after.state })
})
