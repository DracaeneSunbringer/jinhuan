// 肥鱼庄园：大肥鱼视角的社交农场（菜地 / 牧场 / 能量林）。规则与数值前后端共用，结算只在服务端。
// 和鱼鱼谷是两套独立存档；D币 走同一个钱包（coin52_wallets / coin52_ledger）。
// 一切按时间戳惰性计算：作物生长、作物「状况」（缺水 / 虫子 / 杂草）、动物产出与粪便、能量球、树木出木材，都不需要定时任务。
//
// 社交：任何玩家都可以去别人的庄园——
//   偷：成熟的作物（每块地最多被偷走 30%）、动物产物、能量球（每个球最多被偷 2 次）、木材；每人每天最多偷 MANOR.dailySteal 次。
//   帮：浇水 / 除虫 / 除草（作物成熟前）、喂食 / 清扫粪便（动物）、给树浇水（主人得能量）；每天前 MANOR.dailyHelpPaid 次有奖励。
//   看门狗：主人养狗后，每次偷有 MANOR.dogCatch 的概率被逮住，赔主人 MANOR.dogFine D币。
// 经济（按数值估算）：认真玩中后期每天净赚约 5–10 万 D币；新人第一天几千到一两万，起步只要几百 D币。

export const MANOR = {
  plotsStart: 6, plotsMax: 12, pensStart: 2, pensMax: 6, treesMax: 6, maxActions: 30, visitActions: 12,
  plotCost: (n: number) => ({ coins: 3_000 * (n - 5), wood: 4 * (n - 5) }), // 第 n 块地（n ≥ 7）
  penCost: (n: number) => ({ coins: 8_000 * (n - 1), wood: 6 * (n - 1) }), // 第 n 个栏位（n ≥ 3）
  dog: { coins: 20_000, wood: 20, lv: 3 },
  stealShare: 0.3, ballSteals: 2, ballShare: 0.25, dailySteal: 50, dailyHelpPaid: 30, helpCoins: 30,
  dogCatch: 0.2, dogFine: 200, dailyEarn: 300_000,
  messEvery: 3 * 3600, messMax: 3, fedFor: 24 * 3600, slot: 3 * 3600, ballWindow: 8, logMax: 40, byMax: 8,
  treeWater: 3, // 帮主人给树浇水：主人 +3g 能量（每棵树每天一次）
}
export const LEVELS = [0, 60, 200, 450, 900, 1_600, 2_600, 4_000, 6_000, 9_000]
export const levelOf = (xp: number) => { let l = 1; while (l < LEVELS.length && xp >= LEVELS[l]) l++; return l }

// n：一块地的收成（份）；grow：分钟
export type MCrop = { id: string; name: string; lv: number; seed: number; grow: number; n: number; price: number }
export const M_CROPS: MCrop[] = [
  { id: 'bokchoy', name: '小白菜', lv: 1, seed: 300, grow: 60, n: 10, price: 60 },
  { id: 'carrot', name: '胡萝卜', lv: 1, seed: 800, grow: 180, n: 10, price: 160 },
  { id: 'corn', name: '玉米', lv: 2, seed: 2_000, grow: 360, n: 12, price: 300 },
  { id: 'strawberry', name: '草莓', lv: 3, seed: 4_000, grow: 600, n: 12, price: 600 },
  { id: 'watermelon', name: '西瓜', lv: 4, seed: 8_000, grow: 960, n: 12, price: 1_300 },
  { id: 'pumpkin', name: '南瓜', lv: 5, seed: 12_000, grow: 1_440, n: 12, price: 2_000 },
]
// every：分钟产 1 个；cap：窝里最多攒几个（每坨粪便 -1）
export type MAnimal = { id: string; name: string; lv: number; price: number; every: number; cap: number; product: string; productName: string; productPrice: number }
export const M_ANIMALS: MAnimal[] = [
  { id: 'chick', name: '小鸡', lv: 1, price: 10_000, every: 120, cap: 6, product: 'egg', productName: '鸡蛋', productPrice: 200 },
  { id: 'rabbit', name: '兔子', lv: 2, price: 20_000, every: 180, cap: 5, product: 'fur', productName: '兔毛', productPrice: 450 },
  { id: 'sheep', name: '山羊', lv: 3, price: 40_000, every: 360, cap: 3, product: 'wool', productName: '羊绒', productPrice: 1_500 },
  { id: 'cow', name: '奶牛', lv: 4, price: 80_000, every: 240, cap: 4, product: 'milk', productName: '牛奶', productPrice: 1_500 },
]
// 树：种树花能量（g）；every：分钟出 1 块木材
export type MTree = { id: string; name: string; lv: number; energy: number; every: number; cap: number }
export const M_TREES: MTree[] = [
  { id: 'seabuck', name: '沙棘', lv: 1, energy: 120, every: 480, cap: 2 },
  { id: 'pine', name: '樟子松', lv: 3, energy: 400, every: 360, cap: 3 },
  { id: 'poplar', name: '胡杨', lv: 5, energy: 1_000, every: 240, cap: 4 },
]
export const M_PRICE: Record<string, number> = Object.fromEntries([
  ...M_CROPS.map((c) => [c.id, c.price]), ...M_ANIMALS.map((a) => [a.product, a.productPrice]), ['wood', 400],
])
export const M_NAME: Record<string, string> = Object.fromEntries([
  ...M_CROPS.map((c) => [c.id, c.name]), ...M_ANIMALS.map((a) => [a.product, a.productName]), ['wood', '木材'],
  ...M_CROPS.map((c) => ['seed:' + c.id, c.name + '种子']),
])
// 作物状况：缺水（必出）、虫子、杂草。成熟前没处理的，成熟时按比例减产。
export const ISSUES = [
  { bit: 1, id: 'water', name: '缺水', fix: '浇水', loss: 0.2 },
  { bit: 2, id: 'bug', name: '虫子', fix: '除虫', loss: 0.2 },
  { bit: 4, id: 'weed', name: '杂草', fix: '除草', loss: 0.1 },
]

export function mHash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
export const mDay = (t: number) => new Date((t + 8 * 3600) * 1000).toISOString().slice(0, 10)
export const mPrice = (item: string, day: string) => Math.round((M_PRICE[item] || 0) * (0.9 + 0.2 * mHash('mp:' + item + ':' + day)))

// ---------- 状态 ----------
// 偷过的人：by（本轮）；s：本轮已被偷数量
export type MPlot = { c: string; t: number; f: number; s: number; by: number[] } | null
export type MPen = { k: string; fed: number; p: number; m: number; s: number; by: number[] }
export type MTreeS = { k: string; t: number; w: number; s: number; by: number[]; wd?: string }
export type MBall = { o?: 1; s: number; by: number[] }
// 日志：[时间, 对方 id, 对方名字, 动作, 物品, 数量]
export type MLog = [number, number, string, string, string, number]
export type ManorState = {
  v: 1; xp: number; plotN: number; plots: MPlot[]; penN: number; pens: MPen[]; trees: MTreeS[]
  energy: number; balls: Record<string, MBall>; from: number; inv: Record<string, number>; dog: number
  day: string; cnt: Record<string, number>; earn: number; love: number; logs: MLog[]; seen: number
}
export function newManor(t: number): ManorState {
  return { v: 1, xp: 0, plotN: MANOR.plotsStart, plots: Array(MANOR.plotsStart).fill(null), penN: MANOR.pensStart,
    pens: [{ k: 'chick', fed: t, p: t, m: t, s: 0, by: [] }], trees: [], energy: 0, balls: {}, from: slotOf(t), inv: { 'seed:bokchoy': 6 }, dog: 0,
    day: mDay(t), cnt: {}, earn: 0, love: 0, logs: [], seen: t }
}
export function mRefresh(s: ManorState, t: number) {
  const day = mDay(t)
  if (s.day !== day) { s.day = day; s.cnt = {}; s.earn = 0 }
  const now = slotOf(t)
  for (const k of Object.keys(s.balls)) if (Number(k) < now - MANOR.ballWindow) delete s.balls[k]
  return s
}

// ---------- 作物 ----------
export const cropDef = (id: string) => M_CROPS.find((c) => c.id === id)
// 本轮会出现哪些状况、什么时候出现（由地块种下时间决定，前后端一致）
export function plotIssues(p: NonNullable<MPlot>, i: number) {
  const c = cropDef(p.c)!, total = c.grow * 60, r = (k: string) => mHash(`iss:${p.t}:${i}:${k}`)
  const list: { bit: number; at: number }[] = [{ bit: 1, at: p.t + Math.round(total * (0.25 + 0.15 * r('w'))) }]
  if (r('b?') < 0.6) list.push({ bit: 2, at: p.t + Math.round(total * (0.2 + 0.4 * r('b'))) })
  if (r('g?') < 0.45) list.push({ bit: 4, at: p.t + Math.round(total * (0.1 + 0.4 * r('g'))) })
  return list
}
export function plotView(p: NonNullable<MPlot>, i: number, t: number) {
  const c = cropDef(p.c)!, total = c.grow * 60, ripeAt = p.t + total, ripe = t >= ripeAt
  const iss = plotIssues(p, i)
  const open = iss.filter((x) => x.at <= Math.min(t, ripeAt) && !(p.f & x.bit)).map((x) => x.bit) // 现在可见、还没处理的
  const loss = ripe ? ISSUES.filter((x) => open.includes(x.bit)).reduce((a, x) => a + x.loss, 0) : 0
  const yieldN = Math.max(1, Math.round(c.n * (1 - loss)))
  const stealMax = Math.floor(yieldN * MANOR.stealShare)
  return { c, ripe, ripeAt, stage: ripe ? 3 : Math.min(2, Math.floor(((t - p.t) / total) * 3)), left: Math.max(0, ripeAt - t), open, yieldN, stealMax, stealLeft: ripe ? Math.max(0, stealMax - p.s) : 0, have: ripe ? yieldN - p.s : 0 }
}

// ---------- 动物 ----------
export const animalDef = (id: string) => M_ANIMALS.find((a) => a.id === id)
export function penView(a: MPen, t: number) {
  const d = animalDef(a.k)!, fedEnd = a.fed + MANOR.fedFor
  const mess = Math.min(MANOR.messMax, Math.floor((t - a.m) / MANOR.messEvery))
  const cap = Math.max(1, d.cap - mess)
  const n = Math.max(0, Math.min(cap, Math.floor((Math.min(t, fedEnd) - a.p) / (d.every * 60))))
  const hungry = t >= fedEnd, feedable = t >= fedEnd - 4 * 3600
  return { d, mess, cap, n, hungry, feedable, fedLeft: Math.max(0, fedEnd - t), next: n >= cap || hungry ? 0 : d.every * 60 - ((Math.min(t, fedEnd) - a.p) % (d.every * 60)), stealLeft: n >= 2 ? Math.max(0, Math.max(1, Math.floor(n * MANOR.stealShare)) - a.s) : 0 }
}

// ---------- 能量球（蚂蚁森林）：北京时间每 3 小时一个时段，时段结束时球成熟，24 小时内可收 ----------
export const slotOf = (t: number) => Math.floor((t + 8 * 3600) / MANOR.slot)
export const slotEnd = (k: number) => (k + 1) * MANOR.slot - 8 * 3600
export function ballGrams(uid: number, k: number, lv: number) { return 8 + Math.floor(mHash(`ball:${uid}:${k}`) * 18) + Math.floor(lv / 2) * 2 }
export function ballsView(s: ManorState, uid: number, t: number) {
  const now = slotOf(t), lv = levelOf(s.xp), out: { k: number; g: number; ripe: boolean; left: number; have: number; stealable: number; o: boolean; by: number[] }[] = []
  for (let k = Math.max(s.from, now - MANOR.ballWindow); k <= now; k++) {
    const b = s.balls[k] || { s: 0, by: [] }, g = ballGrams(uid, k, lv), ripe = t >= slotEnd(k)
    if (b.o) continue
    const have = g - b.s
    out.push({ k, g, ripe, left: Math.max(0, slotEnd(k) - t), have, stealable: ripe && b.by.length < MANOR.ballSteals ? Math.ceil(g * MANOR.ballShare) : 0, o: !!b.o, by: b.by })
  }
  return out
}

// ---------- 树 ----------
export const treeDef = (id: string) => M_TREES.find((x) => x.id === id)
export function treeView(tr: MTreeS, t: number) {
  const d = treeDef(tr.k)!, n = Math.max(0, Math.min(d.cap, Math.floor((t - tr.w) / (d.every * 60))))
  return { d, n, next: n >= d.cap ? 0 : d.every * 60 - ((t - tr.w) % (d.every * 60)), stealLeft: n >= 2 && tr.s < 1 ? 1 : 0 }
}

// 下一次「有东西可偷」的时间（0 = 暂时没有），用于串门列表排序
export function stealAt(s: ManorState, uid: number, t: number) {
  let at = Infinity
  s.plots.forEach((p, i) => { if (!p) return; const v = plotView(p, i, t); if (!v.ripe) at = Math.min(at, v.ripeAt); else if (v.stealLeft > 0) at = Math.min(at, t) })
  for (const a of s.pens) { const v = penView(a, t); if (v.stealLeft > 0) at = Math.min(at, t); else if (!v.hungry) at = Math.min(at, t + v.next + animalDef(a.k)!.every * 60) }
  for (const b of ballsView(s, uid, t)) { if (b.stealable) at = Math.min(at, t); else if (!b.ripe) at = Math.min(at, slotEnd(b.k)) }
  return at === Infinity ? 0 : at
}
// 需要帮忙（有状况 / 粪便 / 饿了）
export function needsHelp(s: ManorState, t: number) {
  return s.plots.some((p, i) => p && plotView(p, i, t).open.length > 0 && !plotView(p, i, t).ripe) || s.pens.some((a) => { const v = penView(a, t); return v.mess > 0 || v.feedable })
}

// ---------- 动作 ----------
export type MAction = { a: string; [k: string]: unknown }
export type MOut = { ok: boolean; a: string; msg?: string; got?: [string, number][]; spend?: number; earn?: number; xp?: number; caught?: 1 }
export type MCtx = { t: number; uid: number; rand: () => number; coins: number }
const add = (inv: Record<string, number>, id: string, n: number) => { inv[id] = (inv[id] || 0) + n; if (inv[id] <= 0) delete inv[id] }
const has = (inv: Record<string, number>, id: string, n: number) => Object.hasOwn(inv, id) && inv[id] >= n
const idx = (v: unknown, n: number) => { const i = Math.floor(Number(v)); return Number.isInteger(i) && i >= 0 && i < n ? i : -1 }
const cnt = (s: ManorState, k: string) => s.cnt[k] || 0
const bump = (s: ManorState, k: string, n = 1) => { s.cnt[k] = cnt(s, k) + n }

// 自己庄园里的动作。返回本批支出 / 收入（调用方合并成一次扣款 / 入账）。
export function applyOwn(s: ManorState, actions: MAction[], ctx: MCtx) {
  mRefresh(s, ctx.t)
  const out: MOut[] = [], lv = () => levelOf(s.xp)
  let spend = 0, earn = 0, xp = 0
  const left = () => ctx.coins - spend + earn
  const no = (a: string, msg: string) => { out.push({ ok: false, a, msg }) }
  const gain = (n: number) => { xp += n; s.xp += n }
  for (const act of actions.slice(0, MANOR.maxActions)) {
    const a = String(act.a)
    if (a === 'plant') {
      const i = idx(act.i, s.plotN), c = cropDef(String(act.c))
      if (i < 0 || !c) { no(a, '参数不对'); continue }
      if (s.plots[i]) { no(a, '这块地有东西'); continue }
      if (c.lv > lv()) { no(a, `${c.name} 需要 ${c.lv} 级`); continue }
      if (!has(s.inv, 'seed:' + c.id, 1)) {
        if (left() < c.seed) { no(a, 'D币不足'); continue }
        spend += c.seed
      } else add(s.inv, 'seed:' + c.id, -1)
      s.plots[i] = { c: c.id, t: ctx.t, f: 0, s: 0, by: [] }; gain(1); out.push({ ok: true, a })
    } else if (a === 'fix') { // 自己处理状况（同样只能在成熟前）
      const i = idx(act.i, s.plotN), p = i >= 0 ? s.plots[i] : null, bit = Number(act.bit)
      if (!p) { no(a, '没有作物'); continue }
      const v = plotView(p, i, ctx.t)
      if (v.ripe || !v.open.includes(bit)) { no(a, '现在不需要'); continue }
      p.f |= bit; out.push({ ok: true, a })
    } else if (a === 'harvest') {
      const i = idx(act.i, s.plotN), p = i >= 0 ? s.plots[i] : null
      if (!p) { no(a, '没有作物'); continue }
      const v = plotView(p, i, ctx.t)
      if (!v.ripe) { no(a, '还没熟'); continue }
      add(s.inv, p.c, v.have); s.plots[i] = null; gain(3); out.push({ ok: true, a, got: [[p.c, v.have]] })
    } else if (a === 'clear') {
      const i = idx(act.i, s.plotN)
      if (i < 0 || !s.plots[i]) { no(a, '空地'); continue }
      s.plots[i] = null; out.push({ ok: true, a })
    } else if (a === 'buyAnimal') {
      const d = animalDef(String(act.k))
      if (!d) { no(a, '参数不对'); continue }
      if (d.lv > lv()) { no(a, `${d.name} 需要 ${d.lv} 级`); continue }
      if (s.pens.length >= s.penN) { no(a, '栏位满了，先扩建'); continue }
      if (left() < d.price) { no(a, 'D币不足'); continue }
      spend += d.price; s.pens.push({ k: d.id, fed: ctx.t, p: ctx.t, m: ctx.t, s: 0, by: [] }); out.push({ ok: true, a, spend: d.price })
    } else if (a === 'collect') {
      const i = idx(act.i, s.pens.length), pen = i >= 0 ? s.pens[i] : null
      if (!pen) { no(a, '参数不对'); continue }
      const v = penView(pen, ctx.t)
      if (!v.n) { no(a, '还没有产出'); continue }
      add(s.inv, v.d.product, v.n); pen.p = v.n >= v.cap || v.hungry ? Math.min(ctx.t, pen.fed + MANOR.fedFor) : pen.p + v.n * v.d.every * 60
      pen.s = 0; pen.by = []; gain(1); out.push({ ok: true, a, got: [[v.d.product, v.n]] })
    } else if (a === 'feed' || a === 'clean') {
      const i = idx(act.i, s.pens.length), pen = i >= 0 ? s.pens[i] : null
      if (!pen) { no(a, '参数不对'); continue }
      if (!penCare(pen, a, ctx.t)) { no(a, '现在不需要'); continue }
      out.push({ ok: true, a })
    } else if (a === 'sellAnimal') {
      const i = idx(act.i, s.pens.length), pen = i >= 0 ? s.pens[i] : null
      if (!pen) { no(a, '参数不对'); continue }
      const v = Math.round(animalDef(pen.k)!.price * 0.4)
      s.pens.splice(i, 1); earn += v; out.push({ ok: true, a, earn: v })
    } else if (a === 'balls') { // 收所有成熟的能量球
      let g = 0
      for (const b of ballsView(s, ctx.uid, ctx.t)) if (b.ripe) { g += b.have; s.balls[b.k] = { o: 1, s: 0, by: [] } }
      if (!g) { no(a, '还没有成熟的能量'); continue }
      s.energy += g; gain(1); out.push({ ok: true, a, got: [['energy', g]] })
    } else if (a === 'plantTree') {
      const d = treeDef(String(act.k))
      if (!d) { no(a, '参数不对'); continue }
      if (d.lv > lv()) { no(a, `${d.name} 需要 ${d.lv} 级`); continue }
      if (s.trees.length >= MANOR.treesMax) { no(a, '林子种满了'); continue }
      if (s.energy < d.energy) { no(a, '能量不够'); continue }
      s.energy -= d.energy; s.trees.push({ k: d.id, t: ctx.t, w: ctx.t, s: 0, by: [] }); gain(10); out.push({ ok: true, a })
    } else if (a === 'wood') {
      const i = idx(act.i, s.trees.length), tr = i >= 0 ? s.trees[i] : null
      if (!tr) { no(a, '参数不对'); continue }
      const v = treeView(tr, ctx.t)
      if (!v.n) { no(a, '还没长出木材'); continue }
      add(s.inv, 'wood', v.n); tr.w = v.n >= v.d.cap ? ctx.t : tr.w + v.n * v.d.every * 60; tr.s = 0; tr.by = []; gain(1); out.push({ ok: true, a, got: [['wood', v.n]] })
    } else if (a === 'sell') {
      const id = String(act.id), n = Math.floor(Number(act.n))
      if (!Object.hasOwn(M_PRICE, id) || !(n > 0) || !has(s.inv, id, n)) { no(a, '数量不对'); continue }
      const each = mPrice(id, s.day), room = Math.max(0, MANOR.dailyEarn - s.earn), k = Math.min(n, Math.floor(room / each))
      if (k <= 0) { no(a, '今天卖得够多了，明天再来'); continue }
      add(s.inv, id, -k); s.earn += k * each; earn += k * each; out.push({ ok: true, a, earn: k * each, msg: k < n ? `今天只能再卖 ${k} 个` : undefined })
    } else if (a === 'buySeed') {
      const c = cropDef(String(act.c)), n = Math.floor(Number(act.n))
      if (!c || !(n > 0 && n <= 99)) { no(a, '参数不对'); continue }
      if (c.lv > lv()) { no(a, `${c.name} 需要 ${c.lv} 级`); continue }
      if (left() < c.seed * n) { no(a, 'D币不足'); continue }
      spend += c.seed * n; add(s.inv, 'seed:' + c.id, n); out.push({ ok: true, a, spend: c.seed * n })
    } else if (a === 'expand') {
      const what = String(act.what), next = what === 'plot' ? s.plotN + 1 : s.penN + 1
      if (what !== 'plot' && what !== 'pen') { no(a, '参数不对'); continue }
      if (next > (what === 'plot' ? MANOR.plotsMax : MANOR.pensMax)) { no(a, '已经最大了'); continue }
      const cost = what === 'plot' ? MANOR.plotCost(next) : MANOR.penCost(next)
      if (!has(s.inv, 'wood', cost.wood)) { no(a, `需要 ${cost.wood} 块木材`); continue }
      if (left() < cost.coins) { no(a, 'D币不足'); continue }
      add(s.inv, 'wood', -cost.wood); spend += cost.coins
      if (what === 'plot') { s.plotN = next; s.plots.push(null) } else s.penN = next
      out.push({ ok: true, a, spend: cost.coins })
    } else if (a === 'dog') {
      if (s.dog) { no(a, '已经有狗了'); continue }
      if (lv() < MANOR.dog.lv) { no(a, `${MANOR.dog.lv} 级才能养狗`); continue }
      if (!has(s.inv, 'wood', MANOR.dog.wood)) { no(a, `需要 ${MANOR.dog.wood} 块木材搭狗窝`); continue }
      if (left() < MANOR.dog.coins) { no(a, 'D币不足'); continue }
      add(s.inv, 'wood', -MANOR.dog.wood); spend += MANOR.dog.coins; s.dog = ctx.t; out.push({ ok: true, a, spend: MANOR.dog.coins })
    } else if (a === 'seen') { s.seen = ctx.t; out.push({ ok: true, a })
    } else no(a, '未知动作')
  }
  return { out, spend, earn, xp }
}
// 喂食 / 清扫：主人和访客共用
function penCare(pen: MPen, a: string, t: number) {
  const v = penView(pen, t)
  if (a === 'feed') {
    if (!v.feedable) return false
    const end = pen.fed + MANOR.fedFor
    if (t > end) pen.p += t - end // 饿着的时间不产出
    pen.fed = t; return true
  }
  if (!v.mess) return false
  // 清扫：粪便清零（产出计时不变；被粪便占掉的空间腾出来，攒着的产出不丢）
  pen.m = t; return true
}

// 去别人庄园：偷 / 帮。owner 是对方的状态，me 是自己的状态（记每日次数、收赃物）。
export type VCtx = MCtx & { ownerId: number; name: string; ownerName: string }
export function applyVisit(owner: ManorState, me: ManorState, actions: MAction[], ctx: VCtx) {
  mRefresh(owner, ctx.t); mRefresh(me, ctx.t)
  const out: MOut[] = []
  let fine = 0, coins = 0, xp = 0, love = 0
  const no = (a: string, msg: string) => { out.push({ ok: false, a, msg }) }
  const log = (kind: string, item: string, n: number) => { owner.logs.unshift([ctx.t, ctx.uid, ctx.name, kind, item, n]); owner.logs.length = Math.min(owner.logs.length, MANOR.logMax) }
  const mine = (by: number[]) => by.includes(ctx.uid)
  const mark = (by: number[]) => { by.push(ctx.uid); if (by.length > MANOR.byMax) by.shift() }
  // 偷之前：每日次数 + 看门狗
  const tryCatch = (a: string) => {
    if (cnt(me, 'steal') >= MANOR.dailySteal) { no(a, '今天偷得够多了，做个好人吧'); return false }
    bump(me, 'steal')
    if (owner.dog && ctx.rand() < MANOR.dogCatch) {
      const f = Math.min(MANOR.dogFine, Math.max(0, ctx.coins - fine)); fine += f; bump(me, 'caught')
      log('caught', '', f); out.push({ ok: false, a, msg: f ? `被看门狗逮住了！赔给主人 ${f} D币` : '被看门狗逮住了！', caught: 1 }); return false
    }
    return true
  }
  const helped = (a: string, item: string) => {
    let pay = 0
    if (cnt(me, 'helpPaid') < MANOR.dailyHelpPaid) { bump(me, 'helpPaid'); pay = MANOR.helpCoins; coins += pay }
    xp += 2; me.xp += 2; love++; me.love++; log(a, item, 1); out.push({ ok: true, a, earn: pay || undefined })
  }
  for (const act of actions.slice(0, MANOR.visitActions)) {
    const a = String(act.a)
    if (a === 'steal') {
      const i = idx(act.i, owner.plotN), p = i >= 0 ? owner.plots[i] : null
      if (!p) { no(a, '空地'); continue }
      const v = plotView(p, i, ctx.t)
      if (!v.ripe) { no(a, '还没熟'); continue }
      if (mine(p.by)) { no(a, '这块地你偷过了'); continue }
      if (v.stealLeft <= 0) { no(a, '已经被偷光了，给主人留点吧'); continue }
      if (!tryCatch(a)) continue
      const n = Math.min(v.stealLeft, 1 + (ctx.rand() < 0.5 ? 1 : 0))
      p.s += n; mark(p.by); add(me.inv, p.c, n); xp += 1; me.xp += 1; log('steal', p.c, n); out.push({ ok: true, a, got: [[p.c, n]] })
    } else if (a === 'stealPen') {
      const i = idx(act.i, owner.pens.length), pen = i >= 0 ? owner.pens[i] : null
      if (!pen) { no(a, '参数不对'); continue }
      const v = penView(pen, ctx.t)
      if (mine(pen.by)) { no(a, '你已经顺走过了'); continue }
      if (v.stealLeft <= 0) { no(a, '没有可以拿的'); continue }
      if (!tryCatch(a)) continue
      pen.p += v.d.every * 60; pen.s++; mark(pen.by); add(me.inv, v.d.product, 1); xp += 1; me.xp += 1; log('steal', v.d.product, 1); out.push({ ok: true, a, got: [[v.d.product, 1]] })
    } else if (a === 'stealBall') {
      const k = Math.floor(Number(act.k)), b = ballsView(owner, ctx.ownerId, ctx.t).find((x) => x.k === k)
      if (!b) { no(a, '能量球不见了'); continue }
      if (mine(b.by)) { no(a, '这颗你收过了'); continue }
      if (!b.stealable) { no(a, b.ripe ? '这颗已经被收过两次了' : '还没成熟'); continue }
      if (!tryCatch(a)) continue
      const g = Math.min(b.stealable, b.have), cur = owner.balls[k] || { s: 0, by: [] }
      cur.s += g; mark(cur.by); owner.balls[k] = cur; me.energy += g; xp += 1; me.xp += 1; log('steal', 'energy', g); out.push({ ok: true, a, got: [['energy', g]] })
    } else if (a === 'stealWood') {
      const i = idx(act.i, owner.trees.length), tr = i >= 0 ? owner.trees[i] : null
      if (!tr) { no(a, '参数不对'); continue }
      const v = treeView(tr, ctx.t)
      if (mine(tr.by)) { no(a, '你已经拿过了'); continue }
      if (!v.stealLeft) { no(a, '木材不够多，给主人留着吧'); continue }
      if (!tryCatch(a)) continue
      tr.w += v.d.every * 60; tr.s++; mark(tr.by); add(me.inv, 'wood', 1); xp += 1; me.xp += 1; log('steal', 'wood', 1); out.push({ ok: true, a, got: [['wood', 1]] })
    } else if (a === 'fix') {
      const i = idx(act.i, owner.plotN), p = i >= 0 ? owner.plots[i] : null, bit = Number(act.bit)
      if (!p) { no(a, '空地'); continue }
      const v = plotView(p, i, ctx.t)
      if (v.ripe || !v.open.includes(bit)) { no(a, '现在不需要'); continue }
      p.f |= bit; helped(ISSUES.find((x) => x.bit === bit)!.id, p.c)
    } else if (a === 'feed' || a === 'clean') {
      const i = idx(act.i, owner.pens.length), pen = i >= 0 ? owner.pens[i] : null
      if (!pen) { no(a, '参数不对'); continue }
      if (!penCare(pen, a, ctx.t)) { no(a, '现在不需要'); continue }
      helped(a, pen.k)
    } else if (a === 'waterTree') {
      const i = idx(act.i, owner.trees.length), tr = i >= 0 ? owner.trees[i] : null
      if (!tr) { no(a, '参数不对'); continue }
      if (tr.wd === owner.day) { no(a, '今天已经有人浇过了'); continue }
      tr.wd = owner.day; owner.energy += MANOR.treeWater; helped('waterTree', tr.k)
    } else no(a, '未知动作')
  }
  return { out, fine, coins, xp, love }
}
