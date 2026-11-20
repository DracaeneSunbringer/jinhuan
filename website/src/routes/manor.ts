import { Hono } from 'hono'
import type { Ctx } from '../types'
import { boundedJson, fail, sameOrigin } from '../lib/http'
import { needUser } from '../services/auth'
import { applyOwn, applyVisit, levelOf, M_PRICE, mDay, mPrice, mRefresh, needsHelp, newManor, stealAt } from '../shared/manor'
import type { MAction, ManorState } from '../shared/manor'

// 肥鱼庄园接口。无轮询、无定时任务；每次请求读 1–2 行庄园 + 1 行钱包，写入全部在一个 batch 里（D1 batch 是事务）。
//   GET  /api/manor               自己的庄园（首次进入自动建档）
//   POST /api/manor/act           自己庄园里的一批动作
//   GET  /api/manor/neighbors     串门列表：有东西可偷的 + 最近活跃的（两次走索引的小查询）
//   GET  /api/manor/visit/:id     看别人的庄园
//   POST /api/manor/visit/:id     在别人庄园里偷 / 帮（同时改对方和自己两行；任一行版本不对整批回滚）
export const manor = new Hono<Ctx>()
// 独立庄园停止经营，历史资产通过谷内一次性迁移接口处理；数据和账本保留。
manor.get('/manor', c => c.redirect('/pets#social', 302))
manor.all('/api/manor', c => c.json({ error: '独立庄园已迁入🌟🐟谷，请在串门面板迁入原有资产', code: 'manor_retired', destination: '/pets#social' }, 410))
manor.all('/api/manor/*', c => c.json({ error: '独立庄园已停止经营，历史资产和账本保留', code: 'manor_retired', destination: '/pets#social' }, 410))
// 页面：站内 SPA 路由（和 /pets 一样由 worker 返回首页，未登录先去登录）
manor.get('/manor', async (c) => {
  if (!c.get('user')) return c.redirect('/login?next=%2Fmanor')
  const url = new URL(c.req.url); url.pathname = '/index.html'; url.search = ''
  const res = await c.env.ASSETS.fetch(new Request(url))
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' } })
})
manor.use('/api/manor/*', async (c, next) => { needUser(c); c.header('cache-control', 'no-store'); await next() })
manor.use('/api/manor', async (c, next) => { needUser(c); c.header('cache-control', 'no-store'); await next() })

type MRow = { rev: number; state: string; op: string | null; active_at: number }
const mNow = () => Math.floor(Date.now() / 1000)
const mOpOk = (op: unknown): op is string => typeof op === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(op)
const mRand = () => { const r = crypto.getRandomValues(new Uint32Array(256)); let i = 0; return () => r[i++ % 256] / 2 ** 32 }
const mBalance = async (db: D1Database, id: number) => (await db.prepare('SELECT balance FROM coin52_wallets WHERE user_id=?').bind(id).first<{ balance: number }>())?.balance ?? 0
const mName = (u: { username?: string; name?: string | null; nick?: string | null }) => String(u.nick || u.name || u.username || '').slice(0, 24)
// 访客看到的主人状态：去掉日志里别人的名字以外的私密信息（库存、每日计数）
const mPublic = (s: ManorState) => ({ ...s, inv: {}, cnt: {}, earn: 0, logs: [] as ManorState['logs'] })

async function mLoad(db: D1Database, id: number, t: number, create: boolean) {
  const q = 'SELECT rev,state,op,active_at FROM manor WHERE user_id=?'
  let row = await db.prepare(q).bind(id).first<MRow>()
  if (!row && create) {
    await db.prepare(`INSERT OR IGNORE INTO manor(user_id,rev,state,updated_at,active_at,ripe_at,lv) SELECT ?1,1,?2,0,0,0,1 WHERE EXISTS(SELECT 1 FROM users WHERE id=?1 AND disabled=0 AND kind='user')`).bind(id, JSON.stringify(newManor(t))).run()
    row = await db.prepare(q).bind(id).first<MRow>()
    if (!row) fail(403, '账号不可用')
  }
  if (!row) return null
  return { rev: row.rev, op: row.op, at: row.active_at, state: mRefresh(JSON.parse(row.state) as ManorState, t) }
}
const mPack = (s: ManorState) => { const raw = JSON.stringify(s); if (raw.length > 32 * 1024) fail(413, '庄园数据过大'); return raw }
// 一条「写庄园行」语句：版本对得上才写；ripe_at / help_at 供串门列表排序
const mWrite = (db: D1Database, id: number, rev: number, op: string, s: ManorState, uid: number, t: number, own: boolean) =>
  db.prepare(`UPDATE manor SET state=?3,rev=rev+1,op=?2,updated_at=?4,ripe_at=?5,help_at=?6,lv=?7${own ? ',active_at=?4' : ''} WHERE user_id=?1 AND rev=?8`)
    .bind(id, op, mPack(s), t, stealAt(s, uid, t), needsHelp(s, t) ? 1 : 0, levelOf(s.xp), rev)
// 断言：上一条写入真的生效了，否则让整个 batch 报错回滚（json() 遇到非法 JSON 会抛错）
const mGuard = (db: D1Database, id: number, op: string) => db.prepare(`SELECT json(CASE WHEN EXISTS(SELECT 1 FROM manor WHERE user_id=?1 AND op=?2) THEN '1' ELSE 'conflict' END) AS ok`).bind(id, op)
// D币 变动：流水 + 钱包，都以「庄园行 op = 本次编号」为前提
function mCoins(db: D1Database, id: number, gateId: number, op: string, kind: string, delta: number, t: number) {
  const gate = `EXISTS(SELECT 1 FROM manor WHERE user_id=?5 AND op=?2)`
  const list: D1PreparedStatement[] = []
  if (delta > 0) list.push(db.prepare(`INSERT OR IGNORE INTO coin52_wallets(user_id,balance,revision,updated_at) VALUES(?,0,0,?)`).bind(id, t))
  list.push(
    db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at) SELECT ?1,?6,?2,?6||':'||?2,?3,balance+?3,?4 FROM coin52_wallets WHERE user_id=?1 AND balance+?3>=0 AND ${gate}`).bind(id, op, delta, t, gateId, kind),
    db.prepare(`UPDATE coin52_wallets SET balance=balance+?3,revision=revision+1,updated_at=?4 WHERE user_id=?1 AND balance+?3>=0 AND ${gate}`).bind(id, op, delta, t, gateId))
  // 扣款必须真的扣到（余额不够就让整批回滚）
  if (delta < 0) list.push(db.prepare(`SELECT json(CASE WHEN EXISTS(SELECT 1 FROM coin52_ledger WHERE user_id=?1 AND attempt=?2) THEN '1' ELSE 'poor' END) AS ok`).bind(id, kind + ':' + op))
  return list
}

manor.get('/api/manor', async (c) => {
  const u = needUser(c), db = c.env.DB, t = mNow()
  const [m, coins] = await Promise.all([mLoad(db, u.id, t, true), mBalance(db, u.id)])
  const prices = Object.fromEntries(Object.keys(M_PRICE).map((id) => [id, mPrice(id, mDay(t))]))
  return c.json({ me: u.id, name: mName(u), rev: m!.rev, state: m!.state, coins, now: t, prices })
})

manor.post('/api/manor/act', async (c) => {
  sameOrigin(c)
  const u = needUser(c), db = c.env.DB, t = mNow()
  const body = await boundedJson(c, 8 * 1024) as { rev?: unknown; operation?: unknown; actions?: unknown }
  const op = body.operation
  if (!mOpOk(op)) return fail(400, '操作编号无效')
  if (!Array.isArray(body.actions) || !body.actions.length) fail(400, '动作无效')
  // 不要求客户端版本一致：动作都是「意图」（收第 i 块地…），直接在最新状态上执行；真遇到并发写入就重读重做一次。
  for (let attempt = 0; ; attempt++) {
    const [m, coins] = await Promise.all([mLoad(db, u.id, t, true), mBalance(db, u.id)])
    const w = m!
    if (w.op === op) return c.json({ rev: w.rev, state: w.state, coins, now: t, duplicate: true, out: [] })
    if (attempt === 0 && t - w.at < 1) fail(429, '操作太快了') // 每人每秒最多写一次
    const r = applyOwn(w.state, body.actions as MAction[], { t, uid: u.id, rand: mRand(), coins })
    if (!Number.isSafeInteger(r.spend) || !Number.isSafeInteger(r.earn) || r.spend < 0 || r.earn < 0) fail(400, '动作无效')
    const stmts = [mWrite(db, u.id, w.rev, op, w.state, u.id, t, true), mGuard(db, u.id, op)]
    if (r.earn) stmts.push(...mCoins(db, u.id, u.id, op, 'manor-income', r.earn, t))
    if (r.spend) stmts.push(...mCoins(db, u.id, u.id, op, 'manor-buy', -r.spend, t))
    try { await db.batch(stmts) } catch {
      if (attempt < 1) continue
      const now = await mLoad(db, u.id, t, false)
      return c.json({ error: '庄园正忙，稍后再试', code: 'manor_conflict', rev: now?.rev, state: now?.state, coins: await mBalance(db, u.id), now: t }, 409)
    }
    return c.json({ rev: w.rev + 1, state: w.state, coins: coins + r.earn - r.spend, now: t, out: r.out, xp: r.xp })
  }
})

manor.get('/api/manor/neighbors', async (c) => {
  const u = needUser(c), db = c.env.DB, t = mNow()
  const cols = 'm.user_id AS id,m.ripe_at,m.help_at,m.lv,m.active_at,u.username,u.name,u.nick,u.avatar'
  const [ripe, recent] = await Promise.all([
    db.prepare(`SELECT ${cols} FROM manor m JOIN users u ON u.id=m.user_id WHERE m.ripe_at BETWEEN 1 AND ?1 AND m.user_id<>?2 AND u.disabled=0 ORDER BY m.ripe_at DESC LIMIT 15`).bind(t, u.id).all(),
    db.prepare(`SELECT ${cols} FROM manor m JOIN users u ON u.id=m.user_id WHERE m.user_id<>?1 AND u.disabled=0 ORDER BY m.active_at DESC LIMIT 15`).bind(u.id).all(),
  ])
  const seen = new Set<number>(), list: unknown[] = []
  for (const r of [...ripe.results, ...recent.results] as Record<string, unknown>[]) {
    if (seen.has(r.id as number)) continue
    seen.add(r.id as number)
    const ra = Number(r.ripe_at)
    list.push({ id: r.id, name: mName(r as never), avatar: r.avatar || null, lv: r.lv, ripe: ra > 0 && ra <= t, ripeIn: ra > t ? ra - t : 0, help: !!r.help_at, active: r.active_at })
  }
  return c.json({ now: t, list })
})

manor.get('/api/manor/visit/:id', async (c) => {
  const u = needUser(c), db = c.env.DB, t = mNow(), id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id === u.id) fail(400, '不能这样串门')
  const [m, who] = await Promise.all([mLoad(db, id, t, false), db.prepare('SELECT username,name,nick,avatar FROM users WHERE id=? AND disabled=0').bind(id).first<{ username: string; name: string | null; nick: string | null; avatar: string | null }>()])
  if (!m || !who) fail(404, '这个人还没有庄园')
  return c.json({ id, name: mName(who!), avatar: who!.avatar, rev: m!.rev, state: mPublic(m!.state), now: t })
})

manor.post('/api/manor/visit/:id', async (c) => {
  sameOrigin(c)
  const u = needUser(c), db = c.env.DB, t = mNow(), id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id === u.id) fail(400, '不能这样串门')
  const body = await boundedJson(c, 4 * 1024) as { rev?: unknown; myRev?: unknown; operation?: unknown; actions?: unknown }
  const op = body.operation
  if (!mOpOk(op)) return fail(400, '操作编号无效')
  if (!Array.isArray(body.actions) || !body.actions.length) fail(400, '动作无效')
  for (let attempt = 0; ; attempt++) {
    const [o, me, coins, who] = await Promise.all([mLoad(db, id, t, false), mLoad(db, u.id, t, true), mBalance(db, u.id), db.prepare('SELECT username,name,nick FROM users WHERE id=? AND disabled=0').bind(id).first<{ username: string; name: string | null; nick: string | null }>()])
    if (!o || !who) return fail(404, '这个人还没有庄园')
    const mine = me!
    if (mine.op === op) return c.json({ duplicate: true, rev: o.rev, state: mPublic(o.state), myRev: mine.rev, me: mine.state, coins, now: t, out: [] })
    if (attempt === 0 && t - mine.at < 1) fail(429, '操作太快了')
    const r = applyVisit(o.state, mine.state, body.actions as MAction[], { t, uid: u.id, rand: mRand(), coins, ownerId: id, name: mName(u), ownerName: mName(who) })
    const stmts = [mWrite(db, id, o.rev, op, o.state, id, t, false), mGuard(db, id, op), mWrite(db, u.id, mine.rev, op, mine.state, u.id, t, true), mGuard(db, u.id, op)]
    if (r.coins) stmts.push(...mCoins(db, u.id, u.id, op, 'manor-help', r.coins, t))
    if (r.fine) stmts.push(...mCoins(db, u.id, u.id, op, 'manor-fine', -r.fine, t), ...mCoins(db, id, u.id, op, 'manor-fine-in', r.fine, t))
    try { await db.batch(stmts) } catch {
      if (attempt < 1) continue
      const [o2, m2] = await Promise.all([mLoad(db, id, t, false), mLoad(db, u.id, t, false)])
      return c.json({ error: '庄园正忙，再试一次', code: 'manor_conflict', rev: o2?.rev, state: o2 && mPublic(o2.state), myRev: m2?.rev, me: m2?.state, coins: await mBalance(db, u.id), now: t }, 409)
    }
    return c.json({ rev: o.rev + 1, state: mPublic(o.state), myRev: mine.rev + 1, me: mine.state, coins: coins + r.coins - r.fine, now: t, out: r.out, xp: r.xp })
  }
})
