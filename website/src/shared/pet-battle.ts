// 站宠成长（服务端权威）、大肥鱼擂台结算、武器装备与 D币 价格表。纯函数：服务端结算，前端只回放战报。
// 设计参考《Q宠大乐斗》：异步、全自动回合制；属性 + 按等级解锁的招式 + 武器自带招式 + 装备被动。
// 数值、名称、图标均为本站原创，不含任何腾讯素材或公式。

// ---------- 成长 ----------
export const PET_DAILY_XP_CAP = 300
export const PET_GROWTH_LAUNCH = '2026-11-03' // 成长系统上线日（北京时间）；旧存档导入时按天数封顶
export const petDay = (t: number) => new Date((t + 8 * 3600) * 1000).toISOString().slice(0, 10)
export const petTotalXp = (level: number, xp: number) => 50 * (level - 1) * level + xp
export function petLevelOf(total: number) {
  let level = 1, rest = Math.max(0, Math.floor(total))
  while (level < 100 && rest >= level * 100) { rest -= level * 100; level++ }
  return { level, xp: level >= 100 ? 0 : rest }
}
export function petImportCap(t: number) {
  const days = Math.floor((Date.parse(petDay(t)) - Date.parse(PET_GROWTH_LAUNCH)) / 86400000) + 1
  return PET_DAILY_XP_CAP * Math.max(1, days)
}

// ---------- 擂台规则 ----------
export const PET_BATTLE_DAILY = 10 // 每天主动挑战次数
export const PET_BATTLE_PAIR_DAILY = 3 // 同一对手每天最多
export const PET_BATTLE_XP = { win: 15, draw: 8, lose: 5 } as const
export const PET_BATTLE_MAX_ROUNDS = 20
export const PET_CHEST_BATTLES = 3 // 每天打满 3 场领宝箱
export const PET_POINTS_PER_LEVEL = 3

// ---------- D币 价格（站内流通货币；全部服务端扣费、记账） ----------
export const PET_PRICES = {
  respec: 3000, // 洗点：属性点全部退回重配
  // 突破训练：用 D币 买经验，突破每日 300 的自然成长上限；每天最多再买 300，越买越贵（阶梯价）。
  trainDaily: 300,
  trainTiers: [[100, 30], [200, 45], [300, 60]] as [number, number][], // [当日累计到多少, 每点经验价格]
  shop: { 1: 3000, 2: 12000, 3: 40000 } as Record<number, number>, // 普通 / 稀有 / 史诗；传说只能掉落或宝箱
  enhanceBase: [1000, 1500, 2200, 3000, 4200, 5800, 7800, 10500, 14000, 19000], // +0→+1 … +9→+10
  enhanceRarity: { 1: 1, 2: 1.6, 3: 2.6, 4: 4 } as Record<number, number>,
}
// 当天已训练 done 点，再训练 xp 点的总价（跨档分段计价）。
export function petTrainCost(done: number, xp: number) {
  let cost = 0
  for (let i = done; i < done + xp; i++) cost += (PET_PRICES.trainTiers.find(([upTo]) => i < upTo) || PET_PRICES.trainTiers.at(-1)!)[1]
  return cost
}
// 实时约战：双方同意才开打，开打前双方押注已冻结；赢家拿走两份押注扣 5% 抽成，平局各自退回。
export const PET_DUEL = { minStake: 100, maxStake: 20000, dailyStake: 100000, rake: 0.05, expire: 600, pairDaily: 2, minLevel: 5, maxLevelGap: 5, minAccountDays: 7 }
export const PET_ENHANCE_MAX = 10
export const petEnhanceCost = (rarity: number, from: number) => from >= PET_ENHANCE_MAX ? 0 : Math.round(PET_PRICES.enhanceBase[from] * (PET_PRICES.enhanceRarity[rarity] || 1))

// ---------- 招式 ----------
// kind：hit 伤害（hits 多段）/ heal 回血 / stun 眩晕 / crit 必暴 / burn 持续伤害 / weak 降攻 / shield 护盾 / evade 闪避提升 / drain 吸血 / focus 下一击必暴
export type PetSkill = { id: string; name: string; level: number; chance: number; kind: string; power: number; anim: string; fx: string; hits?: number; extra?: number; turns?: number; desc?: string }
export const PET_SKILLS: PetSkill[] = [
  { id: 'tail', name: '鲸尾拍击', level: 1, chance: 1, kind: 'hit', power: 1, anim: '用鲸鱼尾巴拍打地面', fx: 'slash', desc: '普通攻击' },
  { id: 'pout', name: '傲娇一击', level: 1, chance: 0.2, kind: 'hit', power: 1.35, anim: '点击回应-傲娇生气', fx: 'impact', desc: '1.35 倍伤害' },
  { id: 'snack', name: '偷吃零食', level: 2, chance: 0.12, kind: 'heal', power: 0.1, anim: '大口吃零食', fx: 'heal', desc: '回复 10% 生命' },
  { id: 'bubble', name: '泡泡冲击', level: 3, chance: 0.15, kind: 'stun', power: 1.15, extra: 0.25, anim: '鲸鱼吐泡泡特效', fx: 'bubble', desc: '25% 使对方停一回合' },
  { id: 'crab', name: '螃蟹横扫', level: 4, chance: 0.14, kind: 'hit', power: 0.62, hits: 2, anim: '螃蟹走路', fx: 'slash', desc: '连击 2 次' },
  { id: 'firework', name: '烟花齐放', level: 5, chance: 0.12, kind: 'hit', power: 1.6, anim: '放烟花', fx: 'firework', desc: '1.6 倍伤害' },
  { id: 'overtime', name: '加班暴击', level: 6, chance: 0.12, kind: 'crit', power: 1.05, anim: '工作状态-忙碌点按', fx: 'crit', desc: '必定暴击' },
  { id: 'cat', name: '撸猫治愈', level: 7, chance: 0.1, kind: 'heal', power: 0.08, extra: 1, anim: '撸猫', fx: 'heal', desc: '回复 8% 生命并解除灼烧、虚弱' },
  { id: 'poker', name: '扑克魔术', level: 8, chance: 0.12, kind: 'weak', power: 0.9, extra: 0.2, turns: 2, anim: '扑克魔术', fx: 'cards', desc: '对方攻击 -20%，2 回合' },
  { id: 'balloon', name: '气球护盾', level: 9, chance: 0.1, kind: 'shield', power: 0.14, anim: '吹气球', fx: 'shield', desc: '获得 14% 生命的护盾' },
  { id: 'whale', name: '蓝鲸现世', level: 10, chance: 0.08, kind: 'hit', power: 2.1, anim: '蓝鲸现世', fx: 'wave', desc: '2.1 倍伤害' },
  { id: 'hotpot', name: '火锅烫烫', level: 12, chance: 0.11, kind: 'burn', power: 0.8, extra: 0.25, turns: 3, anim: '涮火锅', fx: 'fire', desc: '灼烧 3 回合' },
  { id: 'juggle', name: '三球连抛', level: 14, chance: 0.1, kind: 'hit', power: 0.5, hits: 3, anim: '三球抛接', fx: 'balls', desc: '连击 3 次' },
  { id: 'violin', name: '提琴催眠', level: 16, chance: 0.09, kind: 'stun', power: 0.9, extra: 0.45, anim: '小提琴演奏', fx: 'notes', desc: '45% 使对方停一回合' },
  { id: 'lion', name: '舞狮冲撞', level: 18, chance: 0.09, kind: 'hit', power: 1.9, anim: '舞狮头', fx: 'impact', desc: '1.9 倍伤害' },
  { id: 'zoo', name: '动物大军', level: 20, chance: 0.08, kind: 'hit', power: 0.45, hits: 4, anim: '动物环绕', fx: 'balls', desc: '连击 4 次' },
  { id: 'bloom', name: '凭空生花', level: 25, chance: 0.08, kind: 'heal', power: 0.12, extra: 0.08, anim: '凭空生花', fx: 'petals', desc: '回复 12% 生命并加 8% 护盾' },
  { id: 'maid', name: '女仆之舞', level: 30, chance: 0.08, kind: 'evade', power: 0, extra: 0.25, turns: 2, anim: '优雅女仆舞', fx: 'sparkle', desc: '闪避 +25%，2 回合' },
  { id: 'token', name: '吃 Token', level: 40, chance: 0.08, kind: 'drain', power: 1.3, extra: 0.5, anim: '吃Token', fx: 'drain', desc: '1.3 倍伤害，回复伤害的一半' },
  { id: 'think', name: '深度思考', level: 50, chance: 0.08, kind: 'focus', power: 0, anim: '深度思考碎碎念', fx: 'sparkle', desc: '下一次攻击必定暴击' },
]
export const PET_BATTLE_ANIMS = { idle: '待机呼吸休闲', hurt: '被吓一跳', dodge: '原地重力下蹲压缩', stunned: '打瞌睡被惊醒', win: '工作状态-雀跃庆祝', lose: '工作状态-垂头叹气冒汗', counter: '点击回应-傲娇生气', revive: '超大伸懒腰' }

// ---------- 武器装备 ----------
// rarity：1 普通 2 稀有 3 史诗 4 传说。stats 为 +0 时的面板数值（实际生效 ×0.3），每强化一级 +4%。
// 武器自带一个招式（按概率触发，优先于自身招式）；护甲加生命 / 防御；饰品给被动。
export type PetItem = { id: string; name: string; slot: 'weapon' | 'armor' | 'charm'; rarity: 1 | 2 | 3 | 4; anim: string; at?: number; stats: Partial<Record<'hp' | 'atk' | 'def' | 'agi' | 'spd', number>>; skill?: PetSkill; passive?: { kind: 'lifesteal' | 'counter' | 'thorns' | 'revive' | 'first' | 'evade'; value: number }; desc: string }
// 武器都是大肥鱼动作视频里真实出现的道具：出招时直接播放她用这件道具的那段动画；图标取自同一段视频的一帧（anim / at 秒）。
const W = (id: string, name: string, rarity: 1 | 2 | 3 | 4, anim: string, atk: number, extra: PetItem['stats'], skill: Omit<PetSkill, 'id' | 'level' | 'anim'>, desc: string, at?: number): PetItem =>
  ({ id, name, slot: 'weapon', rarity, anim, at, stats: { atk, ...extra }, skill: { id: 'w-' + id, level: 1, anim, ...skill }, desc })
export const PET_ITEMS: PetItem[] = [
  W('tail', '鲸尾', 1, '用鲸鱼尾巴拍打地面', 3, {}, { name: '鲸尾重拍', chance: 0.13, kind: 'hit', power: 1.5, fx: 'impact' }, '1.5 倍伤害'),
  W('shuttle', '毽子', 1, '踢毽子', 3, { spd: 1 }, { name: '毽子连踢', chance: 0.13, kind: 'hit', power: 0.6, hits: 2, fx: 'balls' }, '连击 2 次'),
  W('candy', '糖葫芦', 1, '吃糖葫芦', 2, { hp: 20 }, { name: '甜到回血', chance: 0.1, kind: 'heal', power: 0.09, fx: 'heal' }, '回复 9% 生命'),
  W('car', '玩具汽车', 1, '原地蹲下玩玩具汽车', 3, { agi: 1 }, { name: '小车冲撞', chance: 0.12, kind: 'stun', power: 1, extra: 0.25, fx: 'impact' }, '25% 撞晕对方'),
  W('fan', '纳凉蒲扇', 2, '摇扇纳凉', 5, { agi: 2 }, { name: '扇出旋风', chance: 0.13, kind: 'stun', power: 1, extra: 0.3, fx: 'wind' }, '30% 吹晕对方'),
  W('gun', '水枪', 2, '玩水枪', 5, { spd: 2 }, { name: '水柱连射', chance: 0.14, kind: 'hit', power: 0.42, hits: 3, fx: 'water' }, '连射 3 次'),
  W('top', '陀螺', 2, '抽陀螺', 6, {}, { name: '陀螺旋击', chance: 0.12, kind: 'burn', power: 0.8, extra: 0.2, turns: 3, fx: 'spin' }, '转晕后持续掉血 3 回合'),
  W('flute', '竹笛', 2, '吹笛子', 4, { agi: 2, hp: 20 }, { name: '笛声悠扬', chance: 0.11, kind: 'stun', power: 0.8, extra: 0.4, fx: 'notes' }, '40% 让对方发呆'),
  W('kite', '风筝', 2, '放风筝', 5, { spd: 3 }, { name: '高空俯冲', chance: 0.12, kind: 'hit', power: 1.45, fx: 'slash' }, '1.45 倍伤害'),
  W('cube', '魔方', 2, '原地专心玩魔方', 4, { agi: 3 }, { name: '还原打击', chance: 0.12, kind: 'weak', power: 0.9, extra: 0.18, turns: 2, fx: 'cards' }, '对方攻击 -18%'),
  W('brush', '狼毫大笔', 3, '写福字', 8, { agi: 2 }, { name: '泼墨挥毫', chance: 0.13, kind: 'hit', power: 1.7, fx: 'ink' }, '1.7 倍伤害'),
  W('cards', '魔术扑克', 3, '扑克魔术', 7, { agi: 3, spd: 1 }, { name: '飞牌', chance: 0.13, kind: 'hit', power: 0.5, hits: 3, fx: 'cards' }, '连击 3 次'),
  W('violin', '星光提琴', 3, '小提琴演奏', 7, { agi: 3, spd: 2 }, { name: '星夜奏鸣', chance: 0.12, kind: 'drain', power: 1.3, extra: 0.5, fx: 'notes' }, '伤害的一半转为生命'),
  W('lantern', '孔明灯', 3, '放孔明灯', 8, { agi: 2 }, { name: '天灯坠火', chance: 0.13, kind: 'burn', power: 1.1, extra: 0.3, turns: 3, fx: 'fire' }, '灼烧 3 回合'),
  W('pumpkin', '南瓜灯', 3, '讨糖南瓜灯', 9, { spd: 2 }, { name: '讨糖惊吓', chance: 0.12, kind: 'stun', power: 1.2, extra: 0.35, fx: 'ghost' }, '35% 吓呆对方'),
  W('dove', '魔术鸽子', 4, '变鸽子', 9, { spd: 2, agi: 2 }, { name: '群鸽乱舞', chance: 0.13, kind: 'hit', power: 0.45, hits: 4, fx: 'feathers' }, '连击 4 次'),
  W('lion', '舞狮头', 4, '舞狮头', 10, { hp: 30 }, { name: '金狮怒吼', chance: 0.12, kind: 'crit', power: 1.2, fx: 'crit' }, '必定暴击'),
  W('fireworks', '烟花筒', 4, '放烟花', 10, { agi: 2 }, { name: '烟花齐射', chance: 0.12, kind: 'hit', power: 1.8, fx: 'firework' }, '1.8 倍伤害'),
  { id: 'maid', name: '女仆装', slot: 'armor', rarity: 1, anim: '女仆屈膝礼仪', stats: { hp: 30, def: 3 }, desc: '标准装束，生命 +30 防御 +3' },
  { id: 'pajama', name: '睡衣', slot: 'armor', rarity: 1, anim: '原地小憩沉眠', stats: { hp: 40, def: 2 }, desc: '舒服耐打，生命 +40' },
  { id: 'coder', name: '码农套装', slot: 'armor', rarity: 2, anim: '写代码', stats: { hp: 55, def: 6, agi: 2 }, desc: '久坐不倒' },
  { id: 'mirror', name: '镜前新装', slot: 'armor', rarity: 2, anim: '照镜子', stats: { hp: 50, def: 8 }, desc: '美美的也很硬' },
  { id: 'xmas', name: '圣诞礼服', slot: 'armor', rarity: 3, anim: '装点圣诞树', stats: { hp: 80, def: 10 }, desc: '节日限定的厚实' },
  { id: 'ghost', name: '小幽灵披风', slot: 'armor', rarity: 3, anim: '萌化小幽灵', stats: { hp: 65, def: 8, agi: 4 }, desc: '飘忽不定' },
  { id: 'wardrobe', name: '百变衣橱', slot: 'armor', rarity: 4, anim: '整体换装试色', stats: { hp: 80, def: 9, spd: 2 }, desc: '想穿什么穿什么' },
  { id: 'bubble', name: '泡泡瓶', slot: 'charm', rarity: 1, anim: '鲸鱼吐泡泡特效', stats: { hp: 15 }, passive: { kind: 'lifesteal', value: 0.05 }, desc: '攻击回复伤害的 5%' },
  { id: 'snack', name: '零食袋', slot: 'charm', rarity: 1, anim: '偷吃零食被抓住', stats: { spd: 2 }, passive: { kind: 'first', value: 1 }, desc: '第一回合先手' },
  { id: 'cat', name: '小猫伙伴', slot: 'charm', rarity: 2, anim: '撸猫', stats: { agi: 3 }, passive: { kind: 'evade', value: 0.06 }, desc: '闪避 +6%' },
  { id: 'gift', name: '神秘礼盒', slot: 'charm', rarity: 2, anim: '拆礼物', stats: { def: 3 }, passive: { kind: 'thorns', value: 0.12 }, desc: '反弹受到伤害的 12%' },
  { id: 'redpacket', name: '红包', slot: 'charm', rarity: 3, anim: '收红包', stats: { atk: 2, hp: 30 }, passive: { kind: 'lifesteal', value: 0.1 }, desc: '攻击回复伤害的 10%' },
  { id: 'bees', name: '花蜂伙伴', slot: 'charm', rarity: 3, anim: '蝴蝶蜜蜂环绕头顶开花', stats: { atk: 3 }, passive: { kind: 'counter', value: 0.18 }, desc: '受击后 18% 反击' },
  { id: 'animals', name: '动物军团', slot: 'charm', rarity: 4, anim: '动物环绕', stats: { atk: 3, agi: 2, spd: 2 }, passive: { kind: 'counter', value: 0.18 }, desc: '受击后 18% 反击' },
  { id: 'whale', name: '蓝鲸之魂', slot: 'charm', rarity: 4, anim: '蓝鲸现世', stats: { hp: 30 }, passive: { kind: 'revive', value: 0.12 }, desc: '倒下时以 12% 生命复活一次' },
]
export const petItem = (id: string | null | undefined) => (id ? PET_ITEMS.find((x) => x.id === id) || null : null)
// 升级奖励：保证人人有装备可用。
export const PET_LEVEL_REWARDS: Record<number, string> = { 1: 'tail', 2: 'maid', 3: 'bubble', 5: 'shuttle', 7: 'pajama', 8: 'snack', 10: 'fan', 12: 'coder', 15: 'cat', 18: 'brush', 20: 'mirror', 25: 'bees', 30: 'lantern', 40: 'xmas', 50: 'lion' }
// 掉落：主动挑战后按概率掉一件；宝箱必出一件且稀有度更高。
export const PET_DROP = { win: 0.25, draw: 0.15, lose: 0.1, weights: [0, 62, 28, 8, 2], chestWeights: [0, 40, 38, 17, 5] }
export function petRollItem(r: number, r2: number, weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0)
  let x = r * total, rarity = 1
  for (let i = 1; i < weights.length; i++) { x -= weights[i]; if (x < 0) { rarity = i; break } }
  const pool = PET_ITEMS.filter((it) => it.rarity === rarity)
  return pool[Math.floor(r2 * pool.length)]
}

// ---------- 属性 ----------
export type PetPoints = { str: number; agi: number; spd: number; vit: number }
export type PetGear = { weapon?: { id: string; enh: number } | null; armor?: { id: string; enh: number } | null; charm?: { id: string; enh: number } | null }
export const petPointsTotal = (level: number) => Math.max(0, level - 1) * PET_POINTS_PER_LEVEL
export function petValidPoints(p: unknown, level: number): p is PetPoints {
  if (!p || typeof p !== 'object') return false
  const v = p as Record<string, unknown>
  const keys = ['str', 'agi', 'spd', 'vit']
  if (Object.keys(v).some((k) => !keys.includes(k))) return false
  if (!keys.every((k) => Number.isSafeInteger(v[k]) && (v[k] as number) >= 0)) return false
  return keys.reduce((s, k) => s + (v[k] as number), 0) <= petPointsTotal(level)
}

export type PetFighter = { id: number; name: string; level: number; hp: number; atk: number; def: number; agi: number; spd: number; skills: string[]; gear?: Record<string, { id: string; name: string; rarity: number; enh: number }>; passive?: Record<string, number>; wskill?: string }
// 天赋：每个账号固定的 ±10% 浮动，同等级之间也有差异；由用户 ID 决定，不能刷。
function talent(id: number, k: number) {
  let x = (Math.imul(id ^ (k * 0x9e3779b1), 0x85ebca6b) ^ 0xc2b2ae35) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0x27d4eb2d) >>> 0
  return 0.9 + ((x ^ (x >>> 15)) >>> 0) % 2001 / 10000
}
// 装备数值整体系数：装备有用但不碾压（同级普通全套对裸装约六成胜率）。
const GEAR_SCALE = 0.3
export function petFighter(id: number, name: string, level: number, points?: PetPoints | null, gear?: PetGear | null): PetFighter {
  const L = Math.max(1, Math.min(100, Math.floor(level)))
  const p = points && petValidPoints(points, L) ? points : { str: 0, agi: 0, spd: 0, vit: 0 }
  const add = { hp: p.vit * 4, atk: p.str * 0.4, def: 0, agi: p.agi * 0.4, spd: p.spd * 0.4 }
  const g: PetFighter['gear'] = {}, passive: Record<string, number> = {}
  let wskill: string | undefined
  for (const slot of ['weapon', 'armor', 'charm'] as const) {
    const own = gear?.[slot], item = petItem(own?.id)
    if (!own || !item || item.slot !== slot) continue
    const enh = Math.max(0, Math.min(PET_ENHANCE_MAX, Math.floor(own.enh || 0))), k = GEAR_SCALE * (1 + 0.04 * enh)
    for (const [s, v] of Object.entries(item.stats)) add[s as keyof typeof add] += (v as number) * k
    if (item.passive) passive[item.passive.kind] = (passive[item.passive.kind] || 0) + item.passive.value * (item.passive.kind === 'first' ? 1 : 1 + 0.03 * enh)
    if (item.skill) wskill = item.skill.id
    g[slot] = { id: item.id, name: item.name, rarity: item.rarity, enh }
  }
  return {
    id, name, level: L,
    // 基础值较大、每级加成较小：同级靠加点、装备和招式拉开差距。
    hp: Math.round((240 + 5 * L) * talent(id, 1) + add.hp),
    atk: Math.round((22 + 0.7 * L) * talent(id, 2) + add.atk),
    def: Math.round(add.def),
    agi: Math.round((10 + 0.5 * L) * talent(id, 3) + add.agi),
    spd: Math.round((10 + 0.5 * L) * talent(id, 4) + add.spd),
    skills: PET_SKILLS.filter((s) => s.level <= L).map((s) => s.id),
    gear: g, passive, wskill,
  }
}
export const petSkillById = (id: string) => PET_SKILLS.find((s) => s.id === id) || PET_ITEMS.find((it) => it.skill?.id === id)?.skill || null

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 战报事件：前端按字段回放。hits 为每一段的结果；fx 状态变化单独列出。
export type PetHit = { dmg: number; crit?: boolean; dodge?: boolean; absorbed?: number }
export type PetBattleEvent = { r: number; by: 0 | 1; skill: string; dmg?: number; heal?: number; crit?: boolean; dodge?: boolean; stun?: boolean; stunned?: boolean; hits?: PetHit[]; shield?: number; burn?: boolean; weak?: boolean; evade?: boolean; focus?: boolean; cleanse?: boolean; drain?: number; tick?: boolean; counter?: boolean; thorns?: number; revive?: boolean; hp: [number, number]; sh?: [number, number] }
export type PetBattleResult = { winner: 0 | 1 | -1; rounds: number; events: PetBattleEvent[]; hp: [number, number] }

export function petSimulate(a: PetFighter, b: PetFighter, seed: number): PetBattleResult {
  const rand = rng(seed)
  const f = [a, b], hp: [number, number] = [a.hp, b.hp], sh: [number, number] = [0, 0]
  const st = [0, 1].map(() => ({ stun: false, burn: 0, burnDmg: 0, weak: 0, weakPct: 0, evade: 0, evadePct: 0, focus: false, revived: false }))
  const own = f.map((x) => [...(x.wskill ? [petSkillById(x.wskill)!] : []), ...PET_SKILLS.filter((s) => x.skills.includes(s.id)).reverse()].filter(Boolean) as PetSkill[])
  const events: PetBattleEvent[] = []
  const snap = () => ({ hp: [...hp] as [number, number], sh: [...sh] as [number, number] })
  const pas = (i: number, k: string) => f[i].passive?.[k] || 0
  const reduce = (i: number, dmg: number) => Math.round(dmg * (100 / (100 + f[i].def)))
  // 结算一次伤害：先扣护盾；倒下时检查复活。返回实际造成（含护盾吸收）。
  const damage = (to: number, dmg: number) => {
    let absorbed = 0
    if (sh[to] > 0) { absorbed = Math.min(sh[to], dmg); sh[to] -= absorbed; dmg -= absorbed }
    hp[to] = Math.max(0, hp[to] - dmg)
    return absorbed
  }
  const tryRevive = (i: number, r: number) => {
    if (hp[i] > 0 || st[i].revived || !pas(i, 'revive')) return
    st[i].revived = true
    hp[i] = Math.round(f[i].hp * pas(i, 'revive'))
    events.push({ r, by: i as 0 | 1, skill: 'revive', revive: true, heal: hp[i], ...snap() })
  }
  const alive = () => hp[0] > 0 && hp[1] > 0
  let round = 0
  for (round = 1; round <= PET_BATTLE_MAX_ROUNDS; round++) {
    let first: 0 | 1 = a.spd === b.spd ? (rand() < 0.5 ? 0 : 1) : a.spd > b.spd ? 0 : 1
    if (round === 1 && pas(0, 'first') !== pas(1, 'first')) first = pas(0, 'first') ? 0 : 1
    for (const by of [first, (1 - first) as 0 | 1]) {
      if (!alive()) break
      const me = f[by], foe = f[1 - by], to = (1 - by) as 0 | 1, s = st[by]
      // 回合开始：灼烧跳伤
      if (s.burn > 0) {
        s.burn--
        damage(by, s.burnDmg)
        events.push({ r: round, by, skill: 'burn', tick: true, dmg: s.burnDmg, ...snap() })
        tryRevive(by, round)
        if (!alive()) break
      }
      if (s.weak > 0) s.weak--
      if (s.evade > 0) s.evade--
      if (s.stun) { s.stun = false; events.push({ r: round, by, skill: 'stunned', stunned: true, ...snap() }); continue }
      const skill = own[by].find((sk) => sk.id !== 'tail' && rand() < sk.chance
        && (sk.kind !== 'heal' || hp[by] < me.hp * 0.7) && (sk.kind !== 'shield' || sh[by] === 0) && (sk.kind !== 'evade' || s.evade === 0) && (sk.kind !== 'focus' || !s.focus)) || PET_SKILLS[0]
      const atk = me.atk * (s.weak > 0 ? 1 - s.weakPct : 1)
      if (skill.kind === 'heal') {
        const heal = Math.min(me.hp - hp[by], Math.round(me.hp * skill.power))
        hp[by] += heal
        const ev = { r: round, by, skill: skill.id, heal } as PetBattleEvent
        if (skill.extra && skill.id === 'cat') { s.burn = 0; s.weak = 0; ev.cleanse = true }
        if (skill.extra && skill.id !== 'cat') { sh[by] += Math.round(me.hp * skill.extra); ev.shield = Math.round(me.hp * skill.extra) }
        events.push({ ...ev, ...snap() })
        continue
      }
      if (skill.kind === 'shield') { const v = Math.round(me.hp * skill.power); sh[by] += v; events.push({ r: round, by, skill: skill.id, shield: v, ...snap() }); continue }
      if (skill.kind === 'evade') { s.evade = skill.turns || 2; s.evadePct = skill.extra || 0.2; events.push({ r: round, by, skill: skill.id, evade: true, ...snap() }); continue }
      if (skill.kind === 'focus') { s.focus = true; events.push({ r: round, by, skill: skill.id, focus: true, ...snap() }); continue }
      // 伤害类：可能多段
      const hits: PetHit[] = []
      let total = 0, anyCrit = false
      const n = skill.hits || 1
      for (let i = 0; i < n && hp[to] > 0; i++) {
        const dodgeRate = Math.min(0.4, Math.max(0.02, 0.04 + (foe.agi - me.agi) * 0.006 + pas(to, 'evade') + (st[to].evade > 0 ? st[to].evadePct : 0)))
        if (rand() < dodgeRate) { hits.push({ dmg: 0, dodge: true }); continue }
        const crit = skill.kind === 'crit' || s.focus || rand() < Math.min(0.35, 0.1 + me.agi * 0.003)
        if (crit) s.focus = false
        const dmg = Math.max(1, reduce(to, atk * skill.power * (0.6 + rand() * 0.8) * (crit ? 1.7 : 1)))
        const absorbed = damage(to, dmg)
        hits.push({ dmg, crit: crit || undefined, absorbed: absorbed || undefined })
        total += dmg; anyCrit ||= crit
      }
      const ev = { r: round, by, skill: skill.id, hits } as PetBattleEvent
      if (n === 1) { ev.dmg = hits[0].dmg || undefined; ev.crit = hits[0].crit; ev.dodge = hits[0].dodge }
      else { ev.dmg = total; ev.crit = anyCrit || undefined; ev.dodge = hits.every((h) => h.dodge) || undefined }
      if (total > 0 && hp[to] > 0) {
        if (skill.kind === 'stun' && rand() < (skill.extra ?? 0.25)) { st[to].stun = true; ev.stun = true }
        if (skill.kind === 'burn') { st[to].burn = skill.turns || 3; st[to].burnDmg = Math.max(1, Math.round(atk * (skill.extra || 0.25))); ev.burn = true }
        if (skill.kind === 'weak') { st[to].weak = (skill.turns || 2) + 1; st[to].weakPct = skill.extra || 0.2; ev.weak = true }
      }
      const steal = (skill.kind === 'drain' ? skill.extra || 0.5 : 0) + pas(by, 'lifesteal')
      if (total > 0 && steal > 0) { const v = Math.min(me.hp - hp[by], Math.round(total * steal)); if (v > 0) { hp[by] += v; ev.drain = v } }
      const thorns = pas(to, 'thorns')
      if (total > 0 && thorns > 0 && hp[to] > 0) { const v = Math.max(1, Math.round(total * thorns)); damage(by, v); ev.thorns = v }
      events.push({ ...ev, ...snap() })
      tryRevive(to, round); tryRevive(by, round)
      // 反击：受击且还活着
      if (alive() && total > 0 && pas(to, 'counter') && rand() < pas(to, 'counter')) {
        const dmg = Math.max(1, reduce(by, foe.atk * 0.6 * (0.8 + rand() * 0.4)))
        damage(by, dmg)
        events.push({ r: round, by: to, skill: 'counter', counter: true, dmg, ...snap() })
        tryRevive(by, round)
      }
    }
    if (!alive()) break
  }
  const ratio = [hp[0] / a.hp, hp[1] / b.hp]
  const winner: 0 | 1 | -1 = hp[1] <= 0 ? 0 : hp[0] <= 0 ? 1 : Math.abs(ratio[0] - ratio[1]) < 0.001 ? -1 : ratio[0] > ratio[1] ? 0 : 1
  return { winner, rounds: Math.min(round, PET_BATTLE_MAX_ROUNDS), events, hp }
}
