import { Hono } from 'hono'
import type { Ctx } from '../types'
import { boundedJson, fail, sameOrigin } from '../lib/http'
import { sha256 } from '../lib/crypto'
import { needUser } from '../services/auth'
import { validPetState } from '../shared/pet-state'
import { PET_DAILY_XP_CAP, petDay, petTotalXp } from '../shared/pet-battle'
import { petGrant, petProgress, progressView } from './pet-battle'

export const petSaves = new Hono<Ctx>()

// 等级、经验、今日经验以服务端 pet_progress 为准；存档 JSON 里的这几项只是展示用副本。
function withProgress(state: Record<string, any>, p: { level: number; xp: number; day: string; day_xp: number }) {
  const met = state.daily?.day === p.day && !!state.daily?.met
  return { ...state, level: p.level, xp: p.xp, daily: { day: p.day, xp: p.day_xp, met } }
}
type Save = { revision: number; state: string; operation: string; state_hash: string; updated_at: number }

petSaves.get('/pets', async (c) => {
  if (!c.get('user')) return c.redirect('/login?next=%2Fpets')
  needUser(c)
  const url = new URL(c.req.url)
  url.pathname = '/index.html'
  url.search = ''
  const response = await c.env.ASSETS.fetch(new Request(url))
  return new Response(response.body, { status: response.status, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' } })
})

petSaves.use('/api/pet/*', async (c, next) => {
  needUser(c)
  c.header('cache-control', 'no-store')
  await next()
})

petSaves.get('/api/pet/state', async (c) => {
  const u = needUser(c)
  const row = await c.env.DB.prepare('SELECT revision,state,operation,updated_at FROM pet_saves WHERE user_id=?').bind(u.id).first<Save>()
  const t = Math.floor(Date.now() / 1000)
  const progress = row ? progressView(await petProgress(c.env.DB, u.id, t), t) : null
  const state = row ? withProgress(JSON.parse(row.state), progress!) : null
  return c.json({ user_id: u.id, name: u.name || u.username, revision: row?.revision ?? 0, state, progress, operation: row?.operation ?? null, updated_at: row?.updated_at ?? null })
})

petSaves.post('/api/pet/state', async (c) => {
  sameOrigin(c)
  const u = needUser(c)
  const body = await boundedJson(c, 128 * 1024) as { user_id?: unknown; revision?: unknown; operation?: unknown; state?: unknown; base_total?: unknown }
  const t = Math.floor(Date.now() / 1000)
  if (body.user_id !== u.id) fail(403, '登录账号已变化，请重新进入站宠', 'pet_account_changed')
  if (typeof body.revision !== 'number' || !Number.isSafeInteger(body.revision) || body.revision < 0 || typeof body.operation !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(body.operation)) fail(400, '存档版本或操作编号无效', 'pet_invalid_operation')
  if (!validPetState(body.state)) fail(400, '站宠存档格式未通过校验', 'pet_invalid_state')
  const revision = body.revision as number
  const operation = body.operation as string
  const raw = JSON.stringify(body.state), hash = await sha256(raw)
  const prior = await c.env.DB.prepare('SELECT revision,state,state_hash,operation,updated_at FROM pet_saves WHERE user_id=?').bind(u.id).first<Save>()
  if (prior && prior.operation === operation) {
    if (prior.state_hash !== hash) fail(409, '操作编号已用于另一份站宠进度', 'pet_operation_conflict')
    return c.json({ revision: prior.revision, operation: prior.operation, duplicate: true, progress: progressView(await petProgress(c.env.DB, u.id, t), t) })
  }
  if ((prior?.revision ?? 0) !== revision) fail(409, '另一设备已更新站宠进度，请重新载入云档', 'pet_conflict')
  if (prior && t - prior.updated_at < 5) {
    c.header('retry-after', '5')
    return c.json({ error: '保存较频繁，稍后同步', code: 'pet_save_rate' }, 429)
  }
  // 经验只认「相对上次同步的增量」，并受每日上限约束：前端怎么改等级都只能多拿当天剩余的那点经验。
  const sent = body.state as Record<string, any>
  const progress = prior ? await petProgress(c.env.DB, u.id, t) : null
  const priorTotal = (() => { try { const s = JSON.parse(prior!.state); return petTotalXp(Number(s.level) || 1, Number(s.xp) || 0) } catch { return 0 } })()
  const base = typeof body.base_total === 'number' && Number.isSafeInteger(body.base_total) && body.base_total >= 0 ? body.base_total : prior ? priorTotal : 0
  const want = Math.max(0, petTotalXp(sent.level, sent.xp) - base)
  const used = progress && progress.day === petDay(t) ? progress.day_xp : 0
  const allowed = Math.min(want, PET_DAILY_XP_CAP - used)
  const view = progressView(progress ? { ...progress, total_xp: progress.total_xp + allowed, day: petDay(t), day_xp: used + allowed } : { total_xp: allowed, day: petDay(t), day_xp: allowed }, t)
  const state = withProgress(sent, view)
  const stored = JSON.stringify(state)
  const row = await c.env.DB.prepare(`INSERT INTO pet_saves(user_id,revision,state,state_hash,operation,updated_at)
    SELECT ?1,1,?2,?3,?4,?5
    WHERE (?6=0 OR EXISTS(SELECT 1 FROM pet_saves WHERE user_id=?1 AND revision=?6))
      AND EXISTS(SELECT 1 FROM users WHERE id=?1 AND disabled=0 AND kind='user')
      AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=?1)
    ON CONFLICT(user_id) DO UPDATE SET revision=pet_saves.revision+1,state=excluded.state,state_hash=excluded.state_hash,operation=excluded.operation,updated_at=excluded.updated_at
    WHERE pet_saves.revision=?6
    RETURNING revision,operation`).bind(u.id, stored, hash, operation, t, revision).first<{ revision: number; operation: string }>()
  if (!row) fail(409, '站宠进度已变化，请重新载入云档', 'pet_conflict')
  if (!progress) await c.env.DB.prepare('INSERT OR IGNORE INTO pet_progress(user_id,total_xp,day,day_xp,imported_xp,updated_at) VALUES(?1,0,?2,0,0,?3)').bind(u.id, petDay(t), t).run()
  if (allowed) await petGrant(c.env.DB, u.id, allowed, t)
  return c.json({ ...row, progress: progressView(await petProgress(c.env.DB, u.id, t), t) })
})
