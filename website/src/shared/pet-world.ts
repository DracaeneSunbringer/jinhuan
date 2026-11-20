// 大肥鱼的小岛 v2：农场 / 牧场 / 海边 / 矿洞 / 集市。规则与数值表前后端共用；结算只在服务端（applyActions）。
// 状态是每个用户一行的紧凑 JSON，生长、产出、体力、蟹笼全部按时间戳惰性计算，不需要定时任务。
//
// 2026-11-05 降门槛：扩建 / 工具 / 动物 / 小屋 / 咖啡 / 管家约减半，种子 ×0.6（产出不变，回本更快）。
// 经济目标（详见 research/pet-world-20261104/ECONOMY.md，由 sim-economy.mjs 校验）：
//   下述为旧版全岛目标；新牧场实测见 research/valley-life-20261105/economy-report.json。
//   认真玩（每天 5–6 次上线、用完体力）中后期 ≈ 100–150 万 D币 / 天；
//   挂机（每天上线 1 次收菜收蛋收蟹笼）中后期 ≈ 20–35 万 D币 / 天；
//   新号第一天 ≈ 5–10 万。限制主要来自：体力、作物真实生长时间、动物仓位上限、每日钓鱼 / 挖矿次数、每日卖出上限。
// 防脚本：所有产出都耗体力或受真实时间约束，脚本刷得再快也拿不到更多；服务端每 2 秒最多受理一次提交（批量 40 个动作）。

export const WORLD = {
  // 体力：上限 100（小屋每级 +20），每 regen 秒回 1 点（一天约 480 点）。只来一次的人只能用到上限，常来的人能把回复都用掉。
  energyBase: 100, energyPerHouse: 20, regen: 180, dailyEarn: 1_800_000, maxActions: 40, minGap: 2,
  plotsStart: 6, plotsMax: 24, plotPrice: (n: number) => 10_000 * n, // 第 n 块（从第 7 块起）
  barnStart: 2, barnMax: 8, barnPrice: (n: number) => 80_000 * n,
  trapMax: 4, trapPrice: (n: number) => 30_000 * n, trapEvery: 180, trapCap: 4,
  houseMax: 5, housePrice: [100_000, 250_000, 600_000, 1_200_000, 2_500_000],
  // 鱼竿 / 镐子 1–4 级；洒水器 0–3 级（覆盖前 8 / 16 / 24 块地，自动浇水）
  tools: { rod: [0, 80_000, 300_000, 1_000_000], pick: [0, 80_000, 300_000, 1_000_000], spr: [150_000, 500_000, 1_500_000] } as Record<string, number[]>,
  sprCover: [0, 8, 16, 24],
  cost: { plant: 2, water: 1, harvest: 1, clear: 1, feed: 1, fish: 4, mine: 3 } as Record<string, number>,
  daily: { fish: 80, mine: 100, coffee: 3, rest: 3 } as Record<string, number>,
  xp: { harvest: 2, collect: 2, fish: 3, mine: 2 } as Record<string, number>,
  coffee: { price: 15_000, energy: 60 },
  // 2026-11-05：每天 3 次免费「免费便当」，体力直接回满（不会超过上限，满的时候不让用）
  rest: { energy: 'max' },
  // 动物：每次产出给 animalYield 个（2026-11-05 翻倍）
  animalYield: 2,
  stockBatches: 384, // 为40条社交日志、成熟池、逐批预留和管家报告预留存档空间
}
export const SEASONS = ['春', '夏', '秋', '冬']
export const WEATHERS = ['晴', '雨', '风', '雪']
// 北京时间按周换季：以 2026-11-02（周一）为春季第一周
export const worldDay = (t: number) => new Date((t + 8 * 3600) * 1000).toISOString().slice(0, 10)
const dayNum = (day: string) => Math.floor(Date.parse(day) / 86400000)
export const seasonOf = (day: string) => ((Math.floor((dayNum(day) - dayNum('2026-11-02')) / 7) % 4) + 4) % 4
export const hourOf = (t: number) => new Date((t + 8 * 3600) * 1000).getUTCHours()

// 北京时间 06:00–24:00 才计有效时间；长夜暂停饲料、成长、生产和保鲜。
export function valleyActiveClock(t: number) {
  const local = t + 8 * 3600, d = Math.floor(local / 86400)
  return d * 18 * 3600 + Math.max(0, local - d * 86400 - 6 * 3600)
}
export const valleyActiveSeconds = (from: number, to: number) => Math.max(0, valleyActiveClock(to) - valleyActiveClock(from))
export function valleyAfterActive(t: number, seconds: number) {
  if (seconds <= 0) return t
  const end = valleyActiveClock(t) + seconds, d = Math.floor(end / (18 * 3600)), r = end - d * 18 * 3600
  return d * 86400 - 8 * 3600 + (r === 0 ? 0 : 6 * 3600 + r)
}
export function valleyTime(t: number) {
  const local = t + 8 * 3600, realDay = Math.floor((local - 6 * 3600) / 86400)
  const h = (local - Math.floor(local / 86400) * 86400) / 3600
  const slot = h < 6 || h >= 18 ? 2 : h < 12 ? 0 : 1
  const day = (realDay - dayNum('2026-11-02')) * 3 + slot + 1
  const hour = slot < 2 ? (h - (slot ? 12 : 6)) * 4 : h >= 18 ? (h - 18) * 3 : 18 + h
  return { name: `第${day}谷日`, day, hour, night: h < 6, slot, season: seasonOf(worldDay(t)), realDay: worldDay(t),
    nextDay: (realDay * 86400 - 8 * 3600) + (slot === 0 ? 12 : slot === 1 ? 18 : 30) * 3600 }
}


// grow：首次成熟分钟；regrow：可重复采收作物再次成熟分钟、最多采收次数；price：基础收购价；eat：吃掉回复体力
export type Crop = { id: string; name: string; seasons: number[]; seed: number; grow: number; price: number; eat: number; regrow?: number; times?: number }
export const CROPS: Crop[] = [
  { id: 'turnip', name: '小白萝卜', seasons: [0, 3], seed: 110, grow: 30, price: 540, eat: 8 },
  { id: 'carrot', name: '胡萝卜', seasons: [0, 2], seed: 180, grow: 60, price: 960, eat: 10 },
  { id: 'wheat', name: '小麦', seasons: [1, 2], seed: 220, grow: 120, price: 1_400, eat: 6 },
  { id: 'strawberry', name: '草莓', seasons: [0], seed: 720, grow: 240, price: 3_300, eat: 14, regrow: 180, times: 4 },
  { id: 'tomato', name: '番茄', seasons: [1], seed: 540, grow: 180, price: 2_550, eat: 12, regrow: 150, times: 4 },
  { id: 'corn', name: '玉米', seasons: [1, 2], seed: 900, grow: 360, price: 4_800, eat: 14, regrow: 240, times: 3 },
  { id: 'grape', name: '葡萄', seasons: [2], seed: 1_080, grow: 360, price: 5_700, eat: 12, regrow: 240, times: 4 },
  { id: 'pumpkin', name: '南瓜', seasons: [2, 3], seed: 1_440, grow: 600, price: 9_000, eat: 20 },
  { id: 'cabbage', name: '冬白菜', seasons: [3], seed: 450, grow: 150, price: 2_350, eat: 12 },
]
// mature：有效喂养小时；feed：每次补到 24 有效小时需要的 150D 饲料份数。
// 每餐约买价2%（向上取整到150D）。every=4副产物替换第四批，每批始终两个。
// 白松露的价格经频繁/分段/每日一次收取模拟，补足猪较长成熟期和单批仓位成本。
export type AnimalProduct = { id: string; name: string; price: number; every: number; fresh: number }
export type Animal = { id: string; name: string; price: number; every: number; cap: number; product: string; productName: string; productPrice: number;
  mature: number; lifetime: number; feed: number; youngRate: number; matureRate: number; retiredRate: number; products: AnimalProduct[] }
export const ANIMALS: Animal[] = [
  { id: 'chicken', name: '小鸡', price: 12_000, every: 24, cap: 3, product: 'egg', productName: '鸡蛋', productPrice: 1_350, mature: 9, lifetime: 10, feed: 2,
    youngRate: 0.35, matureRate: 1.15, retiredRate: 0.45, products: [{ id: 'egg', name: '鸡蛋', price: 1_350, every: 1, fresh: 36 }, { id: 'feather', name: '羽毛', price: 600, every: 4, fresh: 336 }] },
  { id: 'duck', name: '鸭子', price: 24_000, every: 30, cap: 3, product: 'duckegg', productName: '鸭蛋', productPrice: 2_500, mature: 12, lifetime: 12, feed: 4,
    youngRate: 0.35, matureRate: 1.15, retiredRate: 0.45, products: [{ id: 'duckegg', name: '鸭蛋', price: 2_500, every: 1, fresh: 36 }, { id: 'duckdown', name: '鸭绒', price: 1_600, every: 4, fresh: 336 }] },
  { id: 'cow', name: '奶牛', price: 60_000, every: 48, cap: 2, product: 'milk', productName: '牛奶', productPrice: 5_850, mature: 24, lifetime: 14, feed: 8,
    youngRate: 0.35, matureRate: 1.15, retiredRate: 0.45, products: [{ id: 'milk', name: '牛奶', price: 5_850, every: 1, fresh: 24 }, { id: 'cream', name: '奶油', price: 7_800, every: 4, fresh: 24 }] },
  { id: 'sheep', name: '绵羊', price: 90_000, every: 144, cap: 1, product: 'wool', productName: '羊毛', productPrice: 19_000, mature: 30, lifetime: 8, feed: 12,
    youngRate: 0.35, matureRate: 1.15, retiredRate: 0.45, products: [{ id: 'wool', name: '羊毛', price: 19_000, every: 1, fresh: 336 }, { id: 'finewool', name: '细羊毛', price: 24_000, every: 4, fresh: 336 }] },
  { id: 'pig', name: '小猪', price: 150_000, every: 72, cap: 1, product: 'truffle', productName: '松露', productPrice: 13_500, mature: 36, lifetime: 10, feed: 20,
    youngRate: 0.35, matureRate: 1.15, retiredRate: 0.45, products: [{ id: 'truffle', name: '松露', price: 13_500, every: 1, fresh: 36 }, { id: 'white_truffle', name: '白松露', price: 42_000, every: 4, fresh: 36 }] },
]
// 鱼：季节 / 时段（北京时间小时，可跨午夜）/ 权重 / 鱼竿等级要求
export const FISH = [
  { id: 'sardine', name: '沙丁鱼', price: 1_200, w: 40, rod: 1, seasons: [0, 1, 2, 3], hours: [0, 24] },
  { id: 'carp', name: '鲤鱼', price: 2_000, w: 30, rod: 1, seasons: [0, 2, 3], hours: [0, 24] },
  { id: 'bass', name: '鲈鱼', price: 3_600, w: 22, rod: 1, seasons: [1, 2], hours: [6, 20] },
  { id: 'salmon', name: '三文鱼', price: 7_200, w: 14, rod: 2, seasons: [2, 3], hours: [0, 24] },
  { id: 'squid', name: '鱿鱼', price: 8_800, w: 12, rod: 2, seasons: [3, 0], hours: [18, 30] },
  { id: 'tuna', name: '金枪鱼', price: 14_500, w: 8, rod: 3, seasons: [1, 3], hours: [0, 24] },
  { id: 'puffer', name: '河豚', price: 21_000, w: 6, rod: 3, seasons: [1, 0], hours: [12, 20] },
  { id: 'whale', name: '迷你鲸', price: 96_000, w: 1, rod: 4, seasons: [0, 1, 2, 3], hours: [0, 24] },
]
// 矿：最低层数 / 权重
export const ORES = [
  { id: 'coal', name: '煤', price: 480, w: 40, floor: 1 }, { id: 'copper', name: '铜矿', price: 900, w: 35, floor: 1 },
  { id: 'iron', name: '铁矿', price: 1_900, w: 25, floor: 6 }, { id: 'amethyst', name: '紫水晶', price: 7_200, w: 6, floor: 8 },
  { id: 'gold', name: '金矿', price: 4_200, w: 14, floor: 12 }, { id: 'emerald', name: '祖母绿', price: 12_000, w: 4, floor: 15 },
  { id: 'ruby', name: '红宝石', price: 18_000, w: 3, floor: 20 }, { id: 'diamond', name: '钻石', price: 36_000, w: 1.2, floor: 25 },
]
export const PICK_FLOOR = [0, 8, 16, 24, 30] // 镐子等级 1–4 可达最深层
export const SHOP = { feed: { name: '饲料', price: 150 }, bait: { name: '鱼饵', price: 400 } } as Record<string, { name: string; price: number }>

// 物品基础价（集市按日浮动）
export const BASE_PRICE: Record<string, number> = Object.fromEntries([
  ...CROPS.map((c) => [c.id, c.price]), ...ANIMALS.flatMap((a) => a.products.map((p) => [p.id, p.price])), ...FISH.map((f) => [f.id, f.price]), ...ORES.map((o) => [o.id, o.price]),
])
export const ITEM_NAME: Record<string, string> = Object.fromEntries([
  ...CROPS.map((c) => [c.id, c.name]), ...ANIMALS.flatMap((a) => a.products.map((p) => [p.id, p.name])), ...FISH.map((f) => [f.id, f.name]), ...ORES.map((o) => [o.id, o.name]), ['feed', '饲料'], ['bait', '鱼饵'],
])
export const QUALITY = [1, 1.25, 1.5] // 普通 / 银星 / 金星

// ---------- 确定性随机 ----------
function worldHash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  // 末尾做一次雪崩混合：相邻日期的输入只差一位，FNV 输出高位相关性很强
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
// 天气：每天一种，全站一致。雨：作物自动浇水、鱼更好钓；风：蟹笼翻倍；雪（只在冬天）：矿洞宝石更多。
export function weatherOf(day: string) {
  const r = worldHash('weather:' + day), s = seasonOf(day)
  if (s === 3) return r < 0.35 ? 3 : r < 0.5 ? 1 : r < 0.65 ? 2 : 0
  return r < 0.3 ? 1 : r < 0.45 ? 2 : 0
}

// ---------- 集市价格：确定性随机游走 × 季节 × 偶发事件 × 供需 ----------
export function marketFactor(item: string, day: string) {
  const d = dayNum(day)
  let walk = 0
  const W = [1, 0.6, 0.35, 0.15]
  for (let k = 0; k < W.length; k++) walk += (worldHash(item + ':' + (d - k)) - 0.5) * W[k]
  const event = worldHash('event:' + item + ':' + d) < 0.04 ? (worldHash('ev2:' + item + d) < 0.5 ? 0.7 : 1.45) : 1 // 偶发暴涨暴跌
  const crop = CROPS.find((c) => c.id === item), season = seasonOf(day)
  const seasonal = crop ? (crop.seasons.includes(season) ? 0.92 : 1.3) : 1
  return Math.max(0.5, Math.min(2, Math.exp(walk * 0.7 - 0.03) * seasonal * event))
}
// 供需：前一天全站卖出量越多，今天越便宜（以「正常量」为基准）。
export const supplyFactor = (soldYesterday: number, normal: number) => Math.max(0.6, Math.min(1.12, 1.12 - 0.5 * (soldYesterday / Math.max(1, normal))))
export const NORMAL_VOLUME = 400
export function priceOf(item: string, day: string, soldYesterday = 0) {
  const base = BASE_PRICE[item]
  if (!base) return 0
  return Math.max(1, Math.round(base * marketFactor(item, day) * supplyFactor(soldYesterday, NORMAL_VOLUME)))
}

// ---------- 每日目标（公告栏）：每天全站同一组 3 个，完成一个领 6000，全部完成再领 12000 ----------
export const GOALS = [
  { id: 'plant', name: '播种', n: 10 }, { id: 'water', name: '浇水', n: 8 }, { id: 'harvest', name: '收获作物', n: 8 },
  { id: 'collect', name: '收动物产物', n: 3 }, { id: 'fish', name: '钓鱼', n: 6 }, { id: 'mine', name: '敲矿石', n: 15 }, { id: 'sold', name: '卖货收入', n: 30_000 },
]
export const GOAL_REWARD = 6_000, GOAL_BONUS = 12_000
export const WELCOME_GIFT = 1_000_000 // 第一次进鱼鱼谷的新人礼（每个账号一次，不计入每日卖出上限）
export function dailyGoals(day: string) {
  const pool = GOALS.map((g, i) => ({ g, r: worldHash('goal:' + day + ':' + i) })).sort((a, b) => a.r - b.r)
  return pool.slice(0, 3).map((x) => x.g)
}

// ---------- 状态 ----------
// 地块：作物、本轮开始时间、本轮浇水次数、提速累计秒、已采收次数
export type WorldSocialRound = { round: string; taken: Record<string, number>; batches?: Record<string, { id: string; n: number }> }
export type Plot = { c: string; t: number; w: number; g: number; h: number; social?: WorldSocialRound } | null
// 动物：种类、上次喂食、产出计时起点、心情
export type AnimalBatch = { bid: string; id: string; n: number; at: number; expires: number }
export type AnimalLife = { at: number; grown: number; used: number; progress: number; food: number; batches: AnimalBatch[] }
export type Pen = { k: string; f: number; p: number; m: number; life?: AnimalLife; cashBasis?: number; creditBasis?: number; social?: WorldSocialRound }
// 紧凑批次：[品质, 数量, 首次入库时间, 固定到期时间, 收获季节]。
export type StockBatch = [number, number, number, number, number]
export type WorldFreshness = { v: 1; migratedAt: number; batches: Record<string, StockBatch[]>; expired: { at: number; items: Record<string, number> } }
// 蟹笼：计时起点
export type Trap = { p: number }
export type WorldState = {
  v: 2; en: number; enT: number; enDay: string; plotN: number; plots: Plot[]; barnN: number; barn: Pen[]; traps: Trap[]
  inv: Record<string, number[]>; tools: { rod: number; pick: number; spr: number; house: number }; mine: { max: number }
  earn: { day: string; amt: number }; cnt: Record<string, number>; log: number
  seen?: string[] // 图鉴：第一次得到过的物品
  gift?: number // 新人礼领取时间（每个账号一次）
  auto?: AutoCfg & { t: number; hired?: number } // 挂机管家：策略 + 上一轮巡视时间 + 雇佣时间
  autoLog?: AutoLog // 最近一次结算的管家报告
  freshness?: WorldFreshness // 可选扩展，保留 v2 / inv，兼容旧存档
  socialBudget?: { members: string[]; cap: number; spent: number } // 社交成熟池，采收不可重置其已用额度
  constructionCredit?: number // 庄园迁入建设额度，不是钱包余额，不能直接卖动物提现
}
export function newWorld(t: number): WorldState {
  const s: WorldState = { v: 2, en: WORLD.energyBase, enT: t, enDay: worldDay(t), plotN: WORLD.plotsStart, plots: Array(WORLD.plotsStart).fill(null), barnN: WORLD.barnStart, barn: [], traps: [],
    inv: { turnip: [4, 0, 0], feed: [6, 0, 0] }, tools: { rod: 1, pick: 1, spr: 0, house: 0 }, mine: { max: 1 }, earn: { day: worldDay(t), amt: 0 }, cnt: {}, log: 0 }
  stockInit(s, t, false)
  return s
}
export const energyMax = (s: WorldState) => WORLD.energyBase + WORLD.energyPerHouse * s.tools.house
// 体力按时间回复（满了不再累计）；每天北京时间 0 点每日计数清零
export function refresh(s: WorldState, t: number) {
  // route 先 refresh(now) 再补算管家，不能提前消灭历史产物或重置每日计数。
  if (autoDue(s, t)) return s
  return refreshNow(s, t)
}
function refreshNow(s: WorldState, t: number) {
  stockExpire(s, t)
  for (const pen of s.barn) if (pen.life) settleAnimal(pen, t, (id, n) => recordExpired(s, id, n, t))
  const day = worldDay(t), max = energyMax(s)
  if (s.en >= max) s.enT = Math.max(s.enT, t)
  else { const n = Math.floor((t - s.enT) / WORLD.regen); if (n > 0) { s.en = Math.min(max, s.en + n); s.enT = s.en >= max ? t : s.enT + n * WORLD.regen } }
  if (s.enDay !== day) { s.enDay = day; s.cnt = {} }
  if (s.earn.day !== day) s.earn = { day, amt: 0 }
  return s
}
export const sprinkled = (s: WorldState, i: number) => i < WORLD.sprCover[s.tools.spr]
// 作物生长：stage 0–3（3 = 成熟），-1 = 反季枯萎。浇水（或洒水器、雨天）每阶段让剩余时间缩短 25%。
export function cropStage(p: NonNullable<Plot>, t: number, auto = false) {
  const crop = CROPS.find((c) => c.id === p.c)!
  if (!crop.seasons.includes(seasonOf(worldDay(t)))) return { stage: -1, left: 0, total: 1, crop }
  const base = (p.h && crop.regrow ? crop.regrow : crop.grow) * 60
  const total = base * (auto ? 0.6 : 1) - p.g, el = t - p.t
  if (el >= total) {
    const ripeAt = p.t + total, age = valleyActiveSeconds(ripeAt, t)
    const stale = age >= 24 * 3600, spoiled = age >= 24 * 3600 + stockShelf(crop.id, seasonOf(worldDay(ripeAt)))
    return { stage: spoiled ? -1 : 3, left: 0, total, crop, stale, spoiled, ripeAt }
  }
  return { stage: Math.min(2, Math.floor((el / total) * 3)), left: total - el, total, crop }
}
// 旧动物在真正写结算时迁移，公开查询使用副本，不给 GET 续期。
function animalInit(a: Pen, t: number, graceAt = t) {
  if (a.life) return
  const def = ANIMALS.find((x) => x.id === a.k)!
  const n = Math.max(0, Math.min(def.cap, Math.floor((Math.min(t, a.f + 86400) - a.p) / (def.every * 60))))
  a.life = { at: t, grown: def.mature * 3600, used: 0, progress: 0, food: Math.max(0, a.f + 86400 - t),
    batches: Array.from({ length: n }, (_, i) => ({ bid: `legacy:${a.p}:${i}`, id: def.product, n: WORLD.animalYield, at: t,
      expires: stockShelf(def.product, seasonOf(worldDay(t))) ? Math.max(graceAt + 3 * 86400, valleyAfterActive(t, stockShelf(def.product, seasonOf(worldDay(t))))) : 0 })) }
}
function settleAnimal(a: Pen, t: number, expired: (id: string, n: number) => void = () => {}) {
  const l = a.life!, def = ANIMALS.find((x) => x.id === a.k)!
  if (t < l.at) return
  const clear = (at: number) => { l.batches = l.batches.filter((b) => { if (!b.expires || b.expires > at) return true; expired(b.id, Math.max(0, b.n - (a.social?.batches?.[b.bid]?.n || 0))); return false }) }
  const fed = Math.min(l.food, valleyActiveSeconds(l.at, t)), grow = Math.min(def.mature * 3600 - l.grown, fed)
  let cursor = valleyAfterActive(l.at, grow)
  const fedUntil = valleyAfterActive(l.at, fed)
  l.grown += grow; l.food -= fed
  clear(cursor)
  // 最多处理终身产次那么多个事件。窝满时停止计时，空出位置后才开始下一批。
  while (l.grown >= def.mature * 3600 && l.used < def.lifetime && cursor < fedUntil) {
    if (l.batches.length >= def.cap) {
      l.progress = 0
      const expires = Math.min(...l.batches.map((b) => b.expires || Infinity))
      if (expires > fedUntil) break
      cursor = Math.max(cursor, expires); clear(cursor)
    }
    const need = def.every * 60 - l.progress, available = valleyActiveSeconds(cursor, fedUntil)
    if (available < need) { l.progress += available; break }
    cursor = valleyAfterActive(cursor, need); clear(cursor)
    l.used++; l.progress = 0
    const product = def.products.find((p) => p.every > 1 && l.used % p.every === 0) || def.products[0]
    l.batches.push({ bid: `${a.k}:${l.used}:${cursor}`, id: product.id, n: WORLD.animalYield, at: cursor,
      expires: product.fresh ? valleyAfterActive(cursor, product.fresh * 3600) : 0 })
  }
  if (l.batches.length >= def.cap || l.used >= def.lifetime) l.progress = 0
  clear(t); l.at = t; a.p = t
}
function animalView(a: Pen, t: number) {
  const copy: Pen = { ...a, life: a.life ? { ...a.life, batches: a.life.batches.map((b) => ({ ...b })) } : undefined }
  animalInit(copy, t); settleAnimal(copy, t)
  return copy.life!
}
function animalValue(a: Pen, def: Animal, l: AnimalLife) {
  const basis = (a.cashBasis || 0) + (a.creditBasis || 0)
  const cashRatio = a.cashBasis === undefined ? 1 : basis > 0 ? Math.max(0, Math.min(1, a.cashBasis / basis)) : 0
  const rate = l.grown < def.mature * 3600 ? def.youngRate : def.retiredRate + (def.matureRate - def.retiredRate) * (def.lifetime - l.used) / def.lifetime
  return Math.round(def.price * rate * cashRatio)
}
export function animalSaleValue(a: Pen, t: number) {
  const def = ANIMALS.find((x) => x.id === a.k)!, l = animalView(a, t)
  return animalValue(a, def, l)
}
export function animalReady(a: Pen, t: number) {
  const def = ANIMALS.find((x) => x.id === a.k)!, l = animalView(a, t)
  const stage = l.grown < def.mature * 3600 ? 'young' : l.used >= def.lifetime ? 'retired' : 'mature'
  const matureActiveLeft = Math.max(0, def.mature * 3600 - l.grown), activeLeft = matureActiveLeft + def.every * 60 - l.progress
  return { def, fed: l.food > 0, n: l.batches.length, ready: l.batches.length > 0,
    left: stage === 'retired' || l.batches.length >= def.cap ? 0 : valleyAfterActive(t, activeLeft) - t,
    stage, matureLeft: valleyAfterActive(t, matureActiveLeft) - t, matureActiveLeft, remaining: def.lifetime - l.used,
    sellPrice: animalValue(a, def, l),
    feedLeft: l.food, pendingMigration: !a.life, batches: l.batches }
}
export function trapReady(tr: Trap, t: number, windy = false) {
  const n = Math.min(WORLD.trapCap, Math.floor((t - tr.p) / (WORLD.trapEvery * 60)) * (windy ? 2 : 1))
  return { n: Math.min(WORLD.trapCap, n), left: Math.max(0, WORLD.trapEvery * 60 - ((t - tr.p) % (WORLD.trapEvery * 60))) }
}
// 现实有效秒：长夜和换季不改变到期日。纺织畜产仓储14有效日；饲料/鱼饵/矿不腐坏。
export function stockShelf(id: string, season: number) {
  const crop = CROPS.find((c) => c.id === id)
  if (crop) {
    const days = ['wheat', 'pumpkin'].includes(id) ? [5, 4, 5, 7] : ['strawberry', 'grape'].includes(id) ? [2, 1.5, 2, 3] : [3, 2, 3, 5]
    return days[season] * 86400
  }
  const product = ANIMALS.flatMap((a) => a.products).find((p) => p.id === id)
  return product ? product.fresh * 3600 : FISH.some((f) => f.id === id) ? 24 * 3600 : 0
}
function stockInit(s: WorldState, t: number, legacy = true, graceAt = t) {
  if (s.freshness) return
  s.freshness = { v: 1, migratedAt: graceAt, batches: {}, expired: { at: 0, items: {} } }
  const season = seasonOf(worldDay(t))
  for (const [id, qs] of Object.entries(s.inv)) {
    const shelf = stockShelf(id, season)
    if (!shelf) continue
    const expires = Math.max(legacy ? graceAt + 3 * 86400 : 0, valleyAfterActive(t, shelf))
    s.freshness.batches[id] = qs.flatMap((n, q) => n > 0 ? [[q, n, t, expires, season] as StockBatch] : [])
  }
}
function recordExpired(s: WorldState, id: string, n: number, t: number) {
  if (!s.freshness || !n) return
  const e = s.freshness.expired
  e.at = Math.max(e.at, t); e.items[id] = (e.items[id] || 0) + n
}
// 库存批次有全局上限。只合并同物品/品质的相邻到期批次，数量守恒且不延长保鲜。
// 迁移宽限两侧不能合并，保证旧库存不少于3现实日；窝内bid及社交预留不参与压缩。
function stockCompact(s: WorldState) {
  const fresh = s.freshness
  if (!fresh) return
  let count = Object.values(fresh.batches).reduce((n, bs) => n + bs.length, 0)
  const grace = fresh.migratedAt + 3 * 86400
  while (count > WORLD.stockBatches) {
    let best: { bs: StockBatch[]; a: StockBatch; b: StockBatch; gap: number } | undefined
    for (const bs of Object.values(fresh.batches)) {
      const groups: StockBatch[][] = Array.from({ length: 6 }, () => [])
      for (const b of bs) groups[b[0] + ((!b[3] || b[3] >= grace) ? 3 : 0)].push(b)
      for (const group of groups) {
        group.sort((a, b) => (a[3] || Infinity) - (b[3] || Infinity) || a[2] - b[2])
        for (let i = 1; i < group.length; i++) {
          const a = group[i - 1], b = group[i], gap = a[3] === b[3] ? 0 : (b[3] || Infinity) - (a[3] || Infinity)
          if (!best || gap < best.gap) best = { bs, a, b, gap }
        }
      }
    }
    // 目前27种保鲜物品×3品质×2宽限分组最多162个不可合并组，小于384。
    if (!best) break
    best.a[1] += best.b[1]
    best.a[2] = Math.min(best.a[2], best.b[2])
    // a已经是较早到期者，其expires/season不变。
    best.bs.splice(best.bs.indexOf(best.b), 1)
    count--
  }
}
function stockExpire(s: WorldState, t: number) {
  if (!s.freshness) return
  for (const [id, bs] of Object.entries(s.freshness.batches)) {
    const kept = bs.filter((b) => {
      if (!b[3] || b[3] > t) return true
      const qs = s.inv[id], n = Math.min(b[1], qs?.[b[0]] || 0)
      if (qs) { qs[b[0]] -= n; if (!qs.some(Boolean)) delete s.inv[id] }
      recordExpired(s, id, n, t); return false
    })
    if (kept.length) s.freshness.batches[id] = kept
    else delete s.freshness.batches[id]
  }
  stockCompact(s)
}
function worldLifeInit(s: WorldState, t: number, graceAt = t) {
  stockInit(s, t, true, graceAt)
  for (const pen of s.barn) animalInit(pen, t, graceAt)
}
// 仅服务端规则/社交/迁移调用；Action 不接受自报批次或到期时间。
// source 可搬运原批次，不能将旧食品洗成新鲜；五参数默认用于新产出。
export function worldStockAdd(s: WorldState, id: string, q: number, n: number, t: number, source?: { at: number; expires: number; season?: number }): boolean {
  if (!(Object.hasOwn(ITEM_NAME, id) && Number.isInteger(q) && q >= 0 && q <= 2 && Number.isSafeInteger(n) && n > 0 && Number.isFinite(t))) return false
  stockInit(s, t); stockExpire(s, t)
  const qs = Object.hasOwn(s.inv, id) ? s.inv[id] : [0, 0, 0]
  if (!Number.isSafeInteger(qs[q] + n)) return false
  const season = source?.season ?? seasonOf(worldDay(t)), shelf = stockShelf(id, season)
  if (shelf) {
    const at = source?.at ?? t, expires = source?.expires ?? valleyAfterActive(t, shelf)
    if (!Number.isFinite(at) || !Number.isFinite(expires) || expires <= t) return false
    const bs = s.freshness!.batches[id] ||= []
    // 通常搬运批次精确保留at/expires；仅全局超过384条时才保守压缩到较早到期。
    // 纺织品48h、作物6h、食品1h窗口限制新收获 JSON 体积。
    const bucket = (shelf >= 14 * 86400 ? 48 : CROPS.some((c) => c.id === id) ? 6 : 1) * 3600
    const b = bs.find((b) => b[0] === q && b[4] === season && (!source || (b[2] === at && b[3] === expires)) && Math.floor(b[2] / bucket) === Math.floor(at / bucket) && Math.abs(b[3] - expires) < bucket)
    if (b) { b[1] += n; b[2] = Math.min(b[2], at); b[3] = Math.min(b[3], expires) }
    else bs.push([q, n, at, expires, season])
  }
  s.inv[id] = qs; qs[q] += n
  stockCompact(s)
  return true
}
export function worldStockTake(s: WorldState, id: string, q: number, n: number, t: number): boolean {
  if (!(Object.hasOwn(ITEM_NAME, id) && Number.isInteger(q) && q >= 0 && q <= 2 && Number.isSafeInteger(n) && n > 0 && Number.isFinite(t))) return false
  stockInit(s, t); stockExpire(s, t)
  const qs = Object.hasOwn(s.inv, id) ? s.inv[id] : null
  if (!qs || qs[q] < n) return false
  let left = n
  const bs = s.freshness!.batches[id]
  if (bs) {
    bs.sort((a, b) => (a[3] || Infinity) - (b[3] || Infinity) || a[2] - b[2])
    for (const b of bs) if (b[0] === q) { const used = Math.min(left, b[1]); b[1] -= used; left -= used }
    s.freshness!.batches[id] = bs.filter((b) => b[1] > 0)
    if (!s.freshness!.batches[id].length) delete s.freshness!.batches[id]
  }
  qs[q] -= n; if (!qs.some(Boolean)) delete s.inv[id]
  return true
}
export function freshnessSummary(s: WorldState, t: number) {
  const batches = Object.entries(s.freshness?.batches || {}).flatMap(([id, bs]) => bs.map((b) => ({ id, name: ITEM_NAME[id], q: b[0], n: b[1], at: b[2], expires: b[3], season: b[4], left: Math.max(0, b[3] - t) }))).sort((a, b) => a.expires - b.expires)
  return { pendingMigration: !s.freshness, migratedAt: s.freshness?.migratedAt, batches,
    soon: batches.filter((b) => b.expires > t && valleyActiveSeconds(t, b.expires) <= 24 * 3600), expired: s.freshness?.expired || { at: 0, items: {} } }
}
const pickWeighted = <T,>(pool: T[], w: number[], r: number) => { let x = r * w.reduce((a, b) => a + b, 0); for (let k = 0; k < pool.length; k++) { x -= w[k]; if (x < 0) return pool[k] } return pool[pool.length - 1] }
export function fishPool(s: WorldState, t: number, maxRod = s.tools.rod) {
  const season = seasonOf(worldDay(t)), h = hourOf(t)
  return FISH.filter((f) => f.rod <= maxRod && f.seasons.includes(season) && ((h >= f.hours[0] && h < f.hours[1]) || (h + 24 >= f.hours[0] && h + 24 < f.hours[1])))
}

// ---------- 动作结算 ----------
export type Action = { a: string; [k: string]: unknown }
export type WorldCtx = { t: number; day: string; rand: () => number; prices: Record<string, number>; coins: number; auto?: boolean }
export type Outcome = { ok: boolean; a: string; msg?: string; got?: { id: string; q: number; n: number; new?: 1 }[]; spend?: number; credit?: number; earn?: number; xp?: number }
// 逐个执行；单个动作失败不影响其他动作（返回原因）。spend / earn 由调用方合并成一次扣款 / 入账。
export function applyActions(s: WorldState, actions: Action[], ctx: WorldCtx) {
  worldLifeInit(s, ctx.t)
  refreshNow(s, ctx.t)
  const out: Outcome[] = []
  let spend = 0, earn = 0, xp = 0
  const weather = weatherOf(ctx.day)
  const coinsLeft = () => ctx.coins - spend + earn
  const buildPay = (price: number) => {
    const available = Number.isSafeInteger(s.constructionCredit) ? Math.max(0, s.constructionCredit!) : 0
    const credit = Math.min(price, available), cash = price - credit
    if (coinsLeft() < cash) return null
    if (credit) s.constructionCredit = available - credit
    spend += cash
    return { cash, credit }
  }
  const fail = (a: string, msg: string) => out.push({ ok: false, a, msg })
  const count = (k: string) => (s.cnt[k] || 0)
  for (const act of actions.slice(0, WORLD.maxActions)) {
    const a = String(act.a), i = Math.floor(Number(act.i))
    // 管家代劳钓鱼 / 挖矿每次多花 AUTO.surcharge 点体力（亲手玩更划算）
    const cost = (WORLD.cost[a] ?? 0) + (ctx.auto && (a === 'fish' || a === 'mine') ? AUTO.surcharge : 0)
    if (cost && s.en < cost) { fail(a, '体力不足'); continue }
    if (a === 'plant') {
      const crop = CROPS.find((c) => c.id === act.c)
      if (!crop || !(i >= 0 && i < s.plotN) || s.plots[i]) { fail(a, '这块地不能种'); continue }
      if (!crop.seasons.includes(seasonOf(ctx.day))) { fail(a, `${crop.name}不是这个季节的作物`); continue }
      if (coinsLeft() < crop.seed) { fail(a, 'D币不足'); continue }
      spend += crop.seed; s.en -= cost
      s.plots[i] = { c: crop.id, t: ctx.t, w: 0, g: 0, h: 0 }; s.cnt.plant = count('plant') + 1
      out.push({ ok: true, a, spend: crop.seed })
    } else if (a === 'water') {
      const p = s.plots[i]
      if (!p) { fail(a, '没有作物'); continue }
      if (sprinkled(s, i) || weather === 1) { fail(a, '已经自动浇过了'); continue }
      const st = cropStage(p, ctx.t)
      if (st.stage < 0 || st.stage >= 3 || p.w > st.stage) { fail(a, '这阶段已经浇过了'); continue }
      s.en -= cost; p.w++; s.cnt.water = count('water') + 1
      p.g += Math.floor(st.left * 0.25)
      out.push({ ok: true, a })
    } else if (a === 'harvest') {
      const p = s.plots[i]
      const auto = !!p && (sprinkled(s, i) || weather === 1)
      const st = p && cropStage(p, ctx.t, auto)
      if (!p || !st || st.stage < 3) { fail(a, st?.spoiled ? '作物放置太久，已经失效，请清理' : st?.stage === -1 ? '过季枯萎了，清理掉吧' : '还没成熟'); continue }
      const w = auto ? 3 : p.w
      const roll = ctx.rand(), gold = 0.05 + 0.1 * w, silver = 0.2 + 0.08 * w
      // 管家手艺一般：收获只有普通品质、不会多收一个
      const q = Math.max(0, (ctx.auto ? 0 : roll < gold ? 2 : roll < gold + silver ? 1 : 0) - (st.stale ? 1 : 0))
      const n = ctx.auto ? 1 : 1 + (ctx.rand() < 0.2 + 0.08 * w ? 1 : 0)
      const kept = Math.max(0, n - Math.max(0, p.social?.taken[p.c] || 0))
      delete p.social
      if (kept) worldStockAdd(s, p.c, q, kept, ctx.t)
      s.en -= cost; xp += WORLD.xp.harvest; s.cnt.harvest = count('harvest') + 1
      const crop = st.crop
      // 可重复采收的作物留在地里重新长，次数用完才清空
      if (crop.regrow && p.h + 1 < (crop.times || 1)) s.plots[i] = { c: p.c, t: ctx.t, w: 0, g: 0, h: p.h + 1 }
      else s.plots[i] = null
      out.push({ ok: true, a, got: kept ? [{ id: p.c, q, n: kept }] : [] })
    } else if (a === 'clear') {
      if (!s.plots[i]) { fail(a, '空地'); continue }
      s.plots[i] = null; s.en -= cost; out.push({ ok: true, a })
    } else if (a === 'buyAnimal') {
      const def = ANIMALS.find((x) => x.id === act.k)
      if (!def || s.barn.length >= s.barnN) { fail(a, '畜栏已满'); continue }
      const pay = buildPay(def.price)
      if (!pay) { fail(a, 'D币不足'); continue }
      s.barn.push({ k: def.id, f: ctx.t, p: ctx.t, m: 60, cashBasis: pay.cash, creditBasis: pay.credit,
        life: { at: ctx.t, grown: 0, used: 0, progress: 0, food: 24 * 3600, batches: [] } })
      out.push({ ok: true, a, spend: pay.cash, credit: pay.credit })
    } else if (a === 'sellAnimal') {
      const pen = s.barn[i]
      if (!pen) { fail(a, '没有这只动物'); continue }
      const st = animalReady(pen, ctx.t), value = st.sellPrice
      if (st.ready) { fail(a, '先收取窝里的产物再出售'); continue }
      if (s.earn.amt + earn + value > WORLD.dailyEarn) { fail(a, '今天收入已达上限'); continue }
      s.barn.splice(i, 1); earn += value; out.push({ ok: true, a, earn: value })
    } else if (a === 'feed') {
      const pen = s.barn[i]
      if (!pen) { fail(a, '没有这只动物'); continue }
      const st = animalReady(pen, ctx.t)
      if (st.stage === 'retired') { fail(a, '已经退休，不需要再喂食'); continue }
      if (st.feedLeft > 16 * 3600) { fail(a, '还饱着呢'); continue }
      if (!worldStockTake(s, 'feed', 0, st.def.feed, ctx.t)) { fail(a, `需要 ${st.def.feed} 份饲料`); continue }
      s.en -= cost; pen.f = ctx.t; pen.life!.food = 24 * 3600; pen.m = Math.min(100, pen.m + 8); out.push({ ok: true, a })
    } else if (a === 'pet') {
      const pen = s.barn[i]
      if (!pen) { fail(a, '没有这只动物'); continue }
      if (count('pet' + i) >= 1) { fail(a, '今天已经摸过了'); continue }
      s.cnt['pet' + i] = 1; pen.m = Math.min(100, pen.m + 6); out.push({ ok: true, a })
    } else if (a === 'collect') {
      const pen = s.barn[i]
      if (!pen) { fail(a, '没有这只动物'); continue }
      const st = animalReady(pen, ctx.t)
      if (!st.ready) { fail(a, st.stage === 'retired' ? '已经退休' : !st.fed ? '饿了，先喂食' : st.stage === 'young' ? '还在成长' : '还没产出'); continue }
      const got: NonNullable<Outcome['got']> = []
      for (const batch of pen.life!.batches) {
        // 只扣对应bid，不能把过期旧批次的社交预留扣到新一批上。
        const n = Math.max(0, batch.n - Math.max(0, pen.social?.batches?.[batch.bid]?.n || 0))
        if (!n) continue
        const q = ctx.auto ? 0 : ctx.rand() < pen.m / 250 ? 2 : ctx.rand() < pen.m / 120 ? 1 : 0
        worldStockAdd(s, batch.id, q, n, ctx.t, { at: batch.at, expires: batch.expires })
        got.push({ id: batch.id, q, n })
      }
      pen.life!.batches = []
      delete pen.social
      pen.m = Math.max(20, pen.m - 2); xp += WORLD.xp.collect; s.cnt.collect = count('collect') + 1
      out.push({ ok: true, a, got })
    } else if (a === 'buyTrap') {
      if (s.traps.length >= WORLD.trapMax) { fail(a, '蟹笼已经放满'); continue }
      const price = WORLD.trapPrice(s.traps.length + 1)
      if (coinsLeft() < price) { fail(a, 'D币不足'); continue }
      spend += price; s.traps.push({ p: ctx.t }); out.push({ ok: true, a, spend: price })
    } else if (a === 'trap') {
      const tr = s.traps[i]
      if (!tr) { fail(a, '没有这个蟹笼'); continue }
      const st = trapReady(tr, ctx.t, weather === 2)
      if (!st.n) { fail(a, '笼子里还是空的'); continue }
      const pool = fishPool(s, ctx.t, 1), got: NonNullable<Outcome['got']> = []
      for (let k = 0; k < st.n; k++) { const f = pickWeighted(pool, pool.map((x) => x.w), ctx.rand()); worldStockAdd(s, f.id, 0, 1, ctx.t); got.push({ id: f.id, q: 0, n: 1 }) }
      tr.p = st.n >= WORLD.trapCap ? ctx.t : tr.p + Math.ceil(st.n / (weather === 2 ? 2 : 1)) * WORLD.trapEvery * 60
      out.push({ ok: true, a, got })
    } else if (a === 'fish') {
      if (count('fish') >= WORLD.daily.fish) { fail(a, `今天已经钓了 ${WORLD.daily.fish} 竿，鱼都躲起来了`); continue }
      const useBait = !!act.bait && worldStockTake(s, 'bait', 0, 1, ctx.t)
      s.en -= cost; xp += WORLD.xp.fish; s.cnt.fish = count('fish') + 1
      const pool = fishPool(s, ctx.t)
      // 没咬钩的概率：鱼竿越好越低；雨天、鱼饵更好钓；鱼饵和雨天让贵鱼权重变高
      const miss = Math.max(0.05, 0.22 - 0.04 * s.tools.rod - (useBait ? 0.08 : 0) - (weather === 1 ? 0.05 : 0))
      if (ctx.rand() < miss) { out.push({ ok: true, a, got: [], msg: '鱼跑掉了' }); continue }
      const boost = (useBait ? 2 : 1) * (weather === 1 ? 1.5 : 1)
      const pick = pickWeighted(pool, pool.map((f) => f.w * (f.price >= 9_000 ? boost : 1)), ctx.rand())
      const q = ctx.auto ? 0 : ctx.rand() < 0.08 + 0.05 * s.tools.rod ? 2 : ctx.rand() < 0.28 ? 1 : 0
      worldStockAdd(s, pick.id, q, 1, ctx.t); out.push({ ok: true, a, got: [{ id: pick.id, q, n: 1 }] })
    } else if (a === 'mine') {
      if (count('mine') >= WORLD.daily.mine) { fail(a, `今天已经挖了 ${WORLD.daily.mine} 下，矿洞要休息`); continue }
      const floor = Math.max(1, Math.min(Number(act.f) || 1, s.mine.max, PICK_FLOOR[s.tools.pick]))
      s.en -= cost; xp += WORLD.xp.mine; s.cnt.mine = count('mine') + 1
      const pool = ORES.filter((o) => o.floor <= floor)
      const got: NonNullable<Outcome['got']> = []
      const hits = 1 + (ctx.rand() < 0.25 + 0.05 * s.tools.pick ? 1 : 0)
      for (let k = 0; k < hits; k++) {
        const pick = pickWeighted(pool, pool.map((o) => o.w * (o.price >= 12_000 && weather === 3 ? 1.6 : 1) * (1 + (floor - o.floor) / 40)), ctx.rand())
        worldStockAdd(s, pick.id, 0, 1, ctx.t); got.push({ id: pick.id, q: 0, n: 1 })
      }
      // 找到下一层的梯子
      let msg
      if (floor === s.mine.max && s.mine.max < PICK_FLOOR[s.tools.pick] && ctx.rand() < 0.25) { s.mine.max++; msg = `发现通往第 ${s.mine.max} 层的梯子！` }
      out.push({ ok: true, a, got, msg })
    } else if (a === 'eat') {
      const crop = CROPS.find((c) => c.id === act.id), q = Math.floor(Number(act.q)) || 0
      if (s.en >= energyMax(s)) { fail(a, '体力是满的'); continue }
      if (!crop || !(q >= 0 && q <= 2) || !worldStockTake(s, crop.id, q, 1, ctx.t)) { fail(a, '没有这个'); continue }
      s.en = Math.min(energyMax(s), s.en + Math.round(crop.eat * QUALITY[q])); out.push({ ok: true, a })
    } else if (a === 'rest') {
      if (count('rest') >= WORLD.daily.rest) { fail(a, `今天已经吃过 ${WORLD.daily.rest} 次了`); continue }
      if (s.en >= energyMax(s)) { fail(a, '体力是满的'); continue }
      s.cnt.rest = count('rest') + 1; s.en = energyMax(s); s.enT = ctx.t
      out.push({ ok: true, a })
    } else if (a === 'coffee') {
      if (count('coffee') >= WORLD.daily.coffee) { fail(a, `每天最多喝 ${WORLD.daily.coffee} 杯`); continue }
      if (coinsLeft() < WORLD.coffee.price) { fail(a, 'D币不足'); continue }
      spend += WORLD.coffee.price; s.cnt.coffee = count('coffee') + 1; s.en += WORLD.coffee.energy
      out.push({ ok: true, a, spend: WORLD.coffee.price })
    } else if (a === 'buy') {
      const item = Object.hasOwn(SHOP, String(act.id)) ? SHOP[String(act.id)] : null, n = Math.max(1, Math.min(99, Math.floor(Number(act.n)) || 1))
      if (!item) { fail(a, '没有这个商品'); continue }
      if (coinsLeft() < item.price * n) { fail(a, 'D币不足'); continue }
      spend += item.price * n; worldStockAdd(s, String(act.id), 0, n, ctx.t); out.push({ ok: true, a, spend: item.price * n })
    } else if (a === 'sell') {
      const id = String(act.id), q = Math.floor(Number(act.q)) || 0, n = Math.max(1, Math.min(999, Math.floor(Number(act.n)) || 1))
      const price = Object.hasOwn(BASE_PRICE, id) && Object.hasOwn(ctx.prices, id) ? Number(ctx.prices[id]) : 0
      if (!(price > 0) || !(q >= 0 && q <= 2) || !Object.hasOwn(s.inv, id) || !(s.inv[id][q] >= n)) { fail(a, '库存不足'); continue }
      const value = Math.round(Math.round(price * QUALITY[q]) * n * (ctx.auto ? 1 - AUTO.fee : 1)) // 管家代卖抽成
      if (s.earn.amt + earn + value > WORLD.dailyEarn) { fail(a, `今天卖出所得已达上限 ${WORLD.dailyEarn.toLocaleString()} D币，明天再卖`); continue }
      worldStockTake(s, id, q, n, ctx.t); earn += value; s.cnt.sold = count('sold') + value; out.push({ ok: true, a, earn: value })
    } else if (a === 'expand') {
      const kind = act.k
      if (kind === 'plot') {
        if (s.plotN >= WORLD.plotsMax) { fail(a, '已经最大'); continue }
        const price = WORLD.plotPrice(s.plotN + 1)
        const pay = buildPay(price)
        if (!pay) { fail(a, 'D币不足'); continue }
        s.plotN++; s.plots.push(null); out.push({ ok: true, a, spend: pay.cash, credit: pay.credit })
      } else if (kind === 'barn') {
        if (s.barnN >= WORLD.barnMax) { fail(a, '已经最大'); continue }
        const price = WORLD.barnPrice(s.barnN + 1)
        const pay = buildPay(price)
        if (!pay) { fail(a, 'D币不足'); continue }
        s.barnN++; out.push({ ok: true, a, spend: pay.cash, credit: pay.credit })
      } else fail(a, '无效')
    } else if (a === 'upgrade') {
      const tool = String(act.k)
      const price = upgradePrice(s, tool)
      if (price == null) { fail(a, '已经满级'); continue }
      const pay = buildPay(price)
      if (!pay) { fail(a, 'D币不足'); continue }
      if (tool === 'house') { s.tools.house++; s.en += WORLD.energyPerHouse } else (s.tools as Record<string, number>)[tool]++
      out.push({ ok: true, a, spend: pay.cash, credit: pay.credit })
    } else if (a === 'goal') {
      const k = Math.floor(Number(act.k)), goals = dailyGoals(ctx.day)
      if (!(k >= 0 && k <= 3) || count('goal' + k)) { fail(a, '已经领过了'); continue }
      if (k < 3 ? count(goals[k].id) < goals[k].n : goals.some((g, j) => !count('goal' + j))) { fail(a, '还没完成'); continue }
      const value = k < 3 ? GOAL_REWARD : GOAL_BONUS
      if (s.earn.amt + earn + value > WORLD.dailyEarn) { fail(a, '今天收入已达上限'); continue }
      s.cnt['goal' + k] = 1; earn += value; out.push({ ok: true, a, earn: value })
    } else fail(a, '未知操作')
  }
  // 图鉴：第一次得到的物品打上 new 标记
  const seen = (s.seen ||= [])
  for (const o of out) for (const g of o.got || []) if (!seen.includes(g.id)) { seen.push(g.id); g.new = 1 }
  s.earn.amt += earn
  s.log++
  return { out, spend, earn, xp }
}
// 下一级价格；null = 满级 / 无效
export function upgradePrice(s: WorldState, tool: string) {
  if (!['rod', 'pick', 'spr', 'house'].includes(tool)) return null
  if (tool === 'house') return s.tools.house < WORLD.houseMax ? WORLD.housePrice[s.tools.house] : null
  // rod / pick 从 1 级开始、spr 从 0 级开始；table[lv] 都是升到 lv+1 的价格
  const table = WORLD.tools[tool], lv = (s.tools as Record<string, number>)[tool]
  return table && lv != null && lv < table.length ? table[lv] : null
}

// ---------- 挂机管家 ----------
// 不跑定时任务：玩家回来（或做任何操作）时，服务端按「每 4 小时巡视一次」把离开期间的巡视补算出来，最多补 2 天（12 轮）。
// 每轮巡视：收蟹笼 → 收动物产物、喂食（饲料不够自动买）→ 收菜、清枯萎、浇水、补种 → 剩余体力按比例钓鱼 / 挖矿 → 按策略卖货。
// 雇佣一次 30 万 D币，之后每轮巡视付 5000 工钱（付不起就歇一轮）。
// 和亲手玩的差别：钓鱼 / 挖矿每次多耗 2 点体力；收获 / 产物 / 鱼都只有普通品质、不会多收；代卖抽成 20%；没有咖啡；每 4 小时巡视一次。
// 经济（sim-auto.mjs）：只挂机约为认真玩的一半左右。
export const AUTO = { every: 4 * 3600, maxBack: 48 * 3600, maxVisits: 12, fee: 0.2, surcharge: 2, budgetMax: 5_000_000, hire: 150_000, wage: 3_000 }
export type AutoCfg = { on: boolean; crop: string; water: boolean; feed: boolean; fishPct: number; keep: number; sell: boolean; minPct: number; budget: number }
export type AutoLog = { from: number; to: number; visits: number; got: Record<string, number>; earn: number; spend: number; xp: number; acts: Record<string, number>; wage: number; skipped: number }
export const AUTO_DEFAULT: AutoCfg = { on: false, crop: 'best', water: true, feed: true, fishPct: 50, keep: 30, sell: true, minPct: 90, budget: 100_000 }
// 校验前端提交的策略（未知字段丢弃、数值夹到范围内）
export function autoConfig(raw: unknown, prev: AutoCfg = AUTO_DEFAULT): AutoCfg {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d }
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  const crop = typeof r.crop === 'string' && (r.crop === 'best' || r.crop === 'none' || CROPS.some((c) => c.id === r.crop)) ? r.crop : prev.crop
  return { on: bool(r.on, prev.on), crop, water: bool(r.water, prev.water), feed: bool(r.feed, prev.feed), fishPct: num(r.fishPct, 0, 100, prev.fishPct), keep: num(r.keep, 0, 300, prev.keep), sell: bool(r.sell, prev.sell), minPct: num(r.minPct, 0, 200, prev.minPct), budget: num(r.budget, 0, AUTO.budgetMax, prev.budget) }
}
// 「当季最赚」：按 4 小时巡视节奏估算每分钟净收益
export function bestCrop(season: number, gapMin = AUTO.every / 60) {
  const v = (c: Crop) => (c.price * 1.4 * (c.regrow ? Math.min(c.times || 1, 3) : 1) - c.seed) / Math.max(gapMin, c.grow * 0.6)
  return CROPS.filter((c) => c.seasons.includes(season)).sort((a, b) => v(b) - v(a))[0]
}
export const autoDue = (s: WorldState, now: number) => !!s.auto?.on && now - s.auto.t >= AUTO.every
export type AutoCtx = { now: number; today: string; rand: () => number; prices: Record<string, number>; coins: number }
export function autoSettle(s: WorldState, ctx: AutoCtx) {
  const a = s.auto
  if (!a?.on || ctx.now - a.t < AUTO.every) return null
  let spend = 0, earn = 0, xp = 0, visits = 0, wage = 0, skipped = 0
  const got: Record<string, number> = {}, acts: Record<string, number> = {}, soldN: Record<string, number> = {}
  const priceCache = new Map<string, Record<string, number>>()
  const pricesFor = (day: string) => {
    if (day === ctx.today) return ctx.prices
    if (!priceCache.has(day)) priceCache.set(day, Object.fromEntries(Object.keys(BASE_PRICE).map((id) => [id, priceOf(id, day)])))
    return priceCache.get(day)!
  }
  const run = (list: Action[], t: number) => {
    for (let k = 0; k < list.length; k += WORLD.maxActions) {
      const part = list.slice(k, k + WORLD.maxActions), day = worldDay(t)
      const r = applyActions(s, part, { t, day, rand: ctx.rand, prices: pricesFor(day), coins: ctx.coins - spend + earn, auto: true })
      spend += r.spend; earn += r.earn; xp += r.xp
      r.out.forEach((o, j) => {
        if (!o.ok) return
        acts[o.a] = (acts[o.a] || 0) + 1
        for (const g of o.got || []) got[g.id] = (got[g.id] || 0) + g.n
        if (o.a === 'sell') { const id = String(part[j].id); soldN[id] = (soldN[id] || 0) + Math.max(1, Math.min(999, Math.floor(Number(part[j].n)) || 1)) }
      })
    }
  }
  // 超过 2 天的部分跳过（管家也要休息）：从「最近 2 天内」的第一个巡视点开始补算
  let t = a.t + AUTO.every
  const oldest = ctx.now - AUTO.maxBack
  if (t <= oldest) t += (Math.floor((oldest - t) / AUTO.every) + 1) * AUTO.every
  const from = t
  worldLifeInit(s, t, ctx.now)
  for (; t <= ctx.now && visits + skipped < AUTO.maxVisits; t += AUTO.every) {
    // 先推进巡视游标，refresh(t) 才不会把本轮视为待回放。
    a.t = t
    refresh(s, t)
    // 工钱：每轮先付；付不起这一轮就歇着
    if (ctx.coins - spend + earn < AUTO.wage) { skipped++; a.t = t; continue }
    spend += AUTO.wage; wage += AUTO.wage
    const weather = weatherOf(worldDay(t)), season = seasonOf(worldDay(t))
    let budget = a.budget
    // 1. 蟹笼
    run(s.traps.map((tr, i) => (trapReady(tr, t, weather === 2).n ? { a: 'trap', i } : null)).filter(Boolean) as Action[], t)
    // 2. 牧场
    const animal: Action[] = []
    s.barn.forEach((pen, i) => { if (animalReady(pen, t).ready) animal.push({ a: 'collect', i }) })
    if (a.feed) {
      // 剩余 <=8h 才续餐，覆盖下次4h巡视，避免每8h浪费一整份日粮。
      const hungry = s.barn.map((pen, i) => { const st = animalReady(pen, t); return st.stage !== 'retired' && st.feedLeft <= 8 * 3600 ? i : -1 }).filter((i) => i >= 0)
      const need = hungry.reduce((n, i) => n + ANIMALS.find((d) => d.id === s.barn[i].k)!.feed, 0)
      const lack = Math.max(0, need - (s.inv.feed?.[0] || 0))
      const n = Math.min(lack, Math.floor(budget / SHOP.feed.price), Math.floor(Math.max(0, ctx.coins - spend + earn) / SHOP.feed.price))
      for (let left = n; left > 0; left -= 99) animal.push({ a: 'buy', id: 'feed', n: Math.min(99, left) })
      budget -= n * SHOP.feed.price
      hungry.forEach((i) => animal.push({ a: 'feed', i }))
    }
    run(animal, t)
    // 3. 农田：收、清、浇、种（种地优先用体力）
    const farm: Action[] = []
    s.plots.forEach((p, i) => { if (!p) return; const st = cropStage(p, t, sprinkled(s, i) || weather === 1); if (st.stage === 3) farm.push({ a: 'harvest', i }); else if (st.stage === -1) farm.push({ a: 'clear', i }) })
    run(farm, t)
    const crop = a.crop === 'none' ? null : a.crop === 'best' ? bestCrop(season) : CROPS.find((c) => c.id === a.crop && c.seasons.includes(season))
    const tend: Action[] = []
    if (a.water && weather !== 1) s.plots.forEach((p, i) => { if (!p || sprinkled(s, i)) return; const st = cropStage(p, t); if (st.stage >= 0 && st.stage < 3 && p.w <= st.stage) tend.push({ a: 'water', i }) })
    if (crop) s.plots.forEach((p, i) => { if (!p && i < s.plotN && budget >= crop.seed && s.en - a.keep >= WORLD.cost.plant) { tend.push({ a: 'plant', i, c: crop.id }); budget -= crop.seed } })
    run(tend, t)
    // 4. 剩余体力：钓鱼 / 挖矿
    const spare = Math.max(0, s.en - a.keep), fishCost = WORLD.cost.fish + AUTO.surcharge, mineCost = WORLD.cost.mine + AUTO.surcharge
    const nf = Math.floor((spare * a.fishPct) / 100 / fishCost), nm = Math.floor((spare - nf * fishCost) / mineCost)
    const work: Action[] = []
    for (let k = 0; k < nf; k++) work.push({ a: 'fish', bait: (s.inv.bait?.[0] || 0) > k })
    for (let k = 0; k < nm; k++) work.push({ a: 'mine', f: 99 })
    run(work, t)
    // 5. 卖货（只卖作物 / 畜产 / 鱼 / 矿；低于「基础价 × minPct%」的留着等涨价）
    if (a.sell) {
      const pr = pricesFor(worldDay(t)), sells: Action[] = []
      for (const [id, qs] of Object.entries(s.inv)) { if (!BASE_PRICE[id] || !(pr[id] >= (BASE_PRICE[id] * a.minPct) / 100)) continue; qs.forEach((n, q) => { if (n) sells.push({ a: 'sell', id, q, n }) }) }
      run(sells, t)
    }
    visits++; a.t = t
  }
  refresh(s, ctx.now)
  const log: AutoLog = { from, to: a.t, visits, got, earn, spend, xp, acts, wage, skipped }
  s.autoLog = log
  return { spend, earn, xp, log, sold: soldN }
}
