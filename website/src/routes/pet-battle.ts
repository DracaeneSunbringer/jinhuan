import { Hono } from 'hono'
import type { Ctx } from '../types'
import { boundedJson, fail, sameOrigin } from '../lib/http'
import { needUser } from '../services/auth'
import { PET_BATTLE_DAILY, PET_BATTLE_PAIR_DAILY, PET_BATTLE_XP, PET_CHEST_BATTLES, PET_DAILY_XP_CAP, PET_DROP, PET_ENHANCE_MAX, PET_ITEMS, PET_LEVEL_REWARDS, PET_PRICES, PET_SKILLS, PET_DUEL, petDay, petEnhanceCost, petTrainCost, petFighter, petImportCap, petItem, petLevelOf, petPointsTotal, petRollItem, petSimulate, petTotalXp, petValidPoints } from '../shared/pet-battle'
import type { PetGear, PetPoints } from '../shared/pet-battle'

// 大肥鱼擂台：异步挑战（对方不用在线），服务端用固定种子结算并保存战报，双方都能回放。
// 等级由服务端 pet_progress 记账（见 pet-saves.ts），对战属性只从这里取，前端上报的等级不参与。
export const petBattle = new Hono<Ctx>()

type Progress = { total_xp: number; day: string; day_xp: number }
const displayName = (r: { nick?: string | null; name?: string | null; username: string }) => r.nick || r.name || r.username

// 没有记账行时，从现有存档导入一次；导入量按成长系统上线天数封顶（每天最多 300），防止旧的前端篡改等级直接带进来。
export async function petProgress(db: D1Database, userId: number, t: number): Promise<Progress | null> {
  const row = await db.prepare('SELECT total_xp,day,day_xp FROM pet_progress WHERE user_id=?').bind(userId).first<Progress>()
  if (row) return row
  const save = await db.prepare('SELECT state FROM pet_saves WHERE user_id=?').bind(userId).first<{ state: string }>()
  if (!save) return null
  let total = 0
  try { const s = JSON.parse(save.state); total = petTotalXp(Number(s.level) || 1, Number(s.xp) || 0) } catch {}
  total = Math.max(0, Math.min(total, petImportCap(t)))
  await db.prepare(`INSERT OR IGNORE INTO pet_progress(user_id,total_xp,day,day_xp,imported_xp,updated_at) VALUES(?1,?2,?3,0,?2,?4)`).bind(userId, total, petDay(t), t).run()
  return await db.prepare('SELECT total_xp,day,day_xp FROM pet_progress WHERE user_id=?').bind(userId).first<Progress>()
}

// 加经验：受每日上限约束，返回实际加了多少。并发下用条件更新保证不超上限。
export async function petGrant(db: D1Database, userId: number, want: number, t: number) {
  const day = petDay(t)
  for (let i = 0; i < 3; i++) {
    const p = await db.prepare('SELECT total_xp,day,day_xp FROM pet_progress WHERE user_id=?').bind(userId).first<Progress>()
    if (!p) return 0
    const used = p.day === day ? p.day_xp : 0
    const add = Math.max(0, Math.min(Math.floor(want), PET_DAILY_XP_CAP - used))
    if (!add) return 0
    const r = await db.prepare(`UPDATE pet_progress SET total_xp=total_xp+?2,day=?3,day_xp=?4,updated_at=?5 WHERE user_id=?1 AND total_xp=?6 AND day=?7 AND day_xp=?8`)
      .bind(userId, add, day, used + add, t, p.total_xp, p.day, p.day_xp).run()
    if (r.meta.changes === 1) return add
  }
  return 0
}

export const progressView = (p: Progress | null, t: number) => {
  const total = p?.total_xp ?? 0, { level, xp } = petLevelOf(total)
  return { total, level, xp, day: petDay(t), day_xp: p && p.day === petDay(t) ? p.day_xp : 0 }
}

petBattle.use('/api/pet/battle/*', async (c, next) => { needUser(c); c.header('cache-control', 'no-store'); await next() })
petBattle.use('/api/pet/battle', async (c, next) => { needUser(c); c.header('cache-control', 'no-store'); await next() })

type Loadout = { weapon: string | null; armor: string | null; charm: string | null; points: string }
const ZERO: PetPoints = { str: 0, agi: 0, spd: 0, vit: 0 }
async function loadoutOf(db: D1Database, userId: number) {
  const l = await db.prepare('SELECT weapon,armor,charm,points FROM pet_loadout WHERE user_id=?').bind(userId).first<Loadout>()
  const items = (await db.prepare('SELECT item,enh FROM pet_items WHERE user_id=?').bind(userId).all<{ item: string; enh: number }>()).results
  const enh = new Map(items.map((x) => [x.item, x.enh]))
  const gear: PetGear = {}
  for (const slot of ['weapon', 'armor', 'charm'] as const) { const id = l?.[slot]; if (id && enh.has(id)) gear[slot] = { id, enh: enh.get(id)! } }
  let points: PetPoints = ZERO
  try { if (l) points = JSON.parse(l.points) } catch {}
  return { gear, points, items }
}
async function fighterFor(db: D1Database, id: number, name: string, p: Progress | null) {
  const level = petLevelOf(p?.total_xp ?? 0).level
  await grantLevelRewards(db, id, level)
  const { gear, points } = await loadoutOf(db, id)
  return petFighter(id, name, level, points, gear)
}
// 升级奖励：达到等级自动发放（已拥有则跳过），保证人人有装备可用。
async function grantLevelRewards(db: D1Database, userId: number, level: number) {
  const due = Object.entries(PET_LEVEL_REWARDS).filter(([lv]) => Number(lv) <= level).map(([, id]) => id)
  if (!due.length) return
  const t = Math.floor(Date.now() / 1000)
  await db.batch(due.map((id) => db.prepare(`INSERT OR IGNORE INTO pet_items(user_id,item,enh,source,created_at) VALUES(?,?,0,'level',?)`).bind(userId, id, t)))
}
const skillView = (ids: string[]) => PET_SKILLS.filter((s) => ids.includes(s.id)).map((s) => ({ id: s.id, name: s.name, level: s.level, kind: s.kind }))

async function usage(db: D1Database, userId: number, t: number) {
  const day = petDay(t)
  const r = await db.prepare(`SELECT COUNT(*) n FROM pet_battles WHERE attacker_id=? AND day=? AND operation NOT LIKE 'duel:%'`).bind(userId, day).first<{ n: number }>()
  return { used: r?.n ?? 0, limit: PET_BATTLE_DAILY }
}

petBattle.get('/api/pet/battle/home', async (c) => {
  const u = needUser(c), t = Math.floor(Date.now() / 1000), db = c.env.DB
  const p = await petProgress(db, u.id, t)
  if (!p) return c.json({ adopted: false })
  const me = await fighterFor(db, u.id, displayName(u as never), p)
  const record = await db.prepare(`SELECT
     SUM(CASE WHEN (attacker_id=?1 AND winner=0) OR (defender_id=?1 AND winner=1) THEN 1 ELSE 0 END) win,
     SUM(CASE WHEN (attacker_id=?1 AND winner=1) OR (defender_id=?1 AND winner=0) THEN 1 ELSE 0 END) lose,
     SUM(CASE WHEN winner=-1 THEN 1 ELSE 0 END) draw
   FROM pet_battles WHERE attacker_id=?1 OR defender_id=?1`).bind(u.id).first<{ win: number; lose: number; draw: number }>()
  const history = await db.prepare(`SELECT b.id,b.attacker_id,b.defender_id,b.winner,b.xp,b.created_at,b.attacker_level,b.defender_level,
     ua.username a_username,ua.name a_name,ua.nick a_nick,ud.username d_username,ud.name d_name,ud.nick d_nick
   FROM pet_battles b JOIN users ua ON ua.id=b.attacker_id JOIN users ud ON ud.id=b.defender_id
   WHERE b.attacker_id=?1 OR b.defender_id=?1 ORDER BY b.id DESC LIMIT 20`).bind(u.id).all()
  return c.json({ adopted: true, allSkills: PET_SKILLS.map(({ id, name, level, desc }) => ({ id, name, level, desc })), me: { ...me, skills: skillView(me.skills), progress: progressView(p, t) }, today: await usage(db, u.id, t),
    record: { win: record?.win ?? 0, lose: record?.lose ?? 0, draw: record?.draw ?? 0 },
    history: history.results.map((r: any) => ({ id: r.id, attacker: { id: r.attacker_id, name: r.a_nick || r.a_name || r.a_username, level: r.attacker_level },
      defender: { id: r.defender_id, name: r.d_nick || r.d_name || r.d_username, level: r.defender_level }, winner: r.winner, xp: r.xp, created_at: r.created_at })) })
})

// 对手：有站宠的正常账号。默认按等级接近 + 最近活跃挑一批；也可以按名字搜。
petBattle.get('/api/pet/battle/opponents', async (c) => {
  const u = needUser(c), t = Math.floor(Date.now() / 1000), db = c.env.DB
  const p = await petProgress(db, u.id, t)
  if (!p) return c.json({ opponents: [] })
  const q = (c.req.query('q') || '').trim().slice(0, 30)
  const myTotal = p.total_xp
  const rows = await db.prepare(`SELECT u.id,u.username,u.name,u.nick,u.avatar,COALESCE(g.total_xp,-1) total_xp,
       (SELECT COUNT(*) FROM pet_battles b WHERE b.attacker_id=?1 AND b.defender_id=u.id AND b.day=?2 AND b.operation NOT LIKE 'duel:%') fought
     FROM pet_saves s JOIN users u ON u.id=s.user_id LEFT JOIN pet_progress g ON g.user_id=s.user_id
     WHERE u.id<>?1 AND u.disabled=0 AND u.kind='user' AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id)
       AND (?3='' OR u.username LIKE ?4 OR u.name LIKE ?4 OR u.nick LIKE ?4)
     ORDER BY CASE WHEN ?3='' THEN ABS(COALESCE(g.total_xp,0)-?5) ELSE 0 END, s.updated_at DESC LIMIT 20`)
    .bind(u.id, petDay(t), q, '%' + q.replace(/[%_]/g, '') + '%', myTotal).all()
  return c.json({ opponents: rows.results.map((r: any) => ({ id: r.id, name: r.nick || r.name || r.username, username: r.username, avatar: r.avatar,
    level: r.total_xp < 0 ? null : petLevelOf(r.total_xp).level, fought: r.fought, left: Math.max(0, PET_BATTLE_PAIR_DAILY - r.fought) })) })
})

petBattle.post('/api/pet/battle', async (c) => {
  sameOrigin(c)
  const u = needUser(c), t = Math.floor(Date.now() / 1000), db = c.env.DB
  const body = await boundedJson(c, 2048) as { opponent_id?: unknown; operation?: unknown }
  const op = body.operation, target = body.opponent_id
  if (typeof op !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(op)) fail(400, '操作编号无效', 'pet_battle_operation')
  if (typeof target !== 'number' || !Number.isSafeInteger(target) || target === u.id) fail(400, '对手无效', 'pet_battle_target')
  // 同一个操作编号重复提交（网络重试）：直接返回原来的战报。
  const dup = await db.prepare('SELECT id FROM pet_battles WHERE attacker_id=? AND operation=?').bind(u.id, op).first<{ id: number }>()
  if (dup) return c.json(await battleView(db, dup.id, u.id))
  const me = await petProgress(db, u.id, t)
  if (!me) fail(409, '先去站宠屋领养大肥鱼', 'pet_battle_no_pet')
  const foeUser = await db.prepare(`SELECT id,username,name,nick FROM users WHERE id=? AND disabled=0 AND kind='user' AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=users.id)`).bind(target).first<any>()
  const foe = foeUser ? await petProgress(db, target as number, t) : null
  if (!foeUser || !foe) fail(404, '对方还没有站宠', 'pet_battle_no_target')
  const day = petDay(t)
  const counts = await db.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN defender_id=?2 THEN 1 ELSE 0 END) pair, MAX(created_at) last FROM pet_battles WHERE attacker_id=?1 AND day=?3 AND operation NOT LIKE 'duel:%'`).bind(u.id, target, day).first<{ n: number; pair: number; last: number }>()
  if ((counts?.n ?? 0) >= PET_BATTLE_DAILY) fail(429, `今天的 ${PET_BATTLE_DAILY} 次挑战已用完，明天再来`, 'pet_battle_daily')
  if ((counts?.pair ?? 0) >= PET_BATTLE_PAIR_DAILY) fail(429, `今天已经挑战过 TA ${PET_BATTLE_PAIR_DAILY} 次了`, 'pet_battle_pair')
  if (counts?.last && t - counts.last < 8) fail(429, '歇口气再打', 'pet_battle_rate')
  const a = await fighterFor(db, u.id, displayName(u as never), me), b = await fighterFor(db, foeUser.id, displayName(foeUser), foe)
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]
  const result = petSimulate(a, b, seed)
  const outcome = result.winner === 0 ? 'win' : result.winner === 1 ? 'lose' : 'draw'
  // 先落战报（attacker+operation 唯一），成功后再加经验，避免重试重复加。
  const ins = await db.prepare(`INSERT OR IGNORE INTO pet_battles(attacker_id,defender_id,operation,day,seed,attacker_level,defender_level,winner,rounds,fighters,events,xp,created_at)
     SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,0,?12
     WHERE (SELECT COUNT(*) FROM pet_battles WHERE attacker_id=?1 AND day=?4 AND operation NOT LIKE 'duel:%') < ?13
       AND (SELECT COUNT(*) FROM pet_battles WHERE attacker_id=?1 AND defender_id=?2 AND day=?4 AND operation NOT LIKE 'duel:%') < ?14
     RETURNING id`).bind(u.id, foeUser.id, op, day, seed, a.level, b.level, result.winner, result.rounds, JSON.stringify([a, b]), JSON.stringify(result.events), t, PET_BATTLE_DAILY, PET_BATTLE_PAIR_DAILY).first<{ id: number }>()
  if (!ins) {
    const again = await db.prepare('SELECT id FROM pet_battles WHERE attacker_id=? AND operation=?').bind(u.id, op).first<{ id: number }>()
    if (again) return c.json(await battleView(db, again.id, u.id))
    fail(429, '今天的挑战次数已用完', 'pet_battle_daily')
  }
  const xp = await petGrant(db, u.id, PET_BATTLE_XP[outcome], t)
  if (xp) await db.prepare('UPDATE pet_battles SET xp=? WHERE id=?').bind(xp, ins!.id).run()
  // 掉落：已拥有的同名装备改为免费强化 +1（到 +10 为止）。
  const roll = crypto.getRandomValues(new Uint32Array(3))
  if (roll[0] / 2 ** 32 < PET_DROP[outcome]) {
    const item = petRollItem(roll[1] / 2 ** 32, roll[2] / 2 ** 32, PET_DROP.weights)
    await giveItem(db, u.id, item.id, 'drop', t, ins!.id)
  }
  return c.json({ ...(await battleView(db, ins!.id, u.id)), progress: progressView(await petProgress(db, u.id, t), t), today: await usage(db, u.id, t) })
})

async function battleView(db: D1Database, id: number, viewer: number) {
  const b = await db.prepare('SELECT * FROM pet_battles WHERE id=?').bind(id).first<any>()
  if (!b || (b.attacker_id !== viewer && b.defender_id !== viewer)) fail(404, '没有这场对战', 'pet_battle_missing')
  const drop = await db.prepare('SELECT item,upgraded FROM pet_battle_drops WHERE battle_id=?').bind(id).first<{ item: string; upgraded: number }>()
  const duel = await db.prepare('SELECT id,stake,payout,rake,winner_id FROM pet_duels WHERE battle_id=?').bind(id).first<{ id: number; stake: number; payout: number; rake: number; winner_id: number | null }>()
  return { battle: { id: b.id, attacker_id: b.attacker_id, defender_id: b.defender_id, winner: b.winner, rounds: b.rounds, xp: b.xp, created_at: b.created_at,
    fighters: JSON.parse(b.fighters), events: JSON.parse(b.events), drop: drop && b.attacker_id === viewer ? { item: drop.item, upgraded: !!drop.upgraded } : null, duel },
    skills: [...PET_SKILLS, ...PET_ITEMS.flatMap((it) => it.skill ? [it.skill] : [])] }
}

petBattle.get('/api/pet/battle/:id{[0-9]+}', async (c) => {
  const u = needUser(c)
  return c.json(await battleView(c.env.DB, Number(c.req.param('id')), u.id))
})

// ---------- 武器装备 / 加点 / D币 ----------
async function giveItem(db: D1Database, userId: number, item: string, source: string, t: number, battleId?: number) {
  const r = await db.prepare(`INSERT OR IGNORE INTO pet_items(user_id,item,enh,source,created_at) VALUES(?,?,0,?,?)`).bind(userId, item, source, t).run()
  let upgraded = 0
  if (!r.meta.changes) upgraded = (await db.prepare(`UPDATE pet_items SET enh=enh+1 WHERE user_id=? AND item=? AND enh<?`).bind(userId, item, PET_ENHANCE_MAX).run()).meta.changes
  if (battleId) await db.prepare('INSERT OR IGNORE INTO pet_battle_drops(battle_id,item,upgraded) VALUES(?,?,?)').bind(battleId, item, upgraded ? 1 : 0).run()
  return { item, upgraded: !!upgraded }
}
const OP = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i
const balanceOf = async (db: D1Database, userId: number) => (await db.prepare('SELECT balance FROM coin52_wallets WHERE user_id=?').bind(userId).first<{ balance: number }>())?.balance ?? 0
const dailyOf = async (db: D1Database, userId: number, t: number) => {
  const r = await db.prepare(`SELECT COALESCE((SELECT trained FROM pet_daily WHERE user_id=?1 AND day=?2),0) old,COALESCE((SELECT chest FROM pet_daily WHERE user_id=?1 AND day=?2),0) chest,COALESCE((SELECT xp FROM pet_train WHERE user_id=?1 AND day=?2),0) xp`).bind(userId, petDay(t)).first<{ old: number; chest: number; xp: number }>()
  return { trained: (r?.old ?? 0) + (r?.xp ?? 0), chest: r?.chest ?? 0 }
}

async function gearView(db: D1Database, userId: number, t: number) {
  const p = await petProgress(db, userId, t)
  const level = petLevelOf(p?.total_xp ?? 0).level
  await grantLevelRewards(db, userId, level)
  const { gear, points, items } = await loadoutOf(db, userId)
  const used = points.str + points.agi + points.spd + points.vit
  const battles = (await db.prepare("SELECT COUNT(*) n FROM pet_battles WHERE attacker_id=? AND day=? AND operation NOT LIKE 'duel:%'").bind(userId, petDay(t)).first<{ n: number }>())?.n ?? 0
  const name = ''
  const base = petFighter(userId, name, level), withPoints = petFighter(userId, name, level, points), full = petFighter(userId, name, level, points, gear)
  const breakdown = Object.fromEntries((['hp', 'atk', 'def', 'agi', 'spd'] as const).map((k) => [k, { base: base[k], points: withPoints[k] - base[k], gear: full[k] - withPoints[k], total: full[k] }]))
  return { level, breakdown, passive: full.passive, coins: await balanceOf(db, userId), items: items.map((x) => ({ id: x.item, enh: x.enh })), gear, points, free: petPointsTotal(level) - used,
    daily: { ...(await dailyOf(db, userId, t)), battles, need: PET_CHEST_BATTLES }, prices: PET_PRICES, rewards: PET_LEVEL_REWARDS,
    catalog: PET_ITEMS.map(({ id, name, slot, rarity, anim, at, stats, skill, passive, desc }) => ({ id, name, slot, rarity, anim, at, stats, skill: skill ? { name: skill.name, desc } : null, passive, desc })) }
}

petBattle.get('/api/pet/battle/gear', async (c) => {
  const u = needUser(c), t = Math.floor(Date.now() / 1000)
  if (!(await petProgress(c.env.DB, u.id, t))) return c.json({ adopted: false })
  return c.json({ adopted: true, ...(await gearView(c.env.DB, u.id, t)) })
})

// 装备 / 卸下：只能装自己拥有、槽位对得上的。
petBattle.post('/api/pet/battle/equip', async (c) => {
  sameOrigin(c)
  const u = needUser(c), t = Math.floor(Date.now() / 1000), db = c.env.DB
  const body = await boundedJson(c, 1024) as { slot?: unknown; item?: unknown }
  const slot = body.slot
  if (slot !== 'weapon' && slot !== 'armor' && slot !== 'charm') fail(400, '槽位无效')
  const item = body.item == null ? null : petItem(String(body.item))
  if (body.item != null && (!item || item.slot !== slot)) fail(400, '这件不能装在这里')
  if (item && !(await db.prepare('SELECT 1 FROM pet_items WHERE user_id=? AND item=?').bind(u.id, item.id).first())) fail(404, '还没有这件装备')
  await db.prepare(`INSERT INTO pet_loadout(user_id,${slot},updated_at) VALUES(?1,?2,?3) ON CONFLICT(user_id) DO UPDATE SET ${slot}=excluded.${slot},updated_at=excluded.updated_at`).bind(u.id, item?.id ?? null, t).run()
  return c.json(await gearView(db, u.id, t))
})

// 加点：只能往上加（减点要洗点）；总数不超过等级给的点数。
petBattle.post('/api/pet/battle/points', async (c) => {
  sameOrigin(c)
  const u = needUser(c), t = Math.floor(Date.now() / 1000), db = c.env.DB
  const body = await boundedJson(c, 1024) as { points?: unknown }
  const p = await petProgress(db, u.id, t)
  if (!p) fail(409, '先领养大肥鱼')
  const level = petLevelOf(p!.total_xp).level
  if (!petValidPoints(body.points, level)) fail(400, '加点超过可用点数')
  const next = body.points as PetPoints, { points } = await loadoutOf(db, u.id)
  if ((['str', 'agi', 'spd', 'vit'] as const).some((k) => next[k] < points[k])) fail(400, '减少已加的点需要洗点')
  await db.prepare(`INSERT INTO pet_loadout(user_id,points,updated_at) VALUES(?1,?2,?3) ON CONFLICT(user_id) DO UPDATE SET points=excluded.points,updated_at=excluded.updated_at`).bind(u.id, JSON.stringify(next), t).run()
  return c.json(await gearView(db, u.id, t))
})

// D币 操作：一个 operation 只会生效一次。pet_ops 插入成功（含余额、前置条件检查）才扣费并执行效果，全部在一个事务里。
async function spend(c: any, kind: string, ref: string, cost: number, precondition: { sql: string; args: unknown[] }, effects: (attempt: string) => D1PreparedStatement[]) {
  sameOrigin(c)
  const u = needUser(c), t = Math.floor(Date.now() / 1000), db: D1Database = c.env.DB
  const body = await boundedJson(c, 2048) as { operation?: unknown }
  const op = body.operation
  if (typeof op !== 'string' || !OP.test(op)) fail(400, '操作编号无效')
  const prior = await db.prepare('SELECT kind,ref FROM pet_ops WHERE user_id=? AND operation=?').bind(u.id, op).first<{ kind: string; ref: string }>()
  if (prior) { if (prior.kind !== kind || prior.ref !== ref) fail(409, '操作编号已用于其他操作'); return c.json({ duplicate: true, ...(await gearView(db, u.id, t)) }) }
  const attempt = crypto.randomUUID(), gate = 'EXISTS(SELECT 1 FROM pet_ops WHERE attempt=?)'
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO pet_ops(user_id,operation,attempt,kind,ref,cost,created_at)
      SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE EXISTS(SELECT 1 FROM users WHERE id=?1 AND disabled=0 AND kind='user')
        AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=?1)
        AND (?6=0 OR EXISTS(SELECT 1 FROM coin52_wallets WHERE user_id=?1 AND balance>=?6))
        AND ${precondition.sql}`).bind(u.id, op, attempt, kind, ref, cost, t, ...precondition.args),
  ]
  if (cost > 0) statements.push(
    db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT o.user_id,'pet-'||o.kind,o.ref||'#'||o.operation,o.attempt,-o.cost,w.balance-o.cost,o.created_at FROM pet_ops o JOIN coin52_wallets w ON w.user_id=o.user_id WHERE o.attempt=?`).bind(attempt),
    db.prepare(`UPDATE coin52_wallets SET balance=balance-?2,revision=revision+1,updated_at=?3 WHERE user_id=?1 AND ${gate.replace('?', '?4')}`).bind(u.id, cost, t, attempt))
  statements.push(...effects(attempt))
  const r = await db.batch(statements)
  if (!r[0].meta.changes) {
    const again = await db.prepare('SELECT 1 FROM pet_ops WHERE user_id=? AND operation=?').bind(u.id, op).first()
    if (again) return c.json({ duplicate: true, ...(await gearView(db, u.id, t)) })
    if (cost > 0 && (await balanceOf(db, u.id)) < cost) fail(409, `D币不足，需要 ${cost}`, 'pet_coins')
    fail(409, '状态已变化，请刷新后重试', 'pet_precondition')
  }
  return c.json({ ok: true, cost, ...(await gearView(db, u.id, t)) })
}

petBattle.post('/api/pet/battle/respec', async (c) => {
  const u = needUser(c), db = c.env.DB
  return spend(c, 'respec', 'points', PET_PRICES.respec, { sql: `EXISTS(SELECT 1 FROM pet_loadout WHERE user_id=?8 AND points<>'{"str":0,"agi":0,"spd":0,"vit":0}')`, args: [u.id] },
    (attempt) => [db.prepare(`UPDATE pet_loadout SET points='{"str":0,"agi":0,"spd":0,"vit":0}',updated_at=unixepoch() WHERE user_id=? AND EXISTS(SELECT 1 FROM pet_ops WHERE attempt=?)`).bind(u.id, attempt)])
})

petBattle.post('/api/pet/battle/enhance', async (c) => {
  const u = needUser(c), db = c.env.DB
  const id = c.req.query('item') || ''
  const item = petItem(id)
  if (!item) fail(400, '没有这件装备')
  const row = await db.prepare('SELECT enh FROM pet_items WHERE user_id=? AND item=?').bind(u.id, item!.id).first<{ enh: number }>()
  if (!row) fail(404, '还没有这件装备')
  if (row!.enh >= PET_ENHANCE_MAX) fail(409, '已经强化到满级')
  const cost = petEnhanceCost(item!.rarity, row!.enh)
  return spend(c, 'enhance', item!.id + '+' + (row!.enh + 1), cost, { sql: 'EXISTS(SELECT 1 FROM pet_items WHERE user_id=?8 AND item=?9 AND enh=?10)', args: [u.id, item!.id, row!.enh] },
    (attempt) => [db.prepare('UPDATE pet_items SET enh=enh+1 WHERE user_id=? AND item=? AND enh=? AND EXISTS(SELECT 1 FROM pet_ops WHERE attempt=?)').bind(u.id, item!.id, row!.enh, attempt)])
})

petBattle.post('/api/pet/battle/buy', async (c) => {
  const u = needUser(c), db = c.env.DB
  const item = petItem(c.req.query('item') || '')
  if (!item) fail(400, '没有这件装备')
  const price = PET_PRICES.shop[item!.rarity]
  if (!price) fail(409, '传说装备只能对战掉落或宝箱获得')
  return spend(c, 'buy', item!.id, price, { sql: 'NOT EXISTS(SELECT 1 FROM pet_items WHERE user_id=?8 AND item=?9)', args: [u.id, item!.id] },
    (attempt) => [db.prepare(`INSERT INTO pet_items(user_id,item,enh,source,created_at) SELECT ?,?,0,'shop',unixepoch() WHERE EXISTS(SELECT 1 FROM pet_ops WHERE attempt=?)`).bind(u.id, item!.id, attempt)])
})

// 突破训练：D币 换经验，突破每日 300 的自然成长上限；每天最多再买 300，阶梯价越买越贵。
petBattle.post('/api/pet/battle/train', async (c) => {
  const u = needUser(c), db = c.env.DB, t = Math.floor(Date.now() / 1000), day = petDay(t)
  const xp = Number(c.req.query('xp'))
  if (!Number.isSafeInteger(xp) || xp < 10 || xp % 10) fail(400, '训练经验需为 10 的倍数')
  if (!(await petProgress(db, u.id, t))) fail(409, '先领养大肥鱼')
  const done = (await dailyOf(db, u.id, t)).trained
  if (done + xp > PET_PRICES.trainDaily) fail(409, `今天还能突破训练 ${PET_PRICES.trainDaily - done} 经验`)
  const pre = 'COALESCE((SELECT trained FROM pet_daily WHERE user_id=?8 AND day=?9),0)+COALESCE((SELECT xp FROM pet_train WHERE user_id=?8 AND day=?9),0)=?10'
  return spend(c, 'train', day + ':' + (done + xp), petTrainCost(done, xp), { sql: pre, args: [u.id, day, done] },
    (attempt) => [
      db.prepare(`INSERT INTO pet_train(user_id,day,xp) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM pet_ops WHERE attempt=?4) ON CONFLICT(user_id,day) DO UPDATE SET xp=xp+?3`).bind(u.id, day, xp, attempt),
      db.prepare('UPDATE pet_progress SET total_xp=total_xp+?,updated_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM pet_ops WHERE attempt=?)').bind(xp, t, u.id, attempt),
    ])
})

// 每日宝箱：当天主动挑战满 3 场可领一次，必出一件装备。
petBattle.post('/api/pet/battle/chest', async (c) => {
  sameOrigin(c)
  const u = needUser(c), db = c.env.DB, t = Math.floor(Date.now() / 1000), day = petDay(t)
  const battles = (await db.prepare("SELECT COUNT(*) n FROM pet_battles WHERE attacker_id=? AND day=? AND operation NOT LIKE 'duel:%'").bind(u.id, day).first<{ n: number }>())?.n ?? 0
  if (battles < PET_CHEST_BATTLES) fail(409, `今天再打 ${PET_CHEST_BATTLES - battles} 场就能开宝箱`)
  const r = await db.prepare(`INSERT INTO pet_daily(user_id,day,trained,chest) VALUES(?1,?2,0,1) ON CONFLICT(user_id,day) DO UPDATE SET chest=1 WHERE chest=0`).bind(u.id, day).run()
  if (!r.meta.changes) fail(409, '今天的宝箱已经领过了')
  const roll = crypto.getRandomValues(new Uint32Array(2))
  const got = await giveItem(db, u.id, petRollItem(roll[0] / 2 ** 32, roll[1] / 2 ** 32, PET_DROP.chestWeights).id, 'chest', t)
  return c.json({ got, ...(await gearView(db, u.id, t)) })
})

// ---------- 实时约战（押注 D币） ----------
// 规则：双方都点同意才开打；发起时冻结发起方押注，接受时冻结接受方押注并立即结算；
// 赢家拿走两份押注扣 5% 抽成；平局各自退回；10 分钟没人接自动退回。防小号：双方 Lv5 以上、注册满 7 天、等级差 ≤5、同一对每天最多 2 场、
// 每人每天押注合计 ≤10 万；近 7 天同一对手连续由同一方赢 ≥4 场的对局标记待人工复核（不自动处罚）。
type Duel = { id: number; inviter_id: number; invitee_id: number; stake: number; status: string; battle_id: number | null; winner_id: number | null; payout: number; rake: number; created_at: number; expires_at: number; flag: number }
async function expireDuels(db: D1Database, t: number) {
  const rows = (await db.prepare(`SELECT id,inviter_id,stake FROM pet_duels WHERE status='open' AND expires_at<=? LIMIT 50`).bind(t).all<{ id: number; inviter_id: number; stake: number }>()).results
  for (const d of rows) await refundDuel(db, d.id, 'expired', t)
}
// 关闭一个 open 约战并退还发起方押注；状态更新成功才退款，保证只退一次。
async function refundDuel(db: D1Database, id: number, status: 'expired' | 'cancelled' | 'declined', t: number) {
  const gate = `EXISTS(SELECT 1 FROM pet_duels WHERE id=?1 AND status=?2 AND settled_at=?3)`
  await db.batch([
    db.prepare(`UPDATE pet_duels SET status=?2,settled_at=?3 WHERE id=?1 AND status='open'`).bind(id, status, t),
    db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT d.inviter_id,'pet-duel-refund','duel:'||d.id,'duel-refund:'||d.id,d.stake,w.balance+d.stake,?3 FROM pet_duels d JOIN coin52_wallets w ON w.user_id=d.inviter_id WHERE d.id=?1 AND ${gate}`).bind(id, status, t),
    db.prepare(`UPDATE coin52_wallets SET balance=balance+(SELECT stake FROM pet_duels WHERE id=?1),revision=revision+1,updated_at=?3 WHERE user_id=(SELECT inviter_id FROM pet_duels WHERE id=?1) AND ${gate}`).bind(id, status, t),
  ])
}
async function duelEligible(db: D1Database, userId: number, t: number) {
  const u = await db.prepare(`SELECT created_at FROM users WHERE id=? AND disabled=0 AND kind='user' AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=users.id)`).bind(userId).first<{ created_at: number }>()
  const p = await petProgress(db, userId, t)
  if (!u || !p) return { ok: false, level: 0, reason: '还没有站宠' }
  const level = petLevelOf(p.total_xp).level
  if (level < PET_DUEL.minLevel) return { ok: false, level, reason: `大肥鱼 Lv${PET_DUEL.minLevel} 才能约战押注` }
  if (t - u.created_at < PET_DUEL.minAccountDays * 86400) return { ok: false, level, reason: `注册满 ${PET_DUEL.minAccountDays} 天才能约战押注` }
  return { ok: true, level, reason: '' }
}
const stakedToday = async (db: D1Database, userId: number, day: string) => (await db.prepare(`SELECT COALESCE(SUM(stake),0) s FROM pet_duels WHERE day=?2 AND status IN ('open','done') AND (inviter_id=?1 OR invitee_id=?1)`).bind(userId, day).first<{ s: number }>())?.s ?? 0
const duelRow = (d: any) => ({ id: d.id, inviter: { id: d.inviter_id, name: d.i_nick || d.i_name || d.i_username }, invitee: { id: d.invitee_id, name: d.e_nick || d.e_name || d.e_username }, stake: d.stake, status: d.status, battle_id: d.battle_id, winner_id: d.winner_id, payout: d.payout, created_at: d.created_at, expires_at: d.expires_at })
const DUEL_SELECT = `SELECT d.*,ui.username i_username,ui.name i_name,ui.nick i_nick,ue.username e_username,ue.name e_name,ue.nick e_nick FROM pet_duels d JOIN users ui ON ui.id=d.inviter_id JOIN users ue ON ue.id=d.invitee_id`

petBattle.get('/api/pet/duel', async (c) => {
  const u = needUser(c), db = c.env.DB, t = Math.floor(Date.now() / 1000)
  await expireDuels(db, t)
  const incoming = (await db.prepare(`${DUEL_SELECT} WHERE d.invitee_id=? AND d.status='open' ORDER BY d.id DESC LIMIT 20`).bind(u.id).all()).results.map(duelRow)
  const outgoing = (await db.prepare(`${DUEL_SELECT} WHERE d.inviter_id=?1 AND (d.status='open' OR d.created_at>?2) ORDER BY d.id DESC LIMIT 20`).bind(u.id, t - 86400).all()).results.map(duelRow)
  const history = (await db.prepare(`${DUEL_SELECT} WHERE (d.inviter_id=?1 OR d.invitee_id=?1) AND d.status='done' ORDER BY d.id DESC LIMIT 20`).bind(u.id).all()).results.map(duelRow)
  return c.json({ incoming, outgoing, history, eligible: await duelEligible(db, u.id, t), staked: await stakedToday(db, u.id, petDay(t)), rules: PET_DUEL, coins: await balanceOf(db, u.id) })
})

petBattle.post('/api/pet/duel', async (c) => {
  sameOrigin(c)
  const u = needUser(c), db = c.env.DB, t = Math.floor(Date.now() / 1000), day = petDay(t)
  const body = await boundedJson(c, 1024) as { opponent_id?: unknown; stake?: unknown; operation?: unknown }
  const op = body.operation, target = body.opponent_id, stake = body.stake
  if (typeof op !== 'string' || !OP.test(op)) fail(400, '操作编号无效')
  if (typeof target !== 'number' || !Number.isSafeInteger(target) || target === u.id) fail(400, '对手无效')
  if (typeof stake !== 'number' || !Number.isSafeInteger(stake) || stake < PET_DUEL.minStake || stake > PET_DUEL.maxStake) fail(400, `押注需在 ${PET_DUEL.minStake}–${PET_DUEL.maxStake} D币 之间`)
  const dup = await db.prepare('SELECT id FROM pet_duels WHERE inviter_id=? AND operation=?').bind(u.id, op).first<{ id: number }>()
  if (dup) return c.json({ id: dup.id, duplicate: true })
  await expireDuels(db, t)
  const me = await duelEligible(db, u.id, t), foe = await duelEligible(db, target as number, t)
  if (!me.ok) fail(409, me.reason, 'pet_duel_me')
  if (!foe.ok) fail(409, '对方暂时不能约战：' + foe.reason, 'pet_duel_foe')
  if (Math.abs(me.level - foe.level) > PET_DUEL.maxLevelGap) fail(409, `等级差超过 ${PET_DUEL.maxLevelGap} 级，不能押注约战`, 'pet_duel_gap')
  const pair = (await db.prepare(`SELECT COUNT(*) n FROM pet_duels WHERE day=?1 AND status IN ('open','done') AND ((inviter_id=?2 AND invitee_id=?3) OR (inviter_id=?3 AND invitee_id=?2))`).bind(day, u.id, target).first<{ n: number }>())?.n ?? 0
  if (pair >= PET_DUEL.pairDaily) fail(429, `今天和 TA 已约战 ${PET_DUEL.pairDaily} 次`, 'pet_duel_pair')
  if ((await stakedToday(db, u.id, day)) + (stake as number) > PET_DUEL.dailyStake) fail(409, `今天押注合计不能超过 ${PET_DUEL.dailyStake} D币`, 'pet_duel_daily')
  const attempt = 'duel-stake:' + crypto.randomUUID()
  const r = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO pet_duels(inviter_id,invitee_id,operation,day,stake,status,created_at,expires_at)
      SELECT ?1,?2,?3,?4,?5,'open',?6,?7 WHERE EXISTS(SELECT 1 FROM coin52_wallets WHERE user_id=?1 AND balance>=?5)`).bind(u.id, target, op, day, stake, t, t + PET_DUEL.expire),
    db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT d.inviter_id,'pet-duel-stake','duel:'||d.id,?3,-d.stake,w.balance-d.stake,d.created_at FROM pet_duels d JOIN coin52_wallets w ON w.user_id=d.inviter_id WHERE d.inviter_id=?1 AND d.operation=?2 AND d.created_at=?4`).bind(u.id, op, attempt, t),
    db.prepare(`UPDATE coin52_wallets SET balance=balance-?2,revision=revision+1,updated_at=?3 WHERE user_id=?1 AND EXISTS(SELECT 1 FROM coin52_ledger WHERE attempt=?4)`).bind(u.id, stake, t, attempt),
  ])
  if (!r[0].meta.changes) fail(409, `D币不足，需要 ${stake}`, 'pet_coins')
  const id = (await db.prepare('SELECT id FROM pet_duels WHERE inviter_id=? AND operation=?').bind(u.id, op).first<{ id: number }>())!.id
  return c.json({ id })
})

petBattle.post('/api/pet/duel/:id{[0-9]+}/:act{cancel|decline}', async (c) => {
  sameOrigin(c)
  const u = needUser(c), db = c.env.DB, t = Math.floor(Date.now() / 1000), id = Number(c.req.param('id')), act = c.req.param('act')
  const d = await db.prepare('SELECT * FROM pet_duels WHERE id=?').bind(id).first<Duel>()
  if (!d || (act === 'cancel' ? d.inviter_id : d.invitee_id) !== u.id) fail(404, '没有这个约战')
  if (d!.status !== 'open') return c.json({ status: d!.status })
  await refundDuel(db, id, act === 'cancel' ? 'cancelled' : 'declined', t)
  return c.json({ status: (await db.prepare('SELECT status FROM pet_duels WHERE id=?').bind(id).first<{ status: string }>())!.status })
})

petBattle.post('/api/pet/duel/:id{[0-9]+}/accept', async (c) => {
  sameOrigin(c)
  const u = needUser(c), db = c.env.DB, t = Math.floor(Date.now() / 1000), day = petDay(t), id = Number(c.req.param('id'))
  await expireDuels(db, t)
  const d = await db.prepare('SELECT * FROM pet_duels WHERE id=?').bind(id).first<Duel>()
  if (!d || d.invitee_id !== u.id) fail(404, '没有这个约战')
  if (d!.status === 'done' && d!.battle_id) return c.json(await battleView(db, d!.battle_id, u.id))
  if (d!.status !== 'open') fail(409, d!.status === 'expired' ? '约战已过期' : '约战已取消', 'pet_duel_closed')
  const me = await duelEligible(db, u.id, t)
  if (!me.ok) fail(409, me.reason, 'pet_duel_me')
  if ((await stakedToday(db, u.id, day)) + d!.stake > PET_DUEL.dailyStake) fail(409, `今天押注合计不能超过 ${PET_DUEL.dailyStake} D币`, 'pet_duel_daily')
  const inviter = await db.prepare('SELECT id,username,name,nick FROM users WHERE id=?').bind(d!.inviter_id).first<any>()
  const a = await fighterFor(db, inviter.id, displayName(inviter), await petProgress(db, inviter.id, t)), b = await fighterFor(db, u.id, displayName(u as never), await petProgress(db, u.id, t))
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]
  const result = petSimulate(a, b, seed)
  const pot = d!.stake * 2, rake = result.winner === -1 ? 0 : Math.floor(pot * PET_DUEL.rake), payout = result.winner === -1 ? 0 : pot - rake
  const winnerId = result.winner === 0 ? a.id : result.winner === 1 ? b.id : null
  // 近 7 天同一对手、同一方连赢 ≥4 场 → 标记复核
  const recent = (await db.prepare(`SELECT winner_id FROM pet_duels WHERE status='done' AND created_at>?3 AND ((inviter_id=?1 AND invitee_id=?2) OR (inviter_id=?2 AND invitee_id=?1)) ORDER BY id DESC LIMIT 3`).bind(a.id, b.id, t - 7 * 86400).all<{ winner_id: number | null }>()).results
  const flag = winnerId && recent.length === 3 && recent.every((r) => r.winner_id === winnerId) ? 1 : 0
  const op = 'duel:' + id, att = 'duel-accept:' + id
  const gate = `EXISTS(SELECT 1 FROM pet_duels WHERE id=${id} AND status='done' AND settled_at=${t})`
  const stmts = [
    // 1. 接受方押注（余额够才继续；duel 仍 open）
    db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT ?1,'pet-duel-stake','duel:'||?2,?3,-?4,w.balance-?4,?5 FROM coin52_wallets w WHERE w.user_id=?1 AND w.balance>=?4 AND EXISTS(SELECT 1 FROM pet_duels WHERE id=?2 AND status='open' AND expires_at>?5)`).bind(u.id, id, att, d!.stake, t),
    db.prepare(`UPDATE pet_duels SET status='done',settled_at=?2,winner_id=?3,payout=?4,rake=?5,flag=?6 WHERE id=?1 AND status='open' AND EXISTS(SELECT 1 FROM coin52_ledger WHERE attempt=?7)`).bind(id, t, winnerId, payout, rake, flag, att),
    db.prepare(`UPDATE coin52_wallets SET balance=balance-?2,revision=revision+1,updated_at=?3 WHERE user_id=?1 AND ${gate}`).bind(u.id, d!.stake, t),
    db.prepare(`INSERT INTO pet_battles(attacker_id,defender_id,operation,day,seed,attacker_level,defender_level,winner,rounds,fighters,events,xp,created_at) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,0,?12 WHERE ${gate}`)
      .bind(a.id, b.id, op, day, seed, a.level, b.level, result.winner, result.rounds, JSON.stringify([a, b]), JSON.stringify(result.events), t),
    db.prepare(`UPDATE pet_duels SET battle_id=(SELECT id FROM pet_battles WHERE attacker_id=?2 AND operation=?3) WHERE id=?1 AND ${gate}`).bind(id, a.id, op),
  ]
  if (winnerId) stmts.push(
    db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT ?1,'pet-duel-win','duel:'||?2,'duel-win:'||?2,?3,w.balance+?3,?4 FROM coin52_wallets w WHERE w.user_id=?1 AND ${gate}`).bind(winnerId, id, payout, t),
    db.prepare(`UPDATE coin52_wallets SET balance=balance+?2,revision=revision+1,updated_at=?3 WHERE user_id=?1 AND ${gate}`).bind(winnerId, payout, t))
  else for (const uid of [a.id, b.id]) stmts.push(
    db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT ?1,'pet-duel-refund','duel-draw:'||?2,'duel-draw:'||?2||':'||?1,?3,w.balance+?3,?4 FROM coin52_wallets w WHERE w.user_id=?1 AND ${gate}`).bind(uid, id, d!.stake, t),
    db.prepare(`UPDATE coin52_wallets SET balance=balance+?2,revision=revision+1,updated_at=?3 WHERE user_id=?1 AND ${gate}`).bind(uid, d!.stake, t))
  const r = await db.batch(stmts)
  if (!r[0].meta.changes) {
    const now2 = await db.prepare('SELECT status,battle_id FROM pet_duels WHERE id=?').bind(id).first<{ status: string; battle_id: number | null }>()
    if (now2?.status === 'done' && now2.battle_id) return c.json(await battleView(db, now2.battle_id, u.id))
    if ((await balanceOf(db, u.id)) < d!.stake) fail(409, `D币不足，需要 ${d!.stake}`, 'pet_coins')
    fail(409, '约战已变化，请刷新', 'pet_duel_closed')
  }
  const bid = (await db.prepare('SELECT battle_id FROM pet_duels WHERE id=?').bind(id).first<{ battle_id: number }>())!.battle_id
  return c.json({ ...(await battleView(db, bid, u.id)), duel: { id, stake: d!.stake, payout, rake, winner_id: winnerId } })
})
