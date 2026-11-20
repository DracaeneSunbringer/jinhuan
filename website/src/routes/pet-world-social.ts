import { Hono } from 'hono'
import type { Ctx } from '../types'
import { boundedJson, fail, sameOrigin } from '../lib/http'
import { needUser } from '../services/auth'
import { applyActions, autoDue, BASE_PRICE, cropStage, priceOf, refresh, sprinkled, weatherOf, worldDay, worldStockAdd } from '../shared/pet-world'
import { guardView, manorTransferQuote, production, publicWorld, realDay, reserveSocialBudget, SOCIAL, socialLog, socialNotice, stealBudget, TRANSFER_POLICY } from '../shared/pet-world-social'
import type { SocialWorld } from '../shared/pet-world-social'
import type { ManorState } from '../shared/manor'

export const petWorldSocial = new Hono<Ctx>()
const now = () => Math.floor(Date.now() / 1000)
const active = (id: string) => `EXISTS(SELECT 1 FROM users u WHERE u.id=${id} AND u.disabled=0 AND u.kind='user') AND NOT EXISTS(SELECT 1 FROM account_retirements r WHERE r.source_id=${id})`
petWorldSocial.use('/api/pet/world/*', async (c, next) => {
  const u = needUser(c)
  c.header('cache-control', 'no-store')
  if (!(await c.env.DB.prepare(`SELECT 1 AS ok WHERE ${active('?1')}`).bind(u.id).first())) fail(403, '账号不可用')
  await next()
})
type WorldRow = { rev: number; state: SocialWorld }
type Wallet = { balance: number; revision: number }
type Daily = { attempts: number; fines: number }
const wallet = async (db: D1Database, id: number): Promise<Wallet> => (await db.prepare('SELECT balance,revision FROM coin52_wallets WHERE user_id=?').bind(id).first<Wallet>()) || { balance: 0, revision: 0 }
async function load(db: D1Database, id: number, t: number): Promise<WorldRow | null> {
  const r = await db.prepare(`SELECT rev,state FROM pet_world WHERE user_id=?1 AND ${active('?1')}`).bind(id).first<{ rev: number; state: string }>()
  if (!r) return null
  const state = JSON.parse(r.state) as SocialWorld
  if (state.v !== 2) return null
  return { rev: r.rev, state: refresh(state, t) as SocialWorld }
}
const pack = (s: SocialWorld) => { const raw = JSON.stringify(s); if (raw.length > 48 * 1024) fail(413, '谷数据过大'); return raw }
const changed = (db: D1Database) => db.prepare("SELECT json(CASE WHEN changes()=1 THEN '1' ELSE 'social_conflict' END) AS ok")
const write = (db: D1Database, id: number, row: WorldRow, op: string, t: number) => [
  db.prepare(`UPDATE pet_world SET state=?3,rev=rev+1,op=?2,updated_at=?4 WHERE user_id=?1 AND rev=?5 AND ${active('?1')}`).bind(id, op, pack(row.state), t, row.rev), changed(db),
]
function keys(body: Record<string, unknown>, allowed: string[]) { if (Object.keys(body).some(k => !allowed.includes(k))) fail(400, '请求包含不支持的字段') }
function operation(body: Record<string, unknown>) {
  const op = body.op ?? body.operation
  if (typeof op !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(op) || (body.op && body.operation && body.op !== body.operation)) fail(400, '操作编号无效')
  return (op as string).toLowerCase()
}
function revision(v: unknown): number { if (!Number.isSafeInteger(v) || (v as number) < 1) fail(400, '版本无效'); return v as number }
function target(raw: string, uid: number) { const id = Number(raw); if (!Number.isSafeInteger(id) || id <= 0 || id === uid) fail(400, '不能这样串门'); return id }
async function duplicate(db: D1Database, uid: number, op: string, request: string) {
  const row = await db.prepare('SELECT request,result FROM pet_world_social_ops WHERE user_id=? AND op=?').bind(uid, op).first<{ request: string; result: string }>()
  if (!row) return null
  if (row.request !== request) fail(409, '该操作编号已用于其他请求', 'social_op_reused')
  return { ...JSON.parse(row.result), duplicate: true }
}
async function commit(db: D1Database, uid: number, op: string, request: string, result: Record<string, unknown>, t: number, statements: D1PreparedStatement[]) {
  try {
    await db.batch([db.prepare('INSERT INTO pet_world_social_ops(user_id,op,request,result,created_at) VALUES(?,?,?,?,?)').bind(uid, op, request, JSON.stringify(result), t), ...statements])
    return result
  } catch {
    const previous = await duplicate(db, uid, op, request)
    if (previous) return previous
    fail(409, '状态或余额已变化，请刷新后重试', 'social_conflict')
  }
}
function money(db: D1Database, id: number, delta: number, kind: string, ref: string, t: number, expected?: Wallet) {
  if (!delta) return []
  const list = [db.prepare('INSERT OR IGNORE INTO coin52_wallets(user_id,balance,revision,updated_at) VALUES(?,0,0,?)').bind(id, t)]
  const sql = `UPDATE coin52_wallets SET balance=balance+?2,revision=revision+1,updated_at=?3 WHERE user_id=?1 AND balance+?2 BETWEEN 0 AND 9007199254740991 AND ${active('?1')}`
  list.push(expected ? db.prepare(sql + ' AND balance=?4 AND revision=?5').bind(id, delta, t, expected.balance, expected.revision) : db.prepare(sql).bind(id, delta, t), changed(db))
  list.push(db.prepare('INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT ?1,?2,?3,?2||\':\'||?3,?4,balance,?5 FROM coin52_wallets WHERE user_id=?1').bind(id, kind, ref, delta, t), changed(db))
  return list
}
const daily = async (db: D1Database, uid: number, day: string): Promise<Daily> => (await db.prepare('SELECT attempts,fines FROM pet_world_social_daily WHERE user_id=? AND day=?').bind(uid, day).first<Daily>()) || { attempts: 0, fines: 0 }

// 与主世界集市一致：昨日每种物品销量的有界主键查询，客户端不能提交估值。
async function marketPrices(db: D1Database, t: number) {
  const day = worldDay(t), yesterday = new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10), ids = Object.keys(BASE_PRICE)
  const rows = (await db.prepare(`SELECT item,n FROM pet_market_volume WHERE day=? AND item IN (${ids.map(() => '?').join(',')})`).bind(yesterday, ...ids).all<{ item: string; n: number }>()).results
  const sold = new Map(rows.map(r => [r.item, r.n]))
  return Object.fromEntries(ids.map(id => [id, priceOf(id, day, sold.get(id) || 0)]))
}

petWorldSocial.get('/api/pet/world/neighbors', async (c) => {
  const u = needUser(c), db = c.env.DB
  const rawLimit = c.req.query('limit'), limit = rawLimit === undefined ? 20 : Number(rawLimit)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30) fail(400, '分页大小无效')
  const cursor = c.req.query('cursor')
  let at = Number.MAX_SAFE_INTEGER, id = Number.MAX_SAFE_INTEGER
  if (cursor) { const parts = cursor.split(':'); if (parts.length !== 2 || !parts.every(x => /^\d+$/.test(x))) fail(400, '分页游标无效'); [at, id] = parts.map(Number); if (![at, id].every(Number.isSafeInteger)) fail(400, '分页游标无效') }
  // 先从时间索引截取最多31行，再筛账号，不扫描JSON，也不为补齐停用用户而遍历全表。
  const rows = (await db.prepare('SELECT user_id,rev,updated_at FROM pet_world INDEXED BY pet_world_updated_at WHERE (updated_at,user_id)<(?1,?2) ORDER BY updated_at DESC,user_id DESC LIMIT ?3').bind(at, id, limit + 1).all<{ user_id: number; rev: number; updated_at: number }>()).results
  const page = rows.slice(0, limit), ids = page.map(x => x.user_id)
  const eligible = ids.length ? (await db.prepare(`SELECT id FROM users WHERE id IN (${ids.map(() => '?').join(',')}) AND disabled=0 AND kind='user' AND NOT EXISTS(SELECT 1 FROM account_retirements r WHERE r.source_id=users.id)`).bind(...ids).all<{ id: number }>()).results : []
  const allowed = new Set(eligible.map(x => x.id)), last = page[page.length - 1]
  return c.json({ list: page.filter(x => x.user_id !== u.id && allowed.has(x.user_id)).map(x => ({ id: x.user_id, rev: x.rev, activeAt: x.updated_at })), next: rows.length > limit && last ? `${last.updated_at}:${last.user_id}` : null, now: now() })
})

petWorldSocial.get('/api/pet/world/visit/:id', async (c) => {
  const u = needUser(c), id = target(c.req.param('id'), u.id), db = c.env.DB, t = now(), day = realDay(t)
  const [owner, me, d, perTarget, prices] = await Promise.all([load(db, id, t), load(db, u.id, t), daily(db, u.id, day), db.prepare('SELECT attempts FROM pet_world_social_targets WHERE user_id=? AND owner_id=? AND day=?').bind(u.id, id, day).first<{ attempts: number }>(), marketPrices(db, t)])
  if (!owner) return fail(404, '这个谷暂时无法访问')
  const rounds = [...new Set(production(owner.state, t, prices).map(g => g.source.social ? g.source.social.round + (g.batch ? ':' + g.batch.bid : '') : undefined).filter((r): r is string => !!r))]
  const tried = rounds.length ? (await db.prepare(`SELECT round FROM pet_world_social_rounds WHERE owner_id=? AND visitor_id=? AND round IN (${rounds.map(() => '?').join(',')})`).bind(id, u.id, ...rounds).all<{ round: string }>()).results : []
  const triedSet = new Set(tried.map(x => x.round)), state = publicWorld(owner.state, t, prices)
  const items = production(owner.state, t, prices)
  state.production = state.production.map((g, i) => ({ ...g, stealable: g.stealable && !!me && d.attempts < SOCIAL.dailyAttempts && (perTarget?.attempts || 0) < SOCIAL.targetAttempts && !autoDue(me.state, t) && !triedSet.has((items[i].source.social?.round || '') + (items[i].batch ? ':' + items[i].batch!.bid : '')) }))
  return c.json({ id, rev: owner.rev, state, now: t, day, attemptsLeft: Math.max(0, SOCIAL.dailyAttempts - d.attempts), targetAttemptsLeft: Math.max(0, SOCIAL.targetAttempts - (perTarget?.attempts || 0)), fineRemaining: Math.max(0, SOCIAL.dailyFine - d.fines), notice: socialNotice(me?.state.socialNotice === SOCIAL.noticeVersion) })
})

petWorldSocial.post('/api/pet/world/visit/:id', async (c) => {
  sameOrigin(c)
  const u = needUser(c), id = target(c.req.param('id'), u.id), db = c.env.DB, t = now(), day = realDay(t)
  const body = await boundedJson(c, 2048)
  keys(body, ['op', 'operation', 'rev', 'action', 'i', 'item', 'batch', 'noticeVersion'])
  const op = operation(body), rev = revision(body.rev), action = body.action, i = body.i
  if (!['steal-crop', 'steal-animal', 'help-water'].includes(String(action)) || !Number.isSafeInteger(i) || (i as number) < 0 || (body.item !== undefined && typeof body.item !== 'string') || (body.batch !== undefined && typeof body.batch !== 'string')) fail(400, '动作无效')
  const request = JSON.stringify(['visit', id, rev, action, i, body.item ?? null, body.batch ?? null, body.noticeVersion ?? null])
  const prior = await duplicate(db, u.id, op, request); if (prior) return c.json(prior)
  const [owner, me, balance, d, perTarget, prices] = await Promise.all([load(db, id, t), load(db, u.id, t), wallet(db, u.id), daily(db, u.id, day), db.prepare('SELECT attempts FROM pet_world_social_targets WHERE user_id=? AND owner_id=? AND day=?').bind(u.id, id, day).first<{ attempts: number }>(), marketPrices(db, t)])
  if (!owner) return fail(404, '这个谷暂时无法访问')
  if (!me) return fail(409, '请先进入自己的谷建立存档')
  if (autoDue(owner.state, t) || autoDue(me.state, t)) return fail(409, '请先完成自己和主人的管家待结算，再进行串门操作', 'social_auto_pending')
  if (owner.rev !== rev) return fail(409, '主人状态已变化，请重新查看', 'social_conflict')
  // 空动作复用主规则的旧库存/动物初始化；此处已拒绝待补算管家，不产生经济动作。
  for (const row of [owner, me]) applyActions(row.state, [], { t, day: worldDay(t), rand: () => 0, prices: {}, coins: 0 })
  const statements: D1PreparedStatement[] = []
  let caught = false, fine = 0, got: { id: string; q: number; n: number } | null = null
  if (action === 'help-water') {
    const p = owner.state.plots[i as number]
    if (!p) return fail(400, '这里没有作物')
    const st = cropStage(p, t)
    if (st.stage < 0 || st.stage >= 3 || p.w > st.stage || sprinkled(owner.state, i as number) || weatherOf(worldDay(t)) === 1) return fail(409, '现在不需要浇水')
    p.w++; p.g += Math.floor(st.left * 0.25)
  } else {
    if (me.state.socialNotice !== SOCIAL.noticeVersion && body.noticeVersion !== SOCIAL.noticeVersion) return c.json({ error: '请先阅读偷取与罚款规则', code: 'social_notice_required', notice: socialNotice(false) }, 409)
    if (d.attempts >= SOCIAL.dailyAttempts || (perTarget?.attempts || 0) >= SOCIAL.targetAttempts) return fail(429, '今天的尝试次数已用完')
    const items = production(owner.state, t, prices), budget = stealBudget(items, owner.state)
    const g = items.find(x => x.kind === (action === 'steal-crop' ? 'crop' : 'animal') && x.i === i && (!body.item || x.item === body.item) && (!body.batch || x.batch?.bid === body.batch) && x.remaining > 0 && x.charge <= budget.remainingValue)
    if (!g) return fail(409, '没有可偷的成熟份额，主人保底不足时不可偷', 'social_no_share')
    g.source.social ||= { round: crypto.randomUUID(), taken: {} }
    const round = g.source.social.round + (g.batch ? ':' + g.batch.bid : '')
    if (await db.prepare('SELECT 1 FROM pet_world_social_rounds WHERE owner_id=? AND round=? AND visitor_id=?').bind(id, round, u.id).first()) return fail(409, '本轮已经尝试过了')
    caught = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 < guardView(owner.state, t).catchChance
    fine = caught ? Math.min(balance.balance, SOCIAL.fine, Math.max(0, SOCIAL.dailyFine - d.fines)) : 0
    if (!caught) {
      reserveSocialBudget(owner.state, items, g.charge)
      g.source.social.taken[g.item] = (g.source.social.taken[g.item] || 0) + 1
      if (g.batch) (g.source.social.batches ||= {})[g.batch.bid] = { id: g.item, n: g.taken + 1 }
      if (worldStockAdd(me.state, g.item, 0, 1, t, g.batch ? { at: g.batch.at, expires: g.batch.expires } : undefined) === false) return fail(409, '仓库暂时无法接收该物品')
      got = { id: g.item, q: 0, n: 1 }
    }
    me.state.socialNotice = SOCIAL.noticeVersion
    statements.push(
      db.prepare('INSERT INTO pet_world_social_rounds(owner_id,round,visitor_id,op,caught,item,quantity,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id, round, u.id, op, caught ? 1 : 0, g.item, caught ? 0 : 1, t),
      db.prepare('INSERT INTO pet_world_social_daily(user_id,day,attempts,fines) VALUES(?,?,1,?) ON CONFLICT(user_id,day) DO UPDATE SET attempts=attempts+1,fines=fines+excluded.fines').bind(u.id, day, fine),
      db.prepare('INSERT INTO pet_world_social_targets(user_id,owner_id,day,attempts) VALUES(?,?,?,1) ON CONFLICT(user_id,owner_id,day) DO UPDATE SET attempts=attempts+1').bind(u.id, id, day),
    )
    if (fine) statements.push(...money(db, u.id, -fine, 'pet-world-social-fine', `${u.id}:${op}`, t, balance), ...money(db, id, fine, 'pet-world-social-fine-in', `${u.id}:${op}`, t))
    // 零余额被抓仍需校验钱包快照，否则与并发入账交错会错误免罚。
    else if (caught) statements.push(db.prepare("SELECT json(CASE WHEN COALESCE((SELECT balance FROM coin52_wallets WHERE user_id=?1),0)=?2 AND COALESCE((SELECT revision FROM coin52_wallets WHERE user_id=?1),0)=?3 THEN '1' ELSE 'wallet_conflict' END)").bind(u.id, balance.balance, balance.revision))
  }
  const log = { at: t, action: String(action), ...(got ? { item: got.id, n: got.n } : {}), ...(caught ? { action: 'caught', fine } : {}) }
  socialLog(owner.state, { ...log, peer: u.id }); socialLog(me.state, { ...log, peer: id })
  const result = { ok: true, id, rev: owner.rev + 1, myRev: me.rev + 1, action, caught, fine, got, now: t, attemptsLeft: SOCIAL.dailyAttempts - d.attempts - (action === 'help-water' ? 0 : 1), state: publicWorld(owner.state, t, prices) }
  return c.json(await commit(db, u.id, op, request, result, t, [...write(db, id, owner, op, t), ...write(db, u.id, me, op, t), ...statements]))
})

petWorldSocial.post('/api/pet/world/guard', async (c) => {
  sameOrigin(c)
  const u = needUser(c), db = c.env.DB, t = now(), body = await boundedJson(c, 1024)
  keys(body, ['op', 'operation', 'rev', 'action'])
  const op = operation(body), rev = revision(body.rev), action = body.action
  if (!['buy', 'enable', 'disable'].includes(String(action))) fail(400, '守护兽动作无效')
  const request = JSON.stringify(['guard', rev, action]), prior = await duplicate(db, u.id, op, request)
  if (prior) return c.json(prior)
  const [me, balance] = await Promise.all([load(db, u.id, t), wallet(db, u.id)])
  if (!me || me.rev !== rev) return fail(409, '谷状态已变化，请刷新')
  let spend = 0
  if (action === 'buy') {
    if (me.state.guard?.bought) return fail(409, '已经拥有守护兽')
    if (balance.balance < SOCIAL.guardPrice) return fail(409, '购买守护兽需要20000 D币')
    spend = SOCIAL.guardPrice; me.state.guard = { bought: t, on: true }
  } else {
    if (!me.state.guard?.bought) return fail(409, '请先购买守护兽')
    me.state.guard.on = action === 'enable'
  }
  socialLog(me.state, { at: t, peer: u.id, action: `guard-${action}` })
  return c.json(await commit(db, u.id, op, request, { ok: true, rev: me.rev + 1, spend, guard: guardView(me.state, t), now: t }, t, [...write(db, u.id, me, op, t), ...money(db, u.id, -spend, 'pet-world-guard-buy', op, t, balance)]))
})

type ManorRow = { rev: number; state: string; updated_at: number }
async function transferData(db: D1Database, uid: number, t: number) {
  const [manor, world, done, paid, frozen] = await Promise.all([
    db.prepare('SELECT rev,state,updated_at FROM manor WHERE user_id=?').bind(uid).first<ManorRow>(), load(db, uid, t),
    db.prepare('SELECT credit,quote,created_at,policy_version FROM pet_world_manor_transfers WHERE user_id=?').bind(uid).first<{ credit: number; quote: string; created_at: number; policy_version: string }>(),
    db.prepare("SELECT COALESCE(SUM(-delta),0) AS paid FROM coin52_ledger WHERE user_id=? AND kind='manor-buy' AND delta<0").bind(uid).first<{ paid: number }>(),
    db.prepare('SELECT closed_at FROM pet_world_manor_policy WHERE id=1').first<{ closed_at: number }>(),
  ])
  const state = manor ? JSON.parse(manor.state) as ManorState : null
  const quote = done ? JSON.parse(done.quote) : state ? manorTransferQuote(state, paid?.paid || 0, Math.min(t, frozen?.closed_at ?? t)) : null
  return { manor, world, done, quote }
}
petWorldSocial.get('/api/pet/world/manor-transfer', async (c) => {
  const u = needUser(c), t = now(), q = await transferData(c.env.DB, u.id, t)
  return c.json({ available: !!q.manor && !q.done, worldRequired: !q.world, manorRev: q.manor?.rev ?? null, rev: q.world?.rev ?? null, done: q.done ? { at: q.done.created_at, credit: q.done.credit } : null, quote: q.quote, now: t })
})
petWorldSocial.post('/api/pet/world/manor-transfer', async (c) => {
  sameOrigin(c)
  const u = needUser(c), db = c.env.DB, t = now(), body = await boundedJson(c, 1024)
  keys(body, ['op', 'operation', 'rev', 'manorRev', 'policyVersion', 'expectedCredit'])
  const op = operation(body), rev = revision(body.rev), manorRev = revision(body.manorRev)
  if (body.policyVersion !== TRANSFER_POLICY || !Number.isSafeInteger(body.expectedCredit) || (body.expectedCredit as number) < 0) fail(400, '请先查看当前迁移预览')
  const request = JSON.stringify(['manor-transfer', rev, manorRev, body.policyVersion, body.expectedCredit]), prior = await duplicate(db, u.id, op, request)
  if (prior) return c.json(prior)
  const q = await transferData(db, u.id, t)
  if (q.done) return fail(409, '已经迁移过了')
  if (!q.manor) return fail(404, '没有可迁移的旧庄园')
  if (!q.world) return fail(409, '请先进入谷建立存档')
  if (q.world.rev !== rev || q.manor.rev !== manorRev || q.quote.total !== body.expectedCredit) return fail(409, '迁移预览已变化，请重新确认')
  const credit = (q.world.state.constructionCredit || 0) + q.quote.total
  if (!Number.isSafeInteger(credit) || credit < 0) return fail(409, '建设额度无效')
  q.world.state.constructionCredit = credit
  socialLog(q.world.state, { at: t, peer: u.id, action: 'manor-transfer', n: q.quote.total })
  const statements = [
    db.prepare('INSERT INTO pet_world_manor_transfers(user_id,op,policy_version,manor_rev,world_rev,manor_snapshot,quote,credit,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(u.id, op, TRANSFER_POLICY, manorRev, rev, q.manor.state, JSON.stringify(q.quote), q.quote.total, t),
    // 原存档和历史账本不改，只推进版本并留下迁移编号；冻结触发器仅允许这一种更新。
    db.prepare(`UPDATE manor SET rev=rev+1,op=?2,updated_at=?3 WHERE user_id=?1 AND rev=?4 AND state=?5 AND ${active('?1')}`).bind(u.id, op, t, manorRev, q.manor.state), changed(db),
    ...write(db, u.id, q.world, op, t),
  ]
  return c.json(await commit(db, u.id, op, request, { ok: true, rev: rev + 1, manorRev: manorRev + 1, credit: q.quote.total, constructionCredit: credit, quote: q.quote, now: t }, t, statements))
})
