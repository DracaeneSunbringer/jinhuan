import { animalReady, autoDue, BASE_PRICE, cropStage, QUALITY, sprinkled, weatherOf, WORLD, worldDay } from './pet-world'
import type { Pen, Plot, WorldState } from './pet-world'
import { MANOR, M_ANIMALS, M_CROPS, M_PRICE, M_TREES, penView, plotView, treeView } from './manor'
import type { ManorState } from './manor'

export const SOCIAL = { dailyAttempts: 20, targetAttempts: 2, share: 0.1, guardPrice: 20_000, catch: 0.2, fine: 200, dailyFine: 1_000, logMax: 40, noticeVersion: 'valley-social-1', patrolStart: 22, patrolEnd: 6 } as const
export const TRANSFER_POLICY = 'manor-assets-20261105-v1'
export type SocialRound = { round: string; taken: Record<string, number>; batches?: Record<string, { id: string; n: number }> }
export type SocialSource = { social?: SocialRound }
export type SocialLog = { at: number; peer: number; action: string; item?: string; n?: number; fine?: number }
export type SocialWorld = WorldState & { guard?: { bought: number; on: boolean }; socialNotice?: string; socialLogs?: SocialLog[]; constructionCredit?: number; socialBudget?: { members: string[]; cap: number; spent: number } }
export type Production = { kind: 'crop' | 'animal'; i: number; item: string; gross: number; taken: number; remaining: number; unit: number; charge: number; source: SocialSource; batch?: { bid: string; at: number; expires: number } }
export const realDay = (t: number) => new Date((t + 8 * 3600) * 1000).toISOString().slice(0, 10)
export const socialTaken = (source: SocialSource, item: string) => Math.max(0, source.social?.taken[item] || 0)

// 主规则在随机品质/额外收成决定之后调用一次，传入完整一轮产物；自动收取也必须调用。
// 只扣真实物品，不铸造友情份额；一轮结束（含清除/出售动物）须删除 social。
export function deductSocialHarvest<T extends { id: string; q: number; n: number }>(source: SocialSource, got: T[]): T[] {
  const debt = { ...source.social?.taken }
  const result = got.map(g => { const n = Math.min(g.n, debt[g.id] || 0); debt[g.id] = (debt[g.id] || 0) - n; return { ...g, n: g.n - n } }).filter(g => g.n > 0)
  delete source.social
  return result
}
export const socialAnimalTaken = (source: SocialSource, bid: string) => Math.max(0, source.social?.batches?.[bid]?.n || 0)
export function socialLog(s: SocialWorld, log: SocialLog) { s.socialLogs = [...(s.socialLogs || []), log].slice(-SOCIAL.logMax) }
export function guardView(s: SocialWorld, t: number) {
  const hour = new Date((t + 8 * 3600) * 1000).getUTCHours()
  const patrolling = !!s.guard?.bought && !!s.guard.on && (hour >= SOCIAL.patrolStart || hour < SOCIAL.patrolEnd)
  return { owned: !!s.guard?.bought, enabled: !!s.guard?.on, patrolling, catchChance: patrolling ? SOCIAL.catch : 0, price: SOCIAL.guardPrice, patrol: { timezone: 'Asia/Shanghai', startHour: SOCIAL.patrolStart, endHour: SOCIAL.patrolEnd } }
}
export function socialNotice(accepted: boolean) {
  return { version: SOCIAL.noticeVersion, required: !accepted, dailyAttempts: SOCIAL.dailyAttempts, perTarget: SOCIAL.targetAttempts, perRound: 1, ownerProtectedShare: 0.9, fine: SOCIAL.fine, dailyFineCap: SOCIAL.dailyFine, fineLimitedByBalance: true, caughtConsumesAttempt: true, patrol: { timezone: 'Asia/Shanghai', startHour: SOCIAL.patrolStart, endHour: SOCIAL.patrolEnd }, text: '每现实日最多尝试20次，每人家每天2次，每轮产物一次。全体访客共用成熟产物10%价值预算，不足一件不可偷。守护兽北京时间22:00至06:00巡逻，发现概率20%；被抓也计次数，赔给主人最多200 D币，以余额为限，每日罚款最多1000 D币。' }
}

// 路由提供服务端当日行情，预算以主人必得的普通品质价值为分母，以最高品质价值为每件扣额。
// 收获仍可掷品质/额外数量，但不能因此使实际损失越过已授权的10%保底。
export function production(s: WorldState, t: number, prices: Record<string, number> = BASE_PRICE): Production[] {
  const out: Production[] = [], rain = weatherOf(worldDay(t)) === 1
  const add = (kind: Production['kind'], i: number, source: SocialSource, item: string, gross: number, batch?: Production['batch']) => {
    const unit = prices[item] || 0, taken = batch ? socialAnimalTaken(source, batch.bid) : socialTaken(source, item)
    if (gross <= 0 || unit <= 0) return
    out.push({ kind, i, item, gross, taken, remaining: Math.max(0, gross - taken), unit, charge: Math.ceil(unit * Math.max(...QUALITY)), source, batch })
  }
  s.plots.forEach((p, i) => { if (p && cropStage(p, t, sprinkled(s, i) || rain).stage === 3) add('crop', i, p as NonNullable<Plot> & SocialSource, p.c, 1) })
  s.barn.forEach((p, i) => {
    const st = animalReady(p, t)
    const batches = (st as typeof st & { batches?: { bid: string; id: string; n: number; at: number; expires: number }[] }).batches
    if (batches) { for (const b of batches) add('animal', i, p as Pen & SocialSource, b.id, b.n, b) }
    else if (st.ready) add('animal', i, p as Pen & SocialSource, st.def.product, st.n * WORLD.animalYield)
  })
  return out
}
const productionKey = (g: Production) => g.source.social ? `${g.kind}:${g.source.social.round}:${g.batch?.bid || g.item}` : ''
export function stealBudget(items: Production[], s?: SocialWorld) {
  const grossValue = items.reduce((v, g) => v + g.gross * g.unit, 0)
  const chargedValue = items.reduce((v, g) => v + g.taken * g.charge, 0)
  const currentCap = Math.floor(grossValue / 10)
  const pool = s?.socialBudget, livePool = pool && items.some(g => pool.members.includes(productionKey(g))) ? pool : null
  const cap = Math.min(currentCap, livePool?.cap ?? currentCap)
  const poolSpent = livePool?.spent ?? chargedValue
  const remainingValue = Math.max(0, Math.min(currentCap - chargedValue, cap - poolSpent))
  return { basis: 'guaranteed-value' as const, grossValue, cap, chargedValue, poolSpent, remainingValue, ownerProtectedShare: 0.9 }
}
// 已偷地块被主人收掉不能释放其他成熟物的预算。最多记录一个成熟池（24田+8窝），
// 其成员全部收掉/过期后才重新开池；中途新成熟的产物不会抬高旧池额度。
export function reserveSocialBudget(s: SocialWorld, items: Production[], charge: number) {
  if (!s.socialBudget || !items.some(g => s.socialBudget!.members.includes(productionKey(g)))) {
    for (const g of items) g.source.social ||= { round: crypto.randomUUID(), taken: {} }
    const b = stealBudget(items)
    s.socialBudget = { members: [...new Set(items.map(productionKey))], cap: b.cap, spent: b.chargedValue }
  }
  s.socialBudget.spent += charge
}
// 白名单构造。不能把世界状态展开后删几个字段：以后新增私有字段也不应自动公开。
export function publicWorld(s: SocialWorld, t: number, prices?: Record<string, number>) {
  const items = production(s, t, prices), budget = stealBudget(items, s), rain = weatherOf(worldDay(t)) === 1
  return {
    plots: s.plots.map((p, i) => { if (!p) return { i, crop: null }; const st = cropStage(p, t, sprinkled(s, i) || rain); return { i, crop: p.c, stage: st.stage, left: st.left, canWater: st.stage >= 0 && st.stage < 3 && !sprinkled(s, i) && !rain && p.w <= st.stage } }),
    animals: s.barn.map((p, i) => { const st = animalReady(p, t); return { i, kind: p.k, ready: st.ready, left: st.left, fed: st.fed, stage: st.stage, matureLeft: st.matureLeft, remaining: st.remaining } }),
    production: items.map(g => ({ kind: g.kind, i: g.i, item: g.item, batch: g.batch?.bid, remaining: g.remaining, taken: g.taken, budgetCost: g.charge, stealable: g.remaining > 0 && g.charge <= budget.remainingValue && !autoDue(s, t) })),
    guard: guardView(s, t), budget, pendingAuto: autoDue(s, t),
  }
}

export type TransferLine = { asset: string; quantity: number; unitCredit: number; credit: number; calculation: string }
export function manorTransferQuote(s: ManorState, paidPurchases: number, t: number) {
  const lines: TransferLine[] = []
  const add = (asset: string, quantity: number, unitCredit: number, calculation: string) => { if (quantity > 0) lines.push({ asset, quantity, unitCredit, credit: Math.floor(quantity * unitCredit), calculation }) }
  for (let n = MANOR.plotsStart + 1; n <= Math.min(s.plotN, MANOR.plotsMax); n++) { const c = MANOR.plotCost(n); add(`land:${n}`, 1, c.coins + c.wood * M_PRICE.wood, `${c.coins} D币购买成本 + ${c.wood}木材 × ${M_PRICE.wood}`) }
  for (let n = MANOR.pensStart + 1; n <= Math.min(s.penN, MANOR.pensMax); n++) { const c = MANOR.penCost(n); add(`pen:${n}`, 1, c.coins + c.wood * M_PRICE.wood, `${c.coins} D币购买成本 + ${c.wood}木材 × ${M_PRICE.wood}`) }
  if (s.dog) add('dog', 1, MANOR.dog.coins + MANOR.dog.wood * M_PRICE.wood, '原购买D币及已消耗木材成本；不另赠守护兽')
  for (const d of M_TREES) add(`tree:${d.id}`, s.trees.filter(x => x.k === d.id).length, d.energy, `原种植成本${d.energy}g能量；无现金报价，保守按1g=1建设额度`)
  let freeChick = 1
  for (const p of s.pens) {
    const d = M_ANIMALS.find(x => x.id === p.k); if (!d) continue
    if (d.id === 'chick' && freeChick) { freeChick--; lines.push({ asset: 'starter:chick', quantity: 1, unitCredit: 0, credit: 0, calculation: '扣除一只起始免费小鸡，不兑换本体或窝中产物' }); continue }
    add(`animal:${d.id}`, 1, Math.floor(d.price * 0.4), `现有动物按原购买价${d.price} × 原回收比例40%`)
    const v = penView(p, t); add(`uncollected:${d.product}`, Math.max(0, v.n - p.s), Math.floor(d.productPrice * 0.5), '已成熟且未被偷产物 × 基础价50%')
  }
  for (const [id, n] of Object.entries(s.inv)) {
    if (!Number.isSafeInteger(n) || n <= 0) continue
    const seed = M_CROPS.find(c => id === 'seed:' + c.id), price = seed ? seed.seed : M_PRICE[id]
    if (price) add(`inventory:${id}`, n, Math.floor(price * 0.5), `剩余库存 × ${seed ? '种子购买价' : '物品基础价'}${price} × 50%`)
  }
  s.plots.forEach((p, i) => { if (!p) return; const d = M_CROPS.find(c => c.id === p.c); if (!d) return; const v = plotView(p, i, t); add(`planted:${i}:${p.c}`, v.ripe ? v.have : 1, Math.floor((v.ripe ? d.price : d.seed) * 0.5), v.ripe ? '成熟未被偷份额 × 基础价50%' : '未成熟作物按种子成本50%，不预付未来产物') })
  for (const tr of s.trees) { const v = treeView(tr, t); add(`uncollected:wood:${tr.k}`, Math.max(0, v.n - tr.s), Math.floor(M_PRICE.wood * 0.5), '成熟未被偷木材 × 基础价50%') }
  // 无法追溯免费种子的批次，始终从剩余种子/田地/作物总值扣除完整免费种子价值。
  const cropAssets = lines.filter(x => x.asset.startsWith('planted:') || x.asset.startsWith('inventory:seed:') || M_CROPS.some(c => x.asset === `inventory:${c.id}`)).reduce((v, x) => v + x.credit, 0)
  const freeSeeds = Math.min(cropAssets, 6 * M_CROPS[0].seed * 0.5)
  lines.push({ asset: 'starter:seeds', quantity: 6, unitCredit: 0, credit: -freeSeeds, calculation: `扣除6份初始种子折算价值，最多${6 * M_CROPS[0].seed * 0.5}；跨种子/作物库存扣除` })
  const assetCredit = Math.max(0, lines.reduce((v, x) => v + x.credit, 0)), provenanceCap = Math.max(0, Math.floor(paidPurchases)), total = Math.min(assetCredit, provenanceCap)
  if (![assetCredit, provenanceCap, total].every(Number.isSafeInteger)) throw new Error('invalid_manor_value')
  return { policyVersion: TRANSFER_POLICY, valuedAt: t, lines, assetCredit, provenanceCap, provenanceReduction: assetCredit - total, total, currency: 'construction-credit', cash: 0, uses: ['expand', 'tool', 'buyAnimal'], transferable: false, explanation: '按现存资产折算；总额另以历史manor-buy实际D币支出作来源上限，不扣历史收入、不按净投入退款。没有付费记录的免费起始庄园额度为0。能量球、散余能量、等级、未来收益不兑换。' }
}
