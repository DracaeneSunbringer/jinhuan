import { DEFAULT_PET_STATE, clonePetState, validPetState } from '/pet-state.js?v=472f7fbf'

// 站宠共享状态：站宠屋页面和全站悬浮宠物用同一份状态与云档，避免两边各存各的互相冲突。
// 服务端仍是权威；本机副本只用于断网恢复，多个标签页之间用 BroadcastChannel 同步。
const now = () => Math.floor(Date.now() / 1000)
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)))
const pick = (list) => list[Math.floor(Math.random() * list.length)]

// ---------- 成长 ----------
// 等级解锁动作、减慢状态消耗、开放新功能。全部是外观和陪伴类福利，不碰 D 币：
// 存档现在由前端提交，涉及站内资产的奖励要等服务端结算版再做。
export const DAILY_XP_CAP = 300
// 等级骨架：解锁哪些动作分组、附带哪些与宠物无关的福利。具体「解锁几个什么动作」按当前宠物实际动作表生成，
// 换成没有吃播 / 时节动作的宠物（如明日方舟干员）时，不再显示大肥鱼专属的承诺。
export const LEVELS = [
  { level: 1, title: '初来乍到', groups: ['idle', 'turn', 'drag', 'click', 'move', 'sleep', 'small'], base: true, perks: ['左键摸摸它会有反应'] },
  { level: 2, title: '吃货觉醒', plainTitle: '胃口变好', groups: ['food'], noun: '种吃播动作', perks: ['饱食消耗变慢 10%'] },
  { level: 3, title: '玩心大发', groups: ['play', 'whisper'], noun: '个玩耍动作', perks: ['会时不时碎碎念'] },
  { level: 4, title: '消息小助手', perks: ['有新的群聊或私信时会提醒你，点气泡直达'] },
  { level: 5, title: '四时有序', groups: ['season'], noun: '个时节动作', perks: [], needsActions: ['节日当天会表演对应的节日动作'] },
  { level: 6, title: '打工人', plainTitle: '精力充沛', groups: ['work', 'balance', 'text'], noun: '个工作类动作', perks: ['精力消耗变慢 20%'] },
  { level: 8, title: '有名有姓', perks: ['可以给它起名字'] },
  { level: 10, title: '形影不离', perks: ['可以调整悬浮大小', '所有状态消耗减半'] },
]
// 低等级也要有东西可演：喂食、玩耍各留两段基础动作。
const BASE_ACTIONS = new Set(['吃白饭', '大口吃零食', '三球抛接', '鲸鱼吐泡泡特效'])
const GROUP_LEVEL = Object.fromEntries(LEVELS.flatMap((l) => (l.groups || []).map((g) => [g, l.level])))
export const unlockLevel = (item) => (BASE_ACTIONS.has(item.name) ? 1 : GROUP_LEVEL[item.group] ?? 1)
export const unlocked = (item, state = petState()) => state.level >= unlockLevel(item)
export const hasPerk = (level, state = petState()) => state.level >= level
export const xpToNext = (state) => (state.level >= 100 ? 0 : state.level * 100)

// 按某只宠物的实际动作生成成长之路：只列这只宠物真的有的动作；某级对它没有任何福利就不显示这一级。
export function petLevels(pet = store.pet) {
  const actions = pet?.actions || []
  return LEVELS.map((l) => {
    const mine = l.groups ? actions.filter((a) => unlockLevel(a) === l.level) : []
    const perks = []
    if (l.base) {
      const labels = [...new Set(mine.map((a) => a.groupLabel).filter(Boolean))]
      if (labels.length) perks.push('基础动作：' + labels.join('、'))
    } else if (mine.length) perks.push(`解锁 ${mine.length} ${l.noun}`)
    if (mine.length && l.needsActions) perks.push(...l.needsActions)
    perks.push(...l.perks)
    return { level: l.level, title: !mine.length && l.plainTitle ? l.plainTitle : l.title, perks }
  }).filter((l) => l.perks.length)
}

const decayRates = (level) => ({
  hunger: 2 * (level >= 10 ? 0.5 : level >= 2 ? 0.9 : 1),
  energy: level >= 10 ? 0.5 : level >= 6 ? 0.8 : 1,
  cleanliness: level >= 10 ? 0.5 : 1,
})

export function applyDecay(source) {
  const state = { ...clonePetState(), ...source }
  // A fresh pet has no clock yet; start it now instead of decaying from 1970.
  if (!state.lastTick) state.lastTick = now()
  const elapsed = Math.max(0, now() - Number(state.lastTick))
  const hours = Math.floor(elapsed / 3600)
  if (hours > 0) {
    const counted = Math.min(48, hours), rate = decayRates(state.level)
    state.hunger = clamp(state.hunger - counted * rate.hunger)
    state.energy = clamp(state.energy - counted * rate.energy)
    state.cleanliness = clamp(state.cleanliness - counted * rate.cleanliness)
    // Keep the partial hour so frequent renders do not swallow decay.
    state.lastTick = hours > 48 ? now() : state.lastTick + hours * 3600
  }
  return validPetState(state) ? state : clonePetState()
}

const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
// 每天经验有上限：靠每天来陪它慢慢长大，连点刷不上去。
function gainXp(state, amount) {
  if (state.daily?.day !== today()) state.daily = { day: today(), xp: 0, met: false }
  const add = Math.max(0, Math.min(Math.floor(amount), DAILY_XP_CAP - state.daily.xp))
  state.daily.xp += add
  state.xp += add
  const ups = []
  while (state.level < 100 && state.xp >= state.level * 100) {
    state.xp -= state.level * 100
    state.level += 1
    state.affection = clamp(state.affection + 3)
    ups.push(state.level)
  }
  return { add, ups }
}
const announce = (ups) => {
  for (const level of ups) dispatchEvent(new CustomEvent('petlevelup', { detail: { level, perk: petLevels().find((l) => l.level === level) || null } }))
}

// 养成操作：数值满了就不吃这一套，既符合直觉，也避免连点刷经验。
export const CARE = {
  feed: { label: '喂食', icon: '🍚', detail: '补充饱食和亲密度', group: 'food', xp: 8,
    refuse: (s) => s.hunger >= 95 && '吃不下啦，肚子圆滚滚',
    run: (s) => { s.hunger = clamp(s.hunger + 18); s.affection = clamp(s.affection + 2) },
    say: ['好吃！', '再来一口～', '谢谢投喂'] },
  play: { label: '玩耍', icon: '✦', detail: '增加亲密度，消耗精力', group: 'play', xp: 12,
    refuse: (s) => s.energy < 12 && '玩不动了，想先睡一会儿',
    run: (s) => { s.energy = clamp(s.energy - 10); s.hunger = clamp(s.hunger - 4); s.affection = clamp(s.affection + 7) },
    say: ['好耶！', '再玩一次！', '今天也很开心'] },
  rest: { label: '休息', icon: '☾', detail: '恢复精力', group: 'sleep', xp: 4,
    refuse: (s) => s.energy >= 95 && '精神着呢，不困',
    run: (s) => { s.energy = clamp(s.energy + 22); s.hunger = clamp(s.hunger - 2) },
    say: ['呼……', '睡饱了再陪你', 'zzz'] },
  clean: { label: '清洁', icon: '✧', detail: '恢复清洁度', group: 'small', xp: 4,
    refuse: (s) => s.cleanliness >= 95 && '已经香喷喷的了',
    run: (s) => { s.cleanliness = clamp(s.cleanliness + 28); s.affection = clamp(s.affection + 1) },
    say: ['干干净净～', '香喷喷', '焕然一新'] },
}

const store = {
  user: null, api: null, manifest: null, revision: 0, state: clonePetState(), dirty: false, saving: false, conflict: false,
  timer: 0, status: { text: '正在读取云档…', kind: '' }, subs: new Set(), ready: null, channel: null,
  baseTotal: null, // 服务端记账的总经验（上次同步时）；保存时一起提交，服务端只认增量
}
// 等级 / 经验以服务端为准：总经验 = 之前各级所需之和 + 当前经验。
const totalOf = (s) => 50 * (s.level - 1) * s.level + s.xp
const levelOf = (total) => { let level = 1, rest = Math.max(0, Math.floor(total)); while (level < 100 && rest >= level * 100) { rest -= level * 100; level++ } return { level, xp: level >= 100 ? 0 : rest } }
// 采用服务端返回的进度；本机在请求途中又攒的经验（extra）叠在上面，下次保存再提交。
export function applyServerProgress(progress, extra = 0) {
  if (!progress || !Number.isSafeInteger(progress.total)) return
  const state = store.state
  const { level, xp } = levelOf(progress.total + Math.max(0, extra))
  state.level = level
  state.xp = xp
  state.daily = { ...(state.daily || {}), day: progress.day, xp: progress.day_xp + Math.max(0, extra), met: state.daily?.day === progress.day ? !!state.daily.met : false }
  store.baseTotal = progress.total
  emit()
}
const cacheKey = () => `jinhuan.site-pet:${store.user.id}`
const emit = () => { for (const fn of store.subs) try { fn(store) } catch (error) { console.error(error) } }
const setStatus = (text, kind = '') => { store.status = { text, kind }; emit() }

export function petStore() { return store }

// ---------- 多宠物 ----------
// 每只宠物整理成统一的定义：动作表、角色映射（待机 / 拖拽 / 睡觉…用哪段动作）、命中框和播放方式。
// kind：video = 透明视频（大肥鱼）；frames = WebP 帧序列（VPet）；spine = Spine 骨骼动画（明日方舟）。
const jsonCache = new Map()
const getJson = (url) => {
  if (!jsonCache.has(url)) jsonCache.set(url, fetch(url, { cache: 'force-cache' }).then((r) => { if (!r.ok) throw Error('站宠资源加载失败'); return r.json() }))
  const p = jsonCache.get(url)
  p.catch(() => jsonCache.delete(url))
  return p
}
const DSH_ROLES = {
  idle: '待机呼吸休闲', turn: ['东张西望'], drag: '被鼠标拖拽悬空反馈', drop: null,
  angry: '点击回应-傲娇生气', shy: '点击回应-害羞惊讶', wave: '点击回应-元气挥手', celebrate: '工作状态-雀跃庆祝', scared: '被吓一跳',
  sleep: { start: '睡觉-开始', loop: '睡觉-循环', end: '睡觉-起来' }, clean: ['晨间刷牙', '照镜子', '整体换装试色'],
  // 上游 dsh-pet moves：距离按基准宽度 462 的像素，开头 lead 秒起脚、结尾 tail 秒收脚不位移。漂浮踏步可以斜着飘。
  moves: {
    '螃蟹走路': { minDist: 60, maxDist: 240, lead: 2, tail: 2 },
    '原地漂浮踏步': { minDist: 60, maxDist: 200, lead: 2, tail: 2, float: true },
    '原地左转奔跑': { minDist: 120, maxDist: 320, lead: 1.75, tail: 4.8 },
  },
}
const ARK_NAMES = { Relax: '放松', Default: '站立', Idle: '待机', Interact: '互动', Move: '走路', Sit: '坐下', Sleep: '睡觉', Special: '特技' }
const ARK_GROUPS = { Relax: 'idle', Default: 'idle', Idle: 'idle', Interact: 'click', Move: 'move', Sit: 'small', Sleep: 'sleep', Special: 'play' }
const GROUP_LABELS = { idle: '待机', click: '点击回应', move: '移动', small: '小动作', sleep: '睡眠', play: '玩耍' }

function normalizePet(entry, manifest) {
  const base = { id: entry.id, name: entry.name, kind: entry.kind, credit: entry.credit || manifest?.credit || null, series: entry.series || null }
  if (entry.kind === 'video') {
    return { ...base, actions: manifest.actions, aspect: 16 / 9, hit: { x0: 200 / 640, y0: 50 / 360, x1: 440 / 640, y1: 335 / 360 }, feet: 330 / 360,
      mirror: true, baseFacing: 'left', refWidth: 462, roles: { ...DSH_ROLES, click: manifest.actions.filter((a) => a.group === 'click' && a.name !== DSH_ROLES.angry).map((a) => a.name) } }
  }
  if (entry.kind === 'frames') {
    const roles = manifest.roles || {}
    return { ...base, actions: manifest.actions, frame: manifest.frame, aspect: manifest.frame.w / manifest.frame.h, hit: manifest.hit, head: manifest.head || null,
      feet: manifest.feet ?? manifest.hit.y1, mirror: manifest.mirror ?? false, baseFacing: 'left', refWidth: manifest.frame.w,
      roles: { turn: [], click: [], clean: [], moves: {}, ...roles } }
  }
  // spine：动作由骨骼文件里的动画名生成；循环动作（走路、坐下、睡觉）播放一段时间再算结束。
  const actions = entry.anims.map((anim, i) => {
    const root = anim.replace(/_(Begin|Loop|End)$/, '')
    const group = ARK_GROUPS[root] || 'small'
    const loop = ['Relax', 'Default', 'Idle', 'Move', 'Sit', 'Sleep'].includes(root) && !/_(Begin|End)$/.test(anim)
    return { id: 'k' + i, name: (ARK_NAMES[root] || anim) + (anim === root ? '' : '·' + anim.slice(root.length + 1)), anim, group, groupLabel: GROUP_LABELS[group] || '小动作', loop,
      hold: root === 'Move' ? [3, 6] : root === 'Sit' ? [6, 12] : loop ? [4, 8] : null }
  })
  const by = (anim) => actions.find((a) => a.anim === anim)?.name || null
  const idleName = by('Relax') || by('Default') || by('Idle') || actions[0]?.name
  const interact = by('Interact') || by('Special')
  return { ...base, actions, aspect: 1, hit: { x0: 0.3, y0: 0.18, x1: 0.7, y1: 0.95 }, feet: 0.95, mirror: true, baseFacing: 'right', refWidth: 300,
    spine: { runtime: entry.runtime, skel: entry.skel, atlas: entry.atlas, bounds: entry.bounds || null },
    roles: { idle: idleName, turn: [], drag: idleName, drop: interact, click: [interact].filter(Boolean), angry: null, shy: interact, wave: interact,
      celebrate: by('Special') || interact, scared: interact, clean: [],
      sleep: by('Sleep') ? { start: by('Sleep_Begin'), loop: by('Sleep'), end: by('Sleep_End') } : null,
      moves: by('Move') ? { [by('Move')]: { speed: 34 } } : {} } }
}

export async function loadPetDef(id) {
  const entry = store.registry.pets.find((p) => p.id === id)
  if (entry) return normalizePet(entry, await getJson(entry.manifest))
  if (/^ark-/.test(id || '')) {
    const index = await getJson('/pets/ark/index.json')
    const pet = index.pets.find((p) => p.id === id)
    if (pet) return normalizePet({ ...pet, kind: 'spine', series: index.series, runtime: index.runtime, credit: index.credit }, null)
  }
  throw Error('没有这只站宠')
}
// 换宠物：成长进度跟着账号走，换哪只都一样；只记录当前选的是谁。
// 连续快速切换时只认最后一次：先点的那只后加载完也不会把后点的覆盖掉。
let switchSeq = 0
export async function setActivePet(id) {
  const mine = ++switchSeq
  const def = await loadPetDef(id)
  if (mine !== switchSeq) return store.pet
  store.pet = def
  const state = petState()
  state.activePet = def.id
  state.currentAction = def.roles.idle || def.actions[0]?.name || '待机'
  markDirty()
  dispatchEvent(new CustomEvent('petchange', { detail: def }))
  return def
}
// 另一个标签页 / 设备换了宠物（云档里的 activePet 变了）：这边也跟着换，页面和悬浮层都收到 petchange。
let following = null
async function followActivePet() {
  const id = store.state?.activePet
  if (!id || id === store.pet?.id || following === id) return
  following = id
  try {
    const def = await loadPetDef(id)
    if (store.state.activePet !== def.id) return
    store.pet = def
    dispatchEvent(new CustomEvent('petchange', { detail: def }))
  } catch {} finally { if (following === id) following = null }
}
export async function petCatalog() {
  const reg = store.registry
  const series = await Promise.all((reg.series || []).map(async (s) => {
    try { const index = await getJson(s.index); return { ...s, credit: index.credit, pets: index.pets.map((p) => ({ id: p.id, name: p.name, rarity: p.rarity })) } } catch { return { ...s, pets: [] } }
  }))
  return { pets: reg.pets, series }
}
export const currentPet = () => store.pet

export function subscribePet(fn) { store.subs.add(fn); return () => store.subs.delete(fn) }
export function petState() { store.state = applyDecay(store.state); return store.state }

// Idempotent: the page and the floating pet both call this, the first call does the work.
export function initPetStore({ user, api }) {
  if (store.ready && store.user?.id === user.id) return store.ready
  store.user = user
  store.api = api
  store.ready = (async () => {
    store.registry = await getJson('/pets/index.json').catch(() => ({ default: 'dsh-blue-whale', pets: [{ id: 'dsh-blue-whale', name: '大肥鱼', kind: 'video', manifest: '/pets/dsh/manifest.json' }], series: [] }))
    await loadCloud(true)
    store.pet = await loadPetDef(store.state.activePet).catch(() => null) || await loadPetDef(store.registry.default)
    try {
      store.channel = new BroadcastChannel('jinhuan-site-pet')
      store.channel.onmessage = ({ data }) => {
        if (data?.userId !== store.user.id || !(data.revision > store.revision) || !validPetState(data.state)) return
        store.revision = data.revision
        if (!store.dirty) { store.state = applyDecay(data.state); if (Number.isSafeInteger(data.baseTotal)) store.baseTotal = data.baseTotal }
        store.conflict = false
        setStatus('云端已同步', 'ok')
        void followActivePet()
      }
    } catch {}
    setInterval(() => { store.state = applyDecay(store.state); emit() }, 60_000)
    document.addEventListener('visibilitychange', () => { if (document.hidden) void flushPet() })
    addEventListener('pagehide', () => { void flushPet() })
    return store
  })()
  store.ready.catch(() => { store.ready = null })
  return store.ready
}

async function loadCloud(first = false) {
  try {
    const data = await store.api('/pet/state')
    store.revision = Number(data.revision) || 0
    store.state = applyDecay(data.state || clonePetState())
    store.baseTotal = Number.isSafeInteger(data.progress?.total) ? data.progress.total : null
    store.dirty = false
    store.conflict = false
    try { localStorage.removeItem(cacheKey()) } catch {}
    setStatus(data.state ? '云端已同步' : first ? '已领养新宠物' : '已载入云档', 'ok')
  } catch (error) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey()) || 'null')
      if (cached?.state && validPetState(cached.state)) {
        store.revision = Number(cached.revision) || 0
        store.state = applyDecay(cached.state)
        store.dirty = true
        setStatus('已恢复本机副本', 'warn')
        return
      }
    } catch {}
    setStatus('云档读取失败', 'error')
    if (!first) throw error
  }
}

export const reloadPet = () => loadCloud(false).then(() => followActivePet())

function markDirty() {
  store.dirty = true
  try { localStorage.setItem(cacheKey(), JSON.stringify({ revision: store.revision, state: store.state })) } catch {}
  clearTimeout(store.timer)
  store.timer = setTimeout(() => { store.timer = 0; void flushPet() }, 2500)
  emit()
}

// 新用户还没有云档时先存一次（例如直接进擂台），服务端以「有存档」作为已领养站宠。
export async function ensurePetSaved() {
  if (store.revision > 0 || !store.user) return true
  store.dirty = true
  return flushPet()
}

export async function flushPet() {
  if (!store.user || store.saving || !store.dirty) return false
  store.saving = true
  const state = JSON.parse(JSON.stringify(store.state))
  try {
    setStatus('正在同步…')
    const body = { user_id: store.user.id, revision: store.revision, operation: crypto.randomUUID(), state }
    if (store.baseTotal != null) body.base_total = store.baseTotal
    const result = await store.api('/pet/state', { method: 'POST', body })
    store.revision = result.revision
    store.dirty = JSON.stringify(store.state) !== JSON.stringify(state)
    if (result.progress) {
      const extra = totalOf(store.state) - totalOf(state)
      applyServerProgress(result.progress, extra)
      state.level = store.state.level; state.xp = store.state.xp; state.daily = store.state.daily
    }
    if (!store.dirty) try { localStorage.removeItem(cacheKey()) } catch {}
    try { store.channel?.postMessage({ userId: store.user.id, revision: store.revision, state, baseTotal: store.baseTotal }) } catch {}
    setStatus('云端已同步', 'ok')
    return true
  } catch (error) {
    if (error.status === 409) {
      // 另一台设备或标签页先存了：以云端为准，刚才这一下的变化放弃。
      store.conflict = true
      await loadCloud(false).catch(() => {})
      setStatus('已同步其他设备的进度', 'warn')
      void followActivePet()
    } else setStatus(error.status === 429 ? '保存较频繁，稍后重试' : '本机已保存，等待同步', 'warn')
    return false
  } finally {
    store.saving = false
    if (store.dirty && !store.timer) store.timer = setTimeout(() => { store.timer = 0; void flushPet() }, 5000)
  }
}

// 返回要播放的动作和一句话；数值已满时只返回拒绝理由，不改状态。
export function carePet(kind) {
  const care = CARE[kind]
  const state = petState()
  const refused = care.refuse(state)
  const roles = store.pet?.roles || {}
  if (refused) return { refused: true, say: refused, action: findAction(roles.angry) || findAction(roles.shy) || findAction(roles.idle) }
  care.run(state)
  const { ups } = gainXp(state, care.xp)
  markDirty()
  announce(ups)
  const pool = (kind === 'clean' ? actionsNamed(roles.clean || []) : actionsIn(care.group)).filter((item) => unlocked(item, state))
  const fallback = [findAction(roles.celebrate), ...actionsIn('click')].filter((item) => item && unlocked(item, state))
  return { refused: false, say: pick(care.say), action: pick(pool.length ? pool : fallback.length ? fallback : actionsIn('idle')) }
}

// 左键摸摸：每 20 秒算一次经验，每天第一次见面额外奖励。
let lastPet = 0
const PET_LINES = [
  [0, ['嗯？', '干嘛呀', '……你好']],
  [30, ['嘿嘿', '摸摸头～', '再摸一下']],
  [60, ['最喜欢你啦', '今天也陪着你', '蹭蹭']],
  [90, ['我们是最好的朋友！', '有你真好', '一直在你身边哦']],
]
export function petInteract() {
  const state = petState()
  if (state.daily?.day !== today()) state.daily = { day: today(), xp: 0, met: false }
  let say = pick(PET_LINES.filter(([min]) => state.affection >= min).at(-1)[1])
  let ups = []
  if (!state.daily.met) {
    state.daily.met = true
    ups = gainXp(state, 20).ups
    say = '今天第一次见面！经验 +20'
  } else if (Date.now() - lastPet > 20_000) {
    ups = gainXp(state, 2).ups
    state.affection = clamp(state.affection + 1)
  } else return { say, counted: false }
  lastPet = Date.now()
  markDirty()
  announce(ups)
  return { say, counted: true }
}

// 悬浮陪伴：宠物显示在屏幕上、页面在前台时，每 2 分钟 +1 经验。
export function companionTick() {
  const state = petState()
  const { add, ups } = gainXp(state, 1)
  if (!add) return
  markDirty()
  announce(ups)
}

export function renamePet(name) {
  const state = petState()
  const clean = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8)
  if (!hasPerk(8, state)) return false
  if (clean) state.nickname = clean
  else delete state.nickname
  markDirty()
  return true
}
export const petName = (state = petState()) => state.nickname || store.pet?.name || '站宠'

export function rememberAction(name) {
  const state = petState()
  if (state.currentAction === name) return
  state.currentAction = name
  markDirty()
}

// Safari / iOS 能解码 VP9 webm 却会丢掉透明通道（变成黑底），WebKit 改用同名 HEVC-alpha .mov。
// canPlayType 判断不出「透明还在不在」，只能按 UA 区分（与上游 dsh-pet media.ts 一致）。
const PREFERS_MOV = (() => {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  if (/Chrome|Chromium|Edg|OPR|Firefox|FxiOS/i.test(ua)) return false
  return /Mac/i.test(navigator.platform || ua)
})()
export const petSrc = (item) => (PREFERS_MOV ? item.src.replace(/\.webm$/, '.mov') : item.src)

export const actionsIn = (...groups) => (store.pet?.actions || []).filter((item) => groups.includes(item.group))
export const actionsNamed = (names) => (store.pet?.actions || []).filter((item) => names.includes(item.name))
export const findAction = (name) => (name && store.pet?.actions.find((item) => item.name === name)) || null

// 全站悬浮的开关只存在本机：不同设备可以有不同习惯。
const FLOAT_KEY = 'jinhuan.pet-float'
export function floatPrefs() {
  try { return { hidden: false, collapsed: false, ...JSON.parse(localStorage.getItem(FLOAT_KEY) || '{}') } } catch { return { hidden: false, collapsed: false } }
}
export function setFloatPrefs(patch) {
  const next = { ...floatPrefs(), ...patch }
  try { localStorage.setItem(FLOAT_KEY, JSON.stringify(next)) } catch {}
  dispatchEvent(new CustomEvent('petfloatprefs', { detail: next }))
  return next
}

export { DEFAULT_PET_STATE }
