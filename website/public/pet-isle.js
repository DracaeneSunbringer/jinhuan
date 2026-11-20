// 大肥鱼的小岛：一整张可交互的像素场景（农田 / 牧场 / 海边 / 矿洞 / 集市）。
// 交互原则：点场景里的东西就行——点地块种 / 浇 / 收（手指划过一排地块可以连着做），点动物收蛋喂食，
// 点码头钓鱼（看到「!」再点一下收竿），点矿洞进洞敲石头，点Claude 娘店主买卖。屏幕上只留一条细状态栏和随区域变化的快捷栏。
// 省资源：所有操作先在本地生效、合并成批次提交（每批 ≤ 40 个动作、两次提交间隔 ≥ 2 秒）；没有轮询；页面隐藏时停帧。
import * as R from '/pet-world-rules.js'
import * as A from '/pet-isle-scenery.js'

const T = A.TILE
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'style') n.style.cssText = v
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v)
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)))
  return n
}
const fmt = (n) => Math.round(n).toLocaleString('zh-CN')
const short = (n) => (n >= 1e8 ? (n / 1e8).toFixed(n >= 1e9 ? 0 : 1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(n >= 1e6 ? 0 : 1) + '万' : fmt(n))
const QN = ['', '银星', '金星']
const dur = (s) => (s >= 3600 ? Math.floor(s / 3600) + '小时' + (Math.floor((s % 3600) / 60) ? Math.floor((s % 3600) / 60) + '分' : '') : s >= 60 ? Math.ceil(s / 60) + '分钟' : Math.max(1, Math.ceil(s)) + '秒')
const clone = (o) => JSON.parse(JSON.stringify(o))
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)))

// ---------- 音效：WebAudio 现场合成的短音（没有音频文件），菜单里可以关 ----------
let audio = null
const sfxOn = () => { try { return localStorage.getItem('isleSfx') !== '0' } catch { return true } }
export function setSfx(on) { try { localStorage.setItem('isleSfx', on ? '1' : '0') } catch {} }
export function sfx(kind) {
  if (!sfxOn()) return
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)()
    if (audio.state === 'suspended') audio.resume()
    const t = audio.currentTime, g = audio.createGain(), o = audio.createOscillator()
    const P = { plant: ['square', 220, 330, 0.06, 0.05], water: ['sine', 700, 380, 0.12, 0.04], harvest: ['square', 520, 1040, 0.12, 0.05], coin: ['square', 990, 1320, 0.09, 0.05], bite: ['triangle', 880, 660, 0.08, 0.09], splash: ['sawtooth', 300, 90, 0.18, 0.04], hit: ['square', 140, 90, 0.07, 0.07], break: ['sawtooth', 220, 60, 0.16, 0.06], buy: ['triangle', 440, 660, 0.12, 0.06], fail: ['square', 160, 120, 0.12, 0.04], new: ['triangle', 660, 1320, 0.3, 0.07], pop: ['sine', 500, 800, 0.06, 0.05] }[kind] || ['sine', 440, 440, 0.05, 0.03]
    o.type = P[0]; o.frequency.setValueAtTime(P[1], t); o.frequency.exponentialRampToValueAtTime(P[2], t + P[3])
    g.gain.setValueAtTime(P[4], t); g.gain.exponentialRampToValueAtTime(0.0001, t + P[3] + 0.04)
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + P[3] + 0.05)
    if (kind === 'coin' || kind === 'new') { const o2 = audio.createOscillator(), g2 = audio.createGain(); o2.type = 'square'; o2.frequency.setValueAtTime(P[2] * 1.5, t + 0.07); g2.gain.setValueAtTime(0.0001, t); g2.gain.setValueAtTime(P[4] * 0.8, t + 0.07); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o2.connect(g2).connect(audio.destination); o2.start(t + 0.07); o2.stop(t + 0.24) }
  } catch {}
}

// ---------- 地图 ----------
const W = 44, H = 30
const LAYOUT = {
  house: { x: 40, y: 18, w: 80, h: 72, door: [80, 92] },
  farm: { x: 152, y: 44, cols: 8, rows: 3, gap: 18 },
  barn: { x: 16, y: 150, w: 72, h: 64 },
  pasture: { x: 96, y: 166, w: 144, h: 80 },
  stall: { x: 300, y: 140, w: 80, h: 64, cat: [334, 172] },
  board: { x: 262, y: 226 }, gate: { x: 388, y: 210 },
  dock: { x: 528, y: 232, len: 9 },
  mine: { x: 36, y: 318, w: 64, h: 56, door: [68, 372] }, anvil: { x: 116, y: 360 },
}
const TRAP_POS = [[586, 222], [626, 222], [586, 276], [626, 276]]
const plotXY = (i) => { const f = LAYOUT.farm, c = i % f.cols, r = Math.floor(i / f.cols); return [f.x + c * f.gap, f.y + r * f.gap] }
function buildMap() {
  const m = Array.from({ length: H }, () => Array(W).fill('~'))
  const rr = A.rng(5)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < 34; x++) {
    const edge = Math.min(x - 1, y - 1, H - 2 - y, 33 - x)
    if (edge > 0 || rr() < 0.55) m[y][x] = '.'
  }
  for (let y = 2; y < H - 2; y++) for (let x = 30; x < 34; x++) if (m[y][x] !== '~') m[y][x] = ','
  for (let y = 12; y < 19; y++) m[y][34] = ','
  for (let y = 19; y < 27; y++) for (let x = 1; x < 8; x++) if (m[y][x] !== '~' && y < 22) m[y][x] = '#'
  const path = (x0, y0, x1, y1) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (m[y0][x] === '.') m[y0][x] = '='; for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) if (m[y][x1] === '.') m[y][x1] = '=' }
  // 池塘（装饰）
  for (let y = 20; y < 25; y++) for (let x = 15; x < 21; x++) if (!((y === 20 || y === 24) && (x === 15 || x === 20))) m[y][x] = '~'
  path(5, 6, 5, 9); path(5, 9, 29, 9); path(14, 9, 14, 14); path(20, 9, 20, 15); path(20, 15, 29, 15); path(29, 15, 29, 15); path(8, 15, 8, 22); path(8, 22, 4, 22)
  return m.map((r) => r.join(''))
}
const DECOR = (() => {
  const out = [], r = A.rng(77)
  const free = (x, y) => !((x > 225 && x < 345 && y > 300 && y < 410) || (x > 30 && x < 130 && y < 100) || (x > 140 && x < 310 && y < 110) || (x > 0 && x < 250 && y > 140 && y < 260) || (x > 250 && x < 450 && y > 120 && y < 280) || (x > 20 && x < 150 && y > 300) || x > 460 || y > 440)
  for (let i = 0; i < 40; i++) { const x = 8 + Math.floor(r() * 450), y = 10 + Math.floor(r() * 430); if (!((x > 140 && x < 300 && y > 30 && y < 110) || (x > 90 && x < 245 && y > 160 && y < 250) || (x > 230 && x < 345 && y > 305 && y < 405) || x > 470)) out.push(['flowers', x, y, i + 11]) }
  out.push(['trough', 112, 226], ['bench', 278, 300], ['lily', 262, 342, 1], ['lily', 300, 360, 2], ['lily', 284, 378, 3], ['lily', 318, 338, 4])
  for (let i = 0; i < 14; i++) out.push(['shell', 486 + Math.floor(r() * 50), 40 + Math.floor(r() * 380), i])
  for (let i = 0; i < 70 && out.length < 74; i++) { const x = 8 + Math.floor(r() * 440), y = 10 + Math.floor(r() * 420); if (free(x, y) && !out.some((o) => Math.abs(o[1] - x) < 20 && Math.abs(o[2] - y) < 22)) out.push([r() < 0.62 ? 'tree' : r() < 0.6 ? 'bush' : 'rock', x, y, i + 3, r() < 0.15 ? 1 : r() < 0.1 ? 2 : 0]) }
  return out
})()

// ---------- 主函数 ----------
export async function mountIsle(root, { toast, onOpen, user } = {}) {
  const say = (m, kind) => toast ? toast(m, kind) : console.log(m)
  await A.loadArt()
  // 服务端状态 + 本地队列
  let srv = null, rev = 0, coins = 0, prices = {}, day = '', season = 0, weather = 0, skew = 0
  let queue = [], inflight = false, lastPost = 0, flushTimer = 0, destroyed = false
  const now = () => Date.now() / 1000 + skew
  const pendingGot = [] // 等服务端揭晓的随机产出：{ k, x, y, kind }
  async function load() {
    const r = await fetch('/api/pet/world', { credentials: 'same-origin' })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || '小岛加载失败')
    accept(j)
  }
  function accept(j) {
    srv = j.state; rev = j.rev; coins = j.coins ?? coins
    if (j.prices) prices = j.prices
    if (j.now) skew = j.now - Date.now() / 1000
    day = R.worldDay(now()); season = R.seasonOf(day); weather = j.weather ?? R.weatherOf(day)
  }
  // 本地预测：把队列里的动作套在服务端状态上（随机结果用 0.5，只用于地块 / 体力 / D币等确定部分）
  let view = null, viewKey = ''
  function local() {
    const k = rev + ':' + queue.length + ':' + Math.floor(now() / 20) // 每 20 秒重算一次（体力回复、作物阶段）
    if (view && viewKey === k) return view
    const s = clone(srv), t = now()
    const r = R.applyActions(s, queue, { t, day: R.worldDay(t), rand: () => 0.5, prices, coins })
    view = { s, coins: coins - r.spend + r.earn, out: r.out }; viewKey = k
    return view
  }
  const dirty = () => { viewKey = ''; hudDirty = true }
  function push(action, fx) {
    const before = local()
    const s = clone(srv), t = now()
    const r = R.applyActions(s, [...queue, action], { t, day: R.worldDay(t), rand: () => 0.5, prices, coins })
    const o = r.out[r.out.length - 1]
    if (!o.ok) { sfx('fail'); bubbleSay(o.msg || '不行'); return null }
    if (o.spend && !['plant'].includes(action.a)) sfx('buy')
    queue.push(action); dirty()
    fx?.(o)
    schedule(['harvest', 'collect', 'trap', 'fish', 'mine'].includes(action.a) ? 0.4 : 3.5)
    if (queue.length >= R.WORLD.maxActions) schedule(0)
    return o
  }
  function schedule(delay) {
    clearTimeout(flushTimer)
    const wait = Math.max(delay, lastPost + R.WORLD.minGap + 0.15 - Date.now() / 1000)
    flushTimer = setTimeout(flush, wait * 1000)
  }
  async function flush() {
    if (inflight || !queue.length || destroyed) return
    const batch = queue.slice(0, R.WORLD.maxActions), op = uuid()
    inflight = true; lastPost = Date.now() / 1000
    try {
      let r, j
      for (let tries = 0; tries < 3; tries++) {
        r = await fetch('/api/pet/world/act', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rev, operation: op, actions: batch }) })
        j = await r.json().catch(() => ({}))
        if (r.status === 429) { await new Promise((ok) => setTimeout(ok, (j.retry || 2) * 1000 + 200)); continue }
        break
      }
      if (r.status === 409) { accept(j); queue = []; dirty(); say('小岛状态在别处变了，已同步最新', 'warn'); pendingGot.length = 0; return }
      if (!r.ok) throw new Error(j.error || '保存失败')
      queue = queue.slice(batch.length)
      accept(j); dirty()
      reveal(batch, j.out || [], j)
      if (j.autoLog && (j.autoLog.visits || j.autoLog.skipped)) autoReport(j.autoLog)
    } catch (e) {
      say(e.message || '网络不稳，稍后自动重试', 'err'); setTimeout(() => { inflight = false; schedule(3) }, 3000); return
    } finally { inflight = false }
    if (queue.length) schedule(0.2)
  }
  // 服务端结果揭晓：把「?」换成真实产出，飘字
  function reveal(batch, out, j) {
    out.forEach((o, k) => {
      const a = batch[k]
      if (!o) return
      const pend = pendingGot.findIndex((p) => p.a === a)
      const at = pend >= 0 ? pendingGot.splice(pend, 1)[0] : null
      if (!o.ok) { if (at) pop(at.x, at.y - 12, o.msg || '失败', '#ffb4b4'); return }
      if (o.got?.length) {
        const sx = at ? at.x : whaleX, sy = at ? at.y : whaleY - 20
        if (o.got.length) sfx('pop')
        o.got.forEach((g, i) => { if (g.new) { setTimeout(() => { sfx('new'); if (!task) act('cheer', 1100); pop(sx, sy - 40, `新发现：${R.ITEM_NAME[g.id] || g.id}！`, '#ffd75e'); for (let k = 0; k < 24; k++) parts.push({ x: sx, y: sy - 10, vx: Math.cos(k / 3.8) * 70, vy: Math.sin(k / 3.8) * 70 - 20, c: ['#ffd75e', '#fff', '#ff9db2'][k % 3], life: 0.8, g: 60 }); shake(3) }, 250) } flyItem(g.id, sx + i * 6, sy, g.q); pop(sx, sy - 18 - i * 10, `${R.ITEM_NAME[g.id] || g.id}${g.n > 1 ? '×' + g.n : ''}${g.q ? ' ' + '★'.repeat(g.q) : ''}`, g.q === 2 ? '#ffd75e' : g.q ? '#dfe8ff' : '#fff') })
        if (a.a === 'fish' && o.got[0]) { fishShow = { id: o.got[0].id, q: o.got[0].q, t: performance.now() }; if (R.FISH.find((f) => f.id === o.got[0].id)?.price >= 18000) { shake(6); act('cheer', 1100) } }
      } else if (a.a === 'fish') pop(at?.x ?? whaleX, (at?.y ?? whaleY) - 20, o.msg || '空军了…', '#cfe3ff')
      if (o.msg && o.got) pop(whaleX, whaleY - 40, o.msg, '#ffe9a8')
    })
    if (j.xp) pop(whaleX, whaleY - 30, `经验 +${j.xp}`, '#b7f0a0')
  }

  // ---------- DOM ----------
  const cv = el('canvas', { class: 'isle-cv' })
  const fxLayer = el('div', { class: 'isle-fx' })
  const bubble = el('div', { class: 'isle-bubble', hidden: true })
  const hudEnergy = el('div', { class: 'isle-en', role: 'meter', 'aria-label': '体力' }, el('i'), el('b'), el('small'))
  const restChip = el('button', { class: 'isle-rest-chip', type: 'button', title: '免费便当：体力直接回满（免费，每天 3 次）', 'aria-label': '免费便当，免费回满体力', onclick: (e) => { e.stopPropagation(); restNow() } }, '🍱', el('span'))
  const hudCoins = el('div', { class: 'isle-coins' }, el('img', { src: A.itemIcon('coin', 2), alt: '' }), el('b'))
  const hudTime = el('div', { class: 'isle-time' })
  const menuBtn = el('button', { class: 'isle-menu-btn', type: 'button', 'aria-label': '菜单', onclick: () => onOpen?.('menu') }, el('span'), el('span'), el('span'))
  const autoChip = el('button', { class: 'isle-auto-chip', type: 'button', title: '挂机管家', 'aria-label': '挂机管家', onclick: () => onOpen?.('auto') }, '🤖', el('span', { text: ' 管家' }))
  const hud = el('div', { class: 'isle-hud' }, el('div', { class: 'isle-hud-l' }, hudEnergy, restChip, hudCoins), el('div', { class: 'isle-hud-r' }, autoChip, hudTime, menuBtn))
  const hotbar = el('div', { class: 'isle-bar' })
  const chores = el('div', { class: 'isle-chores', 'aria-label': '批量农务' },
    el('button', { type: 'button', onclick: () => choresMenu('farm') }, '🌾 农田批量'),
    el('button', { type: 'button', onclick: () => choresMenu('barn') }, '🐄 牧场批量'))
  const hint = el('div', { class: 'isle-hint' })
  const wrap = el('div', { class: 'isle' }, cv, fxLayer, hud, chores, bubble, hint, hotbar)
  root.replaceChildren(wrap)
  const ctx = cv.getContext('2d')
  const whaleImg = new Image(); let whaleMeta = null
  const hiRes = () => !!whaleMeta && whaleImg.complete && whaleImg.naturalWidth > 0
  whaleImg.decoding = 'async'; whaleImg.src = '/pets/dsh/isle/whale.webp?v=1'
  fetch('/pets/dsh/isle/whale.json?v=1').then((r) => r.json()).then((m) => { whaleMeta = m }).catch(() => {})
  try { await load() } catch (e) { wrap.replaceChildren(el('div', { class: 'isle-error' }, el('b', { text: '小岛暂时打不开' }), el('p', { text: e.message }), el('button', { class: 'isle-btn', type: 'button', onclick: () => location.reload() }, '重试'))); return { destroy() {} } }

  // ---------- 场景资源 ----------
  const MAP = buildMap()
  // 能走的格子：陆地都能走；水面只有码头那一条能走（池塘、海都不行）。
  const DOCK_ROWS = [Math.floor(LAYOUT.dock.y / T), Math.floor((LAYOUT.dock.y + 26) / T)]
  const onDockTile = (tx, ty) => tx >= Math.floor(LAYOUT.dock.x / T) && tx < Math.floor(LAYOUT.dock.x / T) + LAYOUT.dock.len && ty >= DOCK_ROWS[0] && ty <= DOCK_ROWS[1]
  const walkable = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && (MAP[ty][tx] !== '~' || onDockTile(tx, ty))
  const walkableAt = (x, y) => walkable(Math.floor(x / T), Math.floor(y / T))
  // 目标在水里：就近找一个能站的格子，最多搜 14 格（海面最远离岸约 10 格）。
  function nearestLand(x, y, fromX, fromY) {
    if (walkableAt(x, y)) return [x, y]
    const tx = Math.floor(x / T), ty = Math.floor(y / T)
    let best = null, bd = Infinity
    for (let r = 1; r <= 14 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !walkable(tx + dx, ty + dy)) continue
      const cx = (tx + dx) * T + T / 2, cy = (ty + dy) * T + T / 2, d = Math.hypot(cx - x, cy - y) + Math.hypot(cx - fromX, cy - fromY) * 0.01
      if (d < bd) { bd = d; best = [cx, cy] }
    }
    return best || [fromX, fromY]
  }
  // 遍历线段经过的每个格子，不能跳过很窄的水角（固定像素步长会漏检）。
  function clearLine(x0, y0, x1, y1) {
    let x = Math.floor(x0 / T), y = Math.floor(y0 / T)
    const ex = Math.floor(x1 / T), ey = Math.floor(y1 / T), dx = x1 - x0, dy = y1 - y0
    const sx = Math.sign(dx), sy = Math.sign(dy)
    const stepX = dx ? T / Math.abs(dx) : Infinity, stepY = dy ? T / Math.abs(dy) : Infinity
    let nextX = dx ? ((sx > 0 ? (x + 1) * T : x * T) - x0) / dx : Infinity
    let nextY = dy ? ((sy > 0 ? (y + 1) * T : y * T) - y0) / dy : Infinity
    if (!walkable(x, y)) return false
    for (let guard = 0; guard < W + H + 4; guard++) {
      if (x === ex && y === ey) return true
      if (Math.abs(nextX - nextY) < 1e-10) {
        if (!walkable(x + sx, y) || !walkable(x, y + sy)) return false
        x += sx; y += sy; nextX += stepX; nextY += stepY
      } else if (nextX < nextY) { x += sx; nextX += stepX }
      else { y += sy; nextY += stepY }
      if (!walkable(x, y)) return false
    }
    return false
  }
  // A*（8 方向，不能斜穿水角），返回像素路点；再做一次视线平滑，路径不会一格一格地拐。
  function findPath(x0, y0, x1, y1) {
    if (clearLine(x0, y0, x1, y1)) return [[x1, y1]]
    const sx = Math.floor(x0 / T), sy = Math.floor(y0 / T), gx = Math.floor(x1 / T), gy = Math.floor(y1 / T)
    const key = (x, y) => y * W + x, open = [[sx, sy]], g = new Map([[key(sx, sy), 0]]), from = new Map(), closed = new Set()
    const hh = (x, y) => Math.hypot(x - gx, y - gy)
    let found = false
    for (let guard = 0; open.length && guard < 4000; guard++) {
      let bi = 0
      for (let i = 1; i < open.length; i++) if (g.get(key(...open[i])) + hh(...open[i]) < g.get(key(...open[bi])) + hh(...open[bi])) bi = i
      const [cx, cy] = open.splice(bi, 1)[0], ck = key(cx, cy)
      if (cx === gx && cy === gy) { found = true; break }
      closed.add(ck)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = cx + dx, ny = cy + dy, nk = key(nx, ny)
        if (!walkable(nx, ny) || closed.has(nk) || (dx && dy && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy)))) continue
        const ng = g.get(ck) + (dx && dy ? 1.414 : 1)
        if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); from.set(nk, ck); if (!open.some(([ox, oy]) => ox === nx && oy === ny)) open.push([nx, ny]) }
      }
    }
    if (!found) return []
    const cells = []
    for (let k = key(gx, gy); k !== key(sx, sy); k = from.get(k)) cells.push([(k % W) * T + T / 2, Math.floor(k / W) * T + T / 2])
    cells.reverse(); cells[cells.length - 1] = [x1, y1]
    const out = []
    let ax = x0, ay = y0
    for (let i = 0; i < cells.length; i++) {
      let j = cells.length - 1
      while (j > i && !clearLine(ax, ay, cells[j][0], cells[j][1])) j--
      out.push(cells[j]); [ax, ay] = cells[j]; i = j
    }
    return out
  }
  let terrain = null, tctx = null, terrainSeason = -1
  const bakeWorld = () => {
    terrain = A.bakeTerrain(MAP, W, H, 20261104, season); tctx = terrain.getContext('2d'); terrainSeason = season
  // 静态叠加：码头、围栏、点缀
  tctx.drawImage(A.bakeDock(LAYOUT.dock.len), LAYOUT.dock.x, LAYOUT.dock.y)
  tctx.drawImage(A.bakeFence(8, 5), LAYOUT.pasture.x, LAYOUT.pasture.y)
  const farmFence = A.bakeFence(9, 4); tctx.drawImage(farmFence, LAYOUT.farm.x - 8, LAYOUT.farm.y - 10)
  A.bakeDecor(tctx, DECOR.filter((d) => d[0] !== 'tree' && !(season === 3 && d[0] === 'flowers')))
  }
  bakeWorld()
  const waterTiles = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (MAP[y][x] === '~') waterTiles.push([x, y])
  let houseImg = A.bakeHouse(srv.tools.house), houseLv = srv.tools.house
  const statics = [
    { img: () => houseImg, x: LAYOUT.house.x, y: LAYOUT.house.y, z: LAYOUT.house.y + 66 },
    { img: A.bakeBarn(), x: LAYOUT.barn.x, y: LAYOUT.barn.y, z: LAYOUT.barn.y + 58 },
    { img: A.bakeStall(), x: LAYOUT.stall.x, y: LAYOUT.stall.y, z: LAYOUT.stall.y + 58 },
    { img: A.bakeBoard(), x: LAYOUT.board.x, y: LAYOUT.board.y, z: LAYOUT.board.y + 28 },
    { img: A.bakeGate(), x: LAYOUT.gate.x, y: LAYOUT.gate.y, z: LAYOUT.gate.y + 50 },
    { img: A.bakeMine(), x: LAYOUT.mine.x, y: LAYOUT.mine.y, z: LAYOUT.mine.y + 54 },
    { img: A.bakeAnvil(), x: LAYOUT.anvil.x, y: LAYOUT.anvil.y, z: LAYOUT.anvil.y + 18 },
    ...DECOR.filter((d) => d[0] === 'tree').map(([, x, y, sd, v]) => { const c = document.createElement('canvas'); c.width = 18; c.height = 30; A.bakeDecor(c.getContext('2d'), [['tree', 0, 0, sd, v]]); return { img: c, x, y, z: y + 27 } }),
    ...[[490, 60], [500, 130], [488, 330], [505, 400], [492, 196]].map(([x, y], k) => { const c = document.createElement('canvas'); c.width = 22; c.height = 34; A.bakeDecor(c.getContext('2d'), [['palm', 0, 0, 40 + k]]); return { img: c, x, y, z: y + 31 } }),
  ]
  // 摊位柜台前沿单独切一层，猫猫站在柜台后面露出上半身
  const stallFront = (() => { const full = A.bakeStall(), c = document.createElement('canvas'); c.width = full.width; c.height = full.height - 36; c.getContext('2d').drawImage(full, 0, -36); return c })()
  const LAMPS = [[132, 150], [300, 150], [452, 236], [LAYOUT.dock.x + 4, LAYOUT.dock.y - 2], [LAYOUT.dock.x + LAYOUT.dock.len * T - 8, LAYOUT.dock.y - 2], [140, 352]]
  const MAILBOX = [LAYOUT.house.x + 92, LAYOUT.house.y + 78]
  const ZONES = [['农田', 140, 30, 180, 90], ['小屋', 30, 10, 100, 100], ['牧场', 0, 140, 250, 120], ['集市', 260, 120, 160, 120], ['码头', 470, 120, 234, 200], ['矿洞', 0, 290, 170, 120], ['擂台门楼', 370, 200, 80, 70]]
  // 离线小结：上次离开后发生了什么（放进信箱）
  const mail = (() => {
    const t = now(), s = srv, lines = []
    const ripe = s.plots.filter((p, i) => p && R.cropStage(p, t, R.sprinkled(s, i) || weather === 1).stage === 3).length
    const dead = s.plots.filter((p) => p && R.cropStage(p, t).stage === -1).length
    const eggs = s.barn.reduce((n, a) => n + R.animalReady(a, t).n, 0), hungry = s.barn.filter((a) => !R.animalReady(a, t).fed).length
    const crabs = s.traps.reduce((n, tr) => n + R.trapReady(tr, t, weather === 2).n, 0)
    if (ripe) lines.push(`🌾 ${ripe} 块地成熟了`)
    if (dead) lines.push(`🥀 ${dead} 块地的作物过季枯萎了，清掉重种吧`)
    if (eggs) lines.push(`🥚 窝里攒了 ${eggs} 个产物`)
    if (hungry) lines.push(`🍽 ${hungry} 只动物饿了，喂了才会继续产出`)
    if (crabs) lines.push(`🦀 蟹笼里有 ${crabs} 条鱼`)
    const dow = new Date((t + 8 * 3600) * 1000).getUTCDay()
    if (dow === 0) lines.push(`🍂 明天（周一）换成${R.SEASONS[(season + 1) % 4]}季，不是${R.SEASONS[(season + 1) % 4]}季的作物会枯萎`)
    const top = Object.keys(prices).map((id) => [id, prices[id] / R.BASE_PRICE[id]]).sort((a, b) => b[1] - a[1])[0]
    if (top && top[1] > 1.3) lines.push(`📈 今天${R.ITEM_NAME[top[0]]}很抢手（${Math.round(top[1] * 100)}% 基础价）`)
    return lines
  })()
  let mailRead = !mail.length
  // 新人礼（每个账号一次 100 万 D币）：第一次进来弹卡片；没领之前信箱一直挂着「!」
  let giftOpen = !srv.gift, claiming = false
  async function claimGift(card) {
    if (claiming || !giftOpen) return
    claiming = true
    try {
      for (let k = 0; k < 40 && (inflight || queue.length); k++) { if (queue.length && !inflight) await flush(); else await new Promise((ok) => setTimeout(ok, 150)) }
      const r = await fetch('/api/pet/world/welcome', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: uuid() }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || '领取失败，稍后再试')
      accept(j); dirty(); giftOpen = false; card?.remove(); closeBubble()
      if (j.ok) { coinBurst(j.gift); sfx('new'); act('cheer', 1200); shake(4); pop(whaleX, whaleY - 56, `新人礼 +${fmt(j.gift)} D币`, '#ffd75e'); say(`新人礼 ${fmt(j.gift)} D币 已到账`, 'ok') }
      else say('新人礼已经领过了', 'warn')
    } catch (e) { say(e.message || '领取失败', 'err') } finally { claiming = false }
  }
  // ---------- 挂机管家：回来时补算、报告 ----------
  async function autoPost(config) {
    for (let k = 0; k < 40 && (inflight || queue.length); k++) { if (queue.length && !inflight) await flush(); else await new Promise((ok) => setTimeout(ok, 150)) }
    inflight = true
    try {
      for (let tries = 0; tries < 3; tries++) {
        const r = await fetch('/api/pet/world/auto', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rev, operation: uuid(), config }) })
        const j = await r.json().catch(() => ({}))
        if (r.status === 429) { await new Promise((ok) => setTimeout(ok, (j.retry || 2) * 1000 + 200)); continue }
        if (r.status === 409) { accept(j); dirty(); continue }
        if (!r.ok) throw new Error(j.error || '管家没听懂')
        accept(j); dirty(); lastPost = Date.now() / 1000
        if (j.autoLog && (j.autoLog.visits || j.autoLog.skipped)) autoReport(j.autoLog)
        return j
      }
      throw new Error('稍后再试')
    } finally { inflight = false; drawBar() }
  }
  function autoReport(L) {
    wrap.querySelector('.isle-gift.report')?.remove()
    const items = Object.entries(L.got).sort((a, b) => (R.BASE_PRICE[b[0]] || 0) * b[1] - (R.BASE_PRICE[a[0]] || 0) * a[1]).slice(0, 12)
    const hours = Math.round((L.to - L.from) / 3600) + R.AUTO.every / 3600
    const card = el('div', { class: 'isle-gift report', role: 'dialog', 'aria-label': '管家报告' },
      el('div', { class: 'isle-gift-box' },
        el('div', { class: 'isle-gift-ic', text: '🤖' }),
        el('b', { text: '管家报告' }),
        el('p', { text: L.visits ? `你不在的这 ${hours} 小时里，管家巡视了 ${L.visits} 轮` + (L.skipped ? `（${L.skipped} 轮付不起工钱歇着了）` : '') : `D币不够付工钱，管家歇了 ${L.skipped} 轮` }),
        items.length ? el('div', { class: 'isle-report-items' }, items.map(([id, n]) => el('span', { class: 'isle-chip' }, el('img', { src: A.itemIcon(id, 2), alt: '' }), '×' + n))) : null,
        el('div', { class: 'isle-report-sum' },
          el('span', {}, '卖货收入', el('b', { class: 'up', text: '+' + fmt(L.earn) })),
          el('span', {}, `种子 · 饲料 · 工钱`, el('b', { class: 'down', text: '−' + fmt(L.spend) })),
          el('span', { class: 'net' }, '净赚', el('b', { class: L.earn >= L.spend ? 'up' : 'down', text: (L.earn >= L.spend ? '+' : '−') + fmt(Math.abs(L.earn - L.spend)) }))),
        el('small', { class: 'isle-note', text: '货没卖完的话在背包里，价格低于你设的门槛时管家会先囤着。' }),
        el('div', { class: 'isle-gift-btns' }, btn('知道了', () => card.remove()), btn('调整策略', () => { card.remove(); onOpen?.('auto') }, { cls: 'ghost' }))))
    wrap.append(card)
    if (L.earn > L.spend) coinBurst(L.earn - L.spend)
  }
  function giftCard() {
    if (!giftOpen || wrap.querySelector('.isle-gift')) return
    const card = el('div', { class: 'isle-gift', role: 'dialog', 'aria-label': '新人礼' },
      el('div', { class: 'isle-gift-box' },
        el('div', { class: 'isle-gift-ic', text: '🎁' }),
        el('b', { text: '欢迎来到🌟🐟谷！' }),
        el('p', {}, '新人礼 ', el('strong', { text: `${fmt(R.WELCOME_GIFT)} D币` }), '，拿去开垦、买动物、升级工具吧。'),
        el('div', { class: 'isle-gift-btns' }, btn('领取', () => claimGift(card)), btn('稍后（在信箱里领）', () => card.remove(), { cls: 'ghost' }))))
    wrap.append(card)
  }
  // 动物在牧场里闲逛（只是表现，位置不存服务端）
  const critters = []
  const syncCritters = (s) => {
    while (critters.length > s.barn.length) critters.pop()
    for (let i = critters.length; i < s.barn.length; i++) critters.push({ x: LAYOUT.pasture.x + 20 + Math.random() * (LAYOUT.pasture.w - 50), y: LAYOUT.pasture.y + 18 + Math.random() * (LAYOUT.pasture.h - 40), tx: 0, ty: 0, wait: Math.random() * 3, flip: Math.random() < 0.5, hop: 0 })
  }

  // ---------- 镜头 ----------
  let scale = 3, vw = 0, vh = 0, camX = 0, camY = 0, dpr = 1, forceScale = 0
  const buf = document.createElement('canvas'), bctx = buf.getContext('2d'), fbuf = document.createElement('canvas'), fctx = fbuf.getContext('2d')
  function resize() {
    const r = wrap.getBoundingClientRect()
    dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr)
    // 手机竖屏大约看到 13 格宽；电脑看到更多
    // 手机大约看到 16 格宽，电脑 34 格（几乎整岛），镜头少动
    scale = forceScale || Math.max(2, Math.floor((r.width * dpr) / (16 * (r.width < 700 ? 15 : 34))))
    vw = Math.ceil(cv.width / scale); vh = Math.ceil(cv.height / scale)
    buf.width = Math.ceil((vw + 2) * scale); buf.height = Math.ceil((vh + 2) * scale); fbuf.width = buf.width; fbuf.height = buf.height
    clampCam()
  }
  const clampCam = () => { const ww = scene === 'cave' ? CAVE_W * T : W * T, hh = scene === 'cave' ? CAVE_H * T : H * T; camX = Math.max(0, Math.min(ww - vw, camX)); camY = Math.max(0, Math.min(hh - vh, camY)); if (ww < vw) camX = -(vw - ww) / 2; if (hh < vh) camY = -(vh - hh) / 2 }
  const toWorld = (cx, cy) => { const r = cv.getBoundingClientRect(); return [((cx - r.left) * dpr) / scale + camX, ((cy - r.top) * dpr) / scale + camY] }
  const toScreen = (x, y) => [((x - camX) * scale) / dpr, ((y - camY) * scale) / dpr]
  let follow = true

  // ---------- 主角 ----------
  let whaleX = LAYOUT.house.door[0], whaleY = LAYOUT.house.door[1] + 10, whaleFlip = false, walkT = 0, blinkT = 3
  let pose = null // { kind, t0, dur }
  const tasks = [] // { x, y, run }
  let task = null
  function goDo(x, y, run, near = 10) { tasks.push({ x, y, run, near }); if (tasks.length > 60) tasks.splice(0, tasks.length - 60) }
  let zoneName = '', zoneT = 0
  const banner = el('div', { class: 'isle-zone' })
  function checkZone() {
    if (scene !== 'isle') return
    const z = ZONES.find(([, x, y, w, h]) => whaleX >= x && whaleX < x + w && whaleY >= y && whaleY < y + h)?.[0] || ''
    if (z && z !== zoneName && performance.now() - zoneT > 1500) { zoneName = z; zoneT = performance.now(); banner.textContent = z; banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show') }
    if (!z) zoneName = ''
  }
  function stepWhale(dt) {
    if (pose && performance.now() - pose.t0 > pose.dur) pose = null
    if (pose) return
    if (!task) task = tasks.shift() || null
    if (!task) return
    if (!task.path) {
      if (scene === 'isle') { const [lx, ly] = nearestLand(task.x, task.y, whaleX, whaleY); task.path = findPath(whaleX, whaleY, lx, ly); task.gx = lx; task.gy = ly }
      else { task.path = [[task.x, task.y]]; task.gx = task.x; task.gy = task.y }
      if (!task.path.length) { task = null; bubbleSay('这边走不过去，换个落脚点吧'); return }
    }
    const total = Math.hypot(task.gx - whaleX, task.gy - whaleY)
    const reached = total <= task.near || (task.gx !== task.x || task.gy !== task.y) && total <= 2
    if (reached || !task.path.length) { const t = task; task = null; t.run?.(); return }
    const [px, py] = task.path[0], dx = px - whaleX, dy = py - whaleY, d = Math.hypot(dx, dy)
    const last = task.path.length === 1, stop = last ? Math.min(task.near, Math.max(0, d - 0.01)) : 0
    if (d <= Math.max(1, stop)) { task.path.shift(); return }
    const sp = (total > 160 ? 230 : 130) * dt * (tasks.length > 2 ? 1.5 : 1) // 远了就跑
    const mv = Math.min(sp, d - stop + 0.01), nx = whaleX + (dx / d) * mv, ny = whaleY + (dy / d) * mv
    // 保险：这一步会落进水里就不走（地图外或路径算错时不至于站到海上）
    if (scene !== 'isle' || walkableAt(nx, ny)) { whaleX = nx; whaleY = ny } else { task = null; bubbleSay('前面是水，换条路走吧'); return }
    if (Math.abs(dx) > 1) whaleFlip = dx < 0
    walkT += dt
  }
  const act = (kind, ms = 380) => { pose = { kind, t0: performance.now(), dur: ms } }

  // ---------- 特效 ----------
  const parts = [] // 像素粒子 {x,y,vx,vy,c,life}
  const pops = [] // 飘字 DOM
  let shakeT = 0
  const shake = (n) => { shakeT = n }
  const puff = (x, y, colors, n = 8, up = 30) => { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * up - 10, c: colors[i % colors.length], life: 0.5 + Math.random() * 0.4, g: 90 }) }
  function pop(x, y, text, color = '#fff') {
    const [sx, sy] = toScreen(x, y)
    const n = el('div', { class: 'isle-pop', style: `left:${sx}px;top:${sy}px;color:${color}` }, text)
    fxLayer.append(n); setTimeout(() => n.remove(), 1500)
  }
  function flyItem(id, x, y, q) {
    const [sx, sy] = toScreen(x, y)
    const n = el('img', { class: 'isle-fly' + (q === 2 ? ' gold' : ''), src: A.itemIcon(id, 3), style: `left:${sx - 16}px;top:${sy - 16}px` })
    fxLayer.append(n)
    requestAnimationFrame(() => { n.style.transform = `translate(${-sx + 40}px, ${innerHeight - sy}px) scale(.4)`; n.style.opacity = '0.2' })
    setTimeout(() => n.remove(), 900)
  }
  function coinBurst(n) {
    const c = hudCoins.getBoundingClientRect(), w = wrap.getBoundingClientRect()
    for (let i = 0; i < Math.min(8, 2 + Math.log10(n + 1) * 1.5); i++) {
      const img = el('img', { class: 'isle-coinfly', src: A.itemIcon('coin', 2), style: `left:${w.width / 2 + (Math.random() - 0.5) * 80}px;top:${w.height / 2 + (Math.random() - 0.5) * 40}px;transition-delay:${i * 40}ms` })
      fxLayer.append(img)
      requestAnimationFrame(() => requestAnimationFrame(() => { img.style.left = c.left - w.left + 8 + 'px'; img.style.top = c.top - w.top + 4 + 'px'; img.style.opacity = '0.4' }))
      setTimeout(() => img.remove(), 900 + i * 40)
    }
    hudCoins.classList.remove('bump'); void hudCoins.offsetWidth; hudCoins.classList.add('bump'); sfx('coin')
  }
  const marks = [] // 点地面时的落点标记
  const puffTap = (x, y) => marks.push({ x, y, t: 0 })
  function bubbleSay(text) { pop(whaleX, whaleY - (hiRes() ? 52 : 34), text, '#ffd2d2') }

  // ---------- 场景物体的命中区 ----------
  function hitIsle(x, y) {
    const s = local().s
    for (let i = 0; i < R.WORLD.plotsMax; i++) { const [px, py] = plotXY(i); if (x >= px && x < px + 16 && y >= py && y < py + 16) return { kind: i < s.plotN ? 'plot' : 'lockedPlot', i } }
    for (let i = critters.length - 1; i >= 0; i--) { const c = critters[i]; if (Math.abs(x - c.x) < 11 && y > c.y - 16 && y < c.y + 4) return { kind: 'animal', i } }
    for (let i = 0; i < R.WORLD.trapMax; i++) { const [tx, ty] = TRAP_POS[i]; if (Math.abs(x - tx) < 12 && Math.abs(y - ty) < 12) return { kind: i < s.traps.length ? 'trap' : 'trapSlot', i } }
    const L = LAYOUT
    const box = (o, w, h) => x >= o.x && x < o.x + w && y >= o.y && y < o.y + h
    if (Math.abs(x - L.stall.cat[0]) < 30 && y > L.stall.y && y < L.stall.y + 86) return { kind: 'market' }
    if (Math.abs(x - MAILBOX[0] - 1) < 8 && y > MAILBOX[1] - 32 && y < MAILBOX[1] + 2) return { kind: 'mail' }
    if (box(L.house, 80, 70)) return { kind: 'house' }
    if (box(L.barn, 72, 62)) return { kind: 'barn' }
    if (box(L.board, 28, 30)) return { kind: 'board' }
    if (box(L.gate, 48, 50)) return { kind: 'gate' }
    if (box(L.mine, 64, 56)) return { kind: 'mine' }
    if (box(L.anvil, 28, 22)) return { kind: 'anvil' }
    const onDock = x > L.dock.x && x < L.dock.x + L.dock.len * T && y > L.dock.y && y < L.dock.y + 30
    if (onDock && x > L.dock.x + L.dock.len * T - 28) return { kind: 'fish' } // 码头尽头
    if (!onDock && x > 520 && MAP[Math.floor(y / T)]?.[Math.floor(x / T)] === '~' && Math.abs(y - L.dock.y - 14) < 70) return { kind: 'fish' } // 码头边的水面
    if (onDock) return null
    return null
  }

  // ---------- 农田 ----------
  let seed = (R.CROPS.find((c) => c.seasons.includes(season)) || R.CROPS[0]).id
  const bulkCandidates = (kind) => {
    const s = local().s, t = now(), todo = []
    if (['harvest','water','plant','clear'].includes(kind)) {
      for (let i = 0; i < s.plotN; i++) {
        const p = s.plots[i], auto = R.sprinkled(s,i) || weather === 1, st = p && R.cropStage(p,t,auto)
        if (kind === 'harvest' && st?.stage === 3 || kind === 'clear' && st?.stage === -1 || kind === 'water' && st && st.stage >= 0 && st.stage < 3 && !auto && p.w <= st.stage || kind === 'plant' && !p) todo.push({a:kind,i,...(kind==='plant'?{c:seed}:{})})
      }
    } else s.barn.forEach((p,i) => {
      if (kind === 'collect' && R.animalReady(p,t).ready || kind === 'feed' && R.animalReady(p,t).stage!=='retired' && R.animalReady(p,t).feedLeft<16*3600 || kind === 'pet' && !s.cnt['pet'+i]) todo.push({a:kind,i})
    })
    return todo
  }
  function bulkDo(kind, area) {
    if (task || tasks.length || queue.length || inflight) return say('先等当前操作完成，再一键处理')
    closeBubble(); follow = true; fishing = null; setZone('isle')
    const target = area === 'farm' ? [LAYOUT.farm.x+64,LAYOUT.farm.y+60] : [LAYOUT.pasture.x+60,LAYOUT.pasture.y+50]
    goDo(...target, () => {
      const todo = bulkCandidates(kind)
      if (!todo.length) return bubbleSay('现在没有需要处理的项目')
      let done=0
      for (const action of todo) {
        const o=push(action)
        if (!o) break
        done++
        if (kind==='harvest'||kind==='collect') pendingGot.push({a:action,x:whaleX,y:whaleY-16})
      }
      if (done) { act(kind==='water'?'can':kind==='feed'?'hug':'pick',700); sfx('harvest'); bubbleSay('已处理 '+done+' 项'+(done<todo.length?'，体力、饲料或余额不足，剩余保留':'')) }
    }, 10)
  }
  function choresMenu(area) {
    if (scene !== 'isle') return
    const pairs = area==='farm' ? [['harvest','一键收获'],['water','一键浇水'],['plant','空地补种'],['clear','清理枯萎']] : [['collect','一键收产物'],['feed','一键喂食'],['pet','一键摸摸']]
    const anchor = area==='farm' ? [LAYOUT.farm.x+72,LAYOUT.farm.y+60] : [LAYOUT.pasture.x+72,LAYOUT.pasture.y+35]
    bubbleAt(...anchor, [el('b',{text:area==='farm'?'农田批量操作':'牧场批量操作'}),
      ...pairs.map(([k,label])=>{const n=bulkCandidates(k).length;return btn(label+' · '+n+' 项',()=>bulkDo(k,area),{disabled:!n})}),
      el('small',{text:area==='farm'?'补种使用下方当前选中的种子；按实际体力与余额处理。':'仅使用已有饲料，不自动购买；不会重复领取产物。'})],true)
  }
  function plotAction(i, viaDrag) {
    const s = local().s, p = s.plots[i], [px, py] = plotXY(i), t = now()
    const go = (fn) => goDo(px + 8, py + 14, fn, 12)
    if (!p) {
      const crop = R.CROPS.find((c) => c.id === seed)
      if (!crop.seasons.includes(season)) return bubbleSay(`${crop.name}不是这个季节的`)
      go(() => { if (local().s.plots[i]) return; act('hoe', 420); push({ a: 'plant', i, c: seed }, () => sfx('plant') || puff(px + 8, py + 10, [A.C.s2, A.C.s4, A.C.d3], 7)) })
      return
    }
    const auto = R.sprinkled(s, i) || weather === 1
    const st = R.cropStage(p, t, auto)
    if (st.stage === -1) return go(() => { act('hoe'); push({ a: 'clear', i }, () => puff(px + 8, py + 8, [A.C.d2, '#9a6538'], 6)) })
    if (st.stage === 3) return go(() => { act('pick', 420); const o = push({ a: 'harvest', i }, () => sfx('harvest') || puff(px + 8, py + 6, ['#fff6a8', '#ffffff', A.C.l4], 10, 45)); if (o) pendingGot.push({ a: queue[queue.length - 1], x: px + 8, y: py }) })
    if (!auto && p.w <= st.stage) return go(() => { act('can', 520); push({ a: 'water', i }, () => { sfx('water'); for (let k = 0; k < 8; k++) parts.push({ x: px + 4 + Math.random() * 8, y: py - 2, vx: 0, vy: 30 + Math.random() * 20, c: A.C.w4, life: 0.35, g: 120 }) }) })
    if (!viaDrag) bubbleAt(px + 8, py, [el('b', { text: R.ITEM_NAME[p.c] }), el('span', { text: `还要 ${dur(st.left)}` + (p.h ? ` · 第 ${p.h + 1} 茬` : '') }), auto ? el('small', { text: weather === 1 ? '今天下雨，自动浇水' : '洒水器自动浇水' }) : el('small', { text: '这阶段已经浇过水' })])
  }

  // ---------- 气泡（场景里弹出的小面板） ----------
  let bubbleAnchor = null
  // 手机上点场景弹出气泡时，同一下触摸随后还会派发一次 click，可能正好落在刚弹出的按钮上（例如误买动物）。
  // 气泡刚打开的 0.45 秒内吞掉所有点击。
  let bubbleOpenedAt = 0
  bubble.addEventListener('click', (e) => { if (performance.now() - bubbleOpenedAt < 450) { e.stopPropagation(); e.preventDefault() } }, true)
  function bubbleAt(x, y, kids, sticky = false) {
    bubbleOpenedAt = performance.now()
    bubble.replaceChildren(...kids); bubble.hidden = false; bubbleAnchor = [x, y]; bubble.dataset.sticky = sticky ? '1' : ''
    placeBubble()
  }
  function placeBubble() {
    if (!bubbleAnchor || bubble.hidden) return
    const [sx, sy] = toScreen(...bubbleAnchor), w = wrap.clientWidth
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight
    bubble.style.left = Math.max(8, Math.min(w - bw - 8, sx - bw / 2)) + 'px'
    bubble.style.top = Math.max(52, sy - bh - 14) + 'px'
  }
  const closeBubble = () => { bubble.hidden = true; bubbleAnchor = null }
  const btn = (label, onclick, extra = {}) => el('button', { class: 'isle-btn' + (extra.cls ? ' ' + extra.cls : ''), type: 'button', disabled: extra.disabled, onclick: (e) => { e.stopPropagation(); onclick() } }, label)
  const priceTag = (n) => el('span', { class: 'isle-price' }, el('img', { src: A.itemIcon('coin', 2), alt: '' }), short(n))

  function onHit(h, x, y) {
    const s = local().s
    if (!h) { tasks.length = 0; task = null; goDo(x, y, null, 2); closeBubble(); puffTap(x, y); return }
    closeBubble()
    if (h.kind === 'plot') return plotAction(h.i, false)
    if (h.kind === 'lockedPlot') {
      const [px, py] = plotXY(h.i), price = R.WORLD.plotPrice(s.plotN + 1)
      return bubbleAt(px + 8, py, [el('b', { text: '开垦新地块' }), el('span', { text: `第 ${s.plotN + 1} 块（共 ${R.WORLD.plotsMax} 块）` }), btn(['开垦 ', priceTag(price)], () => { push({ a: 'expand', k: 'plot' }, () => { puff(px + 8, py + 8, [A.C.s3, A.C.g4], 12); say('开垦好了，可以种了', 'ok') }); closeBubble() }, { disabled: local().coins + (s.constructionCredit || 0) < price })])
    }
    if (h.kind === 'animal') return animalAction(h.i)
    if (h.kind === 'trap') return trapAction(h.i)
    if (h.kind === 'trapSlot') { const [tx, ty] = TRAP_POS[h.i], price = R.WORLD.trapPrice(s.traps.length + 1); return bubbleAt(tx, ty, [el('b', { text: '放一个蟹笼' }), el('span', { text: `每 ${R.WORLD.trapEvery / 60} 小时自动抓 1 条小鱼，最多攒 ${R.WORLD.trapCap} 条；刮风天翻倍。` }), btn(['放下 ', priceTag(price)], () => { push({ a: 'buyTrap' }, () => puff(tx, ty, [A.C.w4, '#fff'], 10)); closeBubble() }, { disabled: local().coins < price })]) }
    if (h.kind === 'market') return goDo(LAYOUT.stall.cat[0], LAYOUT.stall.y + 72, () => onOpen?.('market'), 6)
    if (h.kind === 'mail') { mailRead = true; return bubbleAt(MAILBOX[0], MAILBOX[1] - 18, [el('b', { text: '信箱' }), giftOpen ? el('div', { class: 'isle-up' }, el('div', {}, el('b', { text: '🎁 新人礼' }), el('small', { text: `${fmt(R.WELCOME_GIFT)} D币，每个账号一次` })), btn('领取', () => claimGift())) : null, ...(mail.length ? mail.map((m) => el('span', { text: m })) : giftOpen ? [] : [el('span', { text: '没有新消息' })])], !!giftOpen) }
    if (h.kind === 'house') return houseMenu()
    if (h.kind === 'barn') return barnMenu()
    if (h.kind === 'anvil') return goDo(LAYOUT.anvil.x + 14, LAYOUT.anvil.y + 26, anvilMenu, 8)
    if (h.kind === 'board') return goalsMenu()
    if (h.kind === 'gate') return goDo(LAYOUT.gate.x + 24, LAYOUT.gate.y + 54, () => onOpen?.('battle'), 8)
    if (h.kind === 'mine') return goDo(LAYOUT.mine.door[0], LAYOUT.mine.door[1] + 4, enterCave, 6)
    if (h.kind === 'fish') return startFishing()
  }

  // ---------- 牧场 ----------
  function animalAction(i) {
    const c=critters[i],pen=local().s.barn[i]
    if(!pen||!c)return
    goDo(c.x-10,c.y+2,()=>{
      const s2=local().s,p2=s2.barn[i];if(!p2||p2.k!==pen.k)return
      const st=R.animalReady(p2,now()),def=st.def,feed=def.feed||1
      whaleFlip=false;c.hop=.4
      if(st.ready){act('hug',700);const o=push({a:'collect',i});if(o)pendingGot.push({a:queue[queue.length-1],x:c.x,y:c.y-14});return}
      const stateText=st.stage==='retired'?'已退休，生产次数用完了':!st.fed?'饿着肚子，成长和生产暂停':st.stage==='young'?'成长中，持续喂饱后约 '+dur(st.matureLeft)+' 成熟':'下一批还要 '+dur(st.left)
      const children=[el('b',{text:def.name+' · '+({young:'幼年',mature:'成熟',retired:'退休'}[st.stage]||'养成中')}),el('span',{text:stateText}),el('small',{text:'剩余 '+(st.remaining??'—')+' / '+(def.lifetime??'—')+' 次生产 · 心情 '+p2.m})]
      if(def.products)children.push(el('small',{text:'产物：'+def.products.map(p=>p.name).join('、')}))
      if(st.stage!=='retired')children.push(btn('补粮 · '+feed+' 份饲料',()=>{const o=push({a:'feed',i});if(o){act('hug',700);closeBubble();pop(c.x,c.y-20,'吃饱啦','#fff')}},{disabled:(s2.inv.feed?.[0]||0)<feed||(st.feedLeft??0)>=16*3600}))
      if(!s2.cnt['pet'+i])children.push(btn('摸摸它',()=>{push({a:'pet',i},()=>{act('hug',700);puff(c.x,c.y-15,['#efb5bf'],5)});closeBubble()}))
      children.push(sellBtn(def,i))
      bubbleAt(c.x,c.y-16,children,true)
    },4)
  }
  const hearts = []
  // 卖动物要点两下（第一下变成「确定卖掉？」），不弹系统对话框
  function sellBtn(def, i) {
    let armed = false
    const b = btn(['卖掉 ', priceTag(R.animalSaleValue(local().s.barn[i], now()))], () => {
      if (!armed) { armed = true; b.textContent = `确定卖掉这只${def.name}？`; b.classList.add('danger'); setTimeout(() => { armed = false }, 4000); return }
      push({ a: 'sellAnimal', i }, () => { syncCritters(local().s); say(`${def.name}被卖掉了`, 'ok') }); closeBubble()
    }, { cls: 'ghost' })
    return b
  }
  function barnMenu() {
    const s = local().s, money = local().coins + (s.constructionCredit || 0)
    const full = s.barn.length >= s.barnN
    bubbleAt(LAYOUT.barn.x + 36, LAYOUT.barn.y + 10, [
      el('b', { text: `畜栏 ${s.barn.length}/${s.barnN}` }),
      el('small', { text: '建设额度 '+fmt(s.constructionCredit||0)+' · 可抵扣动物、扩建和工具，不可提现' }),
      el('div', { class: 'isle-shop' }, R.ANIMALS.map((a) => el('button', { class: 'isle-shop-item', type: 'button', disabled: full || money < a.price, onclick: (e) => { e.stopPropagation(); push({ a: 'buyAnimal', k: a.id }, () => { syncCritters(local().s); say(`${a.name}住进来了！`, 'ok') }); closeBubble() } },
        el('canvas', { class: 'isle-shop-pic', width: 64, height: 64, 'data-animal': a.id }),
        el('b', { text: a.name }), el('small', { text: `喂养 ${a.mature} 有效小时成熟 · 共 ${a.lifetime} 次 · 每餐 ${a.feed} 份饲料` }), priceTag(a.price)))),
      s.barnN < R.WORLD.barnMax ? btn(['扩建畜栏 ', priceTag(R.WORLD.barnPrice(s.barnN + 1))], () => { push({ a: 'expand', k: 'barn' }, () => say('畜栏扩建好了', 'ok')); closeBubble() }, { disabled: money < R.WORLD.barnPrice(s.barnN + 1), cls: 'ghost' }) : null,
    ], true)
    bubble.querySelectorAll('canvas[data-animal]').forEach((c) => { const g = c.getContext('2d'), img = A.ANIMAL[c.dataset.animal][0]; g.drawImage(img.hiRes || img, 0, 0, c.width, c.height) })
    placeBubble()
  }
  function trapAction(i) {
    const [tx, ty] = TRAP_POS[i], s = local().s, st = R.trapReady(s.traps[i], now(), weather === 2)
    goDo(Math.min(tx, LAYOUT.dock.x + LAYOUT.dock.len * T - 10), LAYOUT.dock.y + 14, () => {
      if (!st.n) return bubbleAt(tx, ty, [el('b', { text: '蟹笼' }), el('span', { text: `下一条还要 ${dur(st.left)}` }), el('small', { text: `最多攒 ${R.WORLD.trapCap} 条` })])
      act('pick', 300); const o = push({ a: 'trap', i }, () => puff(tx, ty, [A.C.w4, '#fff'], 10, 40)); if (o) pendingGot.push({ a: queue[queue.length - 1], x: tx, y: ty })
    }, 8)
  }
  // ---------- 公告栏：每日目标 ----------
  const goalState = (s) => R.dailyGoals(day).map((g, k) => ({ g, k, have: Math.min(g.n, s.cnt[g.id] || 0), done: (s.cnt[g.id] || 0) >= g.n, claimed: !!s.cnt['goal' + k] }))
  const claimable = (s) => { const gs = goalState(s); return gs.some((x) => x.done && !x.claimed) || (gs.every((x) => x.claimed) && !s.cnt.goal3) }
  function goalsMenu() {
    const s = local().s, gs = goalState(s)
    const row = (x) => el('div', { class: 'isle-goal' + (x.claimed ? ' claimed' : '') },
      el('div', {}, el('b', { text: `${x.g.name} ${x.g.id === 'sold' ? short(x.have) + '/' + short(x.g.n) : x.have + '/' + x.g.n}` }), el('i', { class: 'isle-goal-bar' }, el('i', { style: `width:${(x.have / x.g.n) * 100}%` }))),
      x.claimed ? el('small', { text: '已领' }) : btn(['领 ', priceTag(R.GOAL_REWARD)], () => { push({ a: 'goal', k: x.k }, (o) => { coinBurst(o.earn); pop(LAYOUT.board.x + 14, LAYOUT.board.y - 6, '+' + fmt(o.earn), '#ffd75e') }); goalsMenu() }, { disabled: !x.done }))
    const all = gs.every((x) => x.claimed)
    bubbleAt(LAYOUT.board.x + 14, LAYOUT.board.y, [
      el('b', { text: '今日目标' }), el('small', { text: '每天 0 点换一批，全站一样' }),
      ...gs.map(row),
      el('div', { class: 'isle-goal' + (s.cnt.goal3 ? ' claimed' : '') }, el('div', {}, el('b', { text: '全部完成奖励' })), s.cnt.goal3 ? el('small', { text: '已领' }) : btn(['领 ', priceTag(R.GOAL_BONUS)], () => { push({ a: 'goal', k: 3 }, (o) => { coinBurst(o.earn); shake(3); sfx('new') }); goalsMenu() }, { disabled: !all })),
      btn('玩法说明', () => { closeBubble(); onOpen?.('guide') }, { cls: 'ghost' }),
    ], true)
  }

  // ---------- 小屋 / 铁匠铺 ----------
  function restNow() {
    const s = local().s, max = R.energyMax(s), left = R.WORLD.daily.rest - (s.cnt.rest || 0)
    if (left <= 0) return say(`今天的 ${R.WORLD.daily.rest} 次免费回满用完了，明天 0 点再来`)
    if (s.en >= max) return say('体力是满的，不用吃便当')
    act('cheer', 700)
    push({ a: 'rest' }, () => { pop(whaleX, whaleY - (hiRes() ? 56 : 36), '体力回满！', '#b7f0a0'); sfx('new'); puff(whaleX, whaleY - 20, ['#b7f0a0', '#fff', '#ffd75e'], 14, 50) })
    closeBubble()
  }
  const restButton = (s) => {
    const left = R.WORLD.daily.rest - (s.cnt.rest || 0), full = s.en >= R.energyMax(s)
    return left > 0
      ? btn(`🍱 免费便当：体力回满（免费，今天还剩 ${left} 次）`, restNow, { disabled: full })
      : el('small', { text: `今天 ${R.WORLD.daily.rest} 次免费回满已用完，明天再来` })
  }
  function houseMenu() {
    const s = local().s, money = local().coins + (s.constructionCredit || 0), price = R.upgradePrice(s, 'house')
    const eats = Object.entries(s.inv).filter(([id]) => R.CROPS.some((c) => c.id === id)).flatMap(([id, qs]) => qs.map((n, q) => (n ? { id, q, n } : null)).filter(Boolean)).slice(0, 6)
    bubbleAt(LAYOUT.house.x + 40, LAYOUT.house.y + 20, [
      el('b', { text: `小屋 Lv${s.tools.house}` }),
      el('span', { text: `体力上限 ${R.energyMax(s)}，每 ${R.WORLD.regen / 60} 分钟回 1 点` }),
      restButton(s),
      btn(s.auto?.on ? '🤖 挂机管家（挂机中）' : '🤖 雇个挂机管家', () => { closeBubble(); onOpen?.('auto') }, { cls: 'ghost' }),
      price != null ? btn(['扩建小屋（上限 +20） ', priceTag(price)], () => { push({ a: 'upgrade', k: 'house' }, () => { say('小屋变大了，体力上限 +20', 'ok'); shake(3) }); closeBubble() }, { disabled: money < price }) : el('small', { text: '已经是最豪华的小屋了' }),
      eats.length ? el('div', { class: 'isle-eat' }, el('small', { text: '吃点东西回体力：' }), eats.map((e) => el('button', { class: 'isle-chip', type: 'button', onclick: (ev) => { ev.stopPropagation(); push({ a: 'eat', id: e.id, q: e.q }, () => pop(whaleX, whaleY - 30, `体力 +${Math.round(R.CROPS.find((c) => c.id === e.id).eat * R.QUALITY[e.q])}`, '#b7f0a0')); closeBubble() } }, el('img', { src: A.itemIcon(e.id, 2), alt: '' }), '×' + e.n))) : null,
    ], true)
  }
  function anvilMenu() {
    const s = local().s, money = local().coins + (s.constructionCredit || 0)
    const row = (k, name, desc) => { const p = R.upgradePrice(s, k), lv = s.tools[k]; return el('div', { class: 'isle-up' }, el('div', {}, el('b', { text: `${name} Lv${lv}` }), el('small', { text: desc(lv) })), p == null ? el('small', { text: '满级' }) : btn(['升级 ', priceTag(p)], () => { push({ a: 'upgrade', k }, () => { say(`${name}升到 Lv${lv + 1}`, 'ok'); for (let q = 0; q < 14; q++) parts.push({ x: LAYOUT.anvil.x + 12, y: LAYOUT.anvil.y + 6, vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 80, c: ['#ffd75e', '#ff9c3a', '#fff'][q % 3], life: 0.6, g: 160 }); shake(3) }); closeBubble() }, { disabled: money < p })) }
    bubbleAt(LAYOUT.anvil.x + 14, LAYOUT.anvil.y, [
      el('b', { text: '铁匠铺' }),
      row('rod', '鱼竿', (lv) => `更少脱钩，能钓到 ${R.FISH.filter((f) => f.rod <= Math.min(4, lv + 1)).length} 种鱼`),
      row('pick', '镐子', (lv) => `最深能下到第 ${R.PICK_FLOOR[Math.min(4, lv + 1)]} 层`),
      row('spr', '洒水器', (lv) => `自动浇前 ${R.WORLD.sprCover[Math.min(3, lv + 1)]} 块地，长得更快`),
    ], true)
  }

  // ---------- 钓鱼 ----------
  let fishing = null // { phase: 'cast'|'wait'|'bite'|'reel', t, biteAt, bx, by }
  let fishShow = null
  let useBait = false
  const DOCK_END = () => [LAYOUT.dock.x + LAYOUT.dock.len * T - 12, LAYOUT.dock.y + 10]
  function castSpot(ex, ey) {
    const maxX = Math.min(W * T - 10, camX + vw - 14), minX = ex + 14
    for (let k = 0; k < 20; k++) {
      const x = Math.max(minX, Math.min(maxX, ex + 18 + Math.random() * 22)), y = ey + 2 + Math.random() * 20
      if (!walkableAt(x, y) && MAP[Math.floor(y / T)]?.[Math.floor(x / T)] === '~') return [x, y]
    }
    return [Math.min(maxX, ex + 24), ey + 12]
  }
  function startFishing() {
    if (fishing) return
    const [ex, ey] = DOCK_END()
    goDo(ex, ey, () => {
      whaleFlip = false
      const s = local().s
      if ((s.cnt.fish || 0) >= R.WORLD.daily.fish) return bubbleSay('今天钓够了，明天再来')
      if (s.en < R.WORLD.cost.fish) return bubbleSay('体力不够了')
      // 落点：码头尽头外 18–40px 的水面，不超过地图、也不超出当前可见范围（窄屏手机看得见浮漂）。
      const [bx, by] = castSpot(ex, ey)
      fishing = { phase: 'cast', t: performance.now(), bx, by, sx: ex + 14, sy: ey - 26 }
      follow = true
      act('rod', 450)
      setZone('dock')
    }, 4)
  }
  function fishTap() {
    if (!fishing) return false
    const f = fishing
    if (f.phase === 'bite') {
      fishing = { ...f, phase: 'reel', t: performance.now() }
      const o = push({ a: 'fish', bait: useBait && (local().s.inv.bait?.[0] || 0) > 0 })
      if (o) pendingGot.push({ a: queue[queue.length - 1], x: f.bx, y: f.by - 10 })
      puff(f.bx, f.by, [A.C.w5, A.C.w4], 12, 50); shake(2); sfx('splash')
      return true
    }
    if (f.phase === 'wait') { pop(f.bx, f.by - 14, '太早了，鱼吓跑了', '#cfe3ff'); fishing = null; return true }
    return true
  }
  function stepFishing() {
    if (!fishing) return
    const f = fishing, el2 = performance.now() - f.t
    if (f.phase === 'cast' && el2 > 520) { fishing = { ...f, phase: 'wait', t: performance.now(), biteAt: 1200 + Math.random() * 2600 }; puff(f.bx, f.by, [A.C.w5], 5, 20) }
    else if (f.phase === 'wait' && el2 > f.biteAt) { fishing = { ...f, phase: 'bite', t: performance.now() }; sfx('bite'); navigator.vibrate?.(60) }
    else if (f.phase === 'bite' && el2 > 1200) { pop(f.bx, f.by - 14, '没拉住…（不扣体力）', '#cfe3ff'); fishing = null }
    else if (f.phase === 'reel' && el2 > 700) { fishing = null }
  }

  // ---------- 矿洞 ----------
  const CAVE_W = 22, CAVE_H = 20
  let scene = 'isle', cave = null
  function enterCave(floor) {
    const s = local().s
    const f = Math.max(1, Math.min(floor || s.mine.max, s.mine.max, R.PICK_FLOOR[s.tools.pick]))
    const r = A.rng(f * 9973 + Math.floor(now() / 600))
    const rocks = []
    for (let k = 0; k < 16; k++) { let x, y, tries = 0; do { x = 26 + Math.floor(r() * (CAVE_W * T - 60)); y = 52 + Math.floor(r() * (CAVE_H * T - 80)); tries++ } while (tries < 30 && rocks.some((o) => Math.hypot(o.x - x, o.y - y) < 22)); const kind = r() < Math.min(0.35, f / 40) ? 2 : r() < 0.3 ? 1 : 0; rocks.push({ x, y, kind, hp: kind + 1, img: A.mineRock(kind, k + f * 13), shake: 0 }) }
    cave = { floor: f, rocks, bg: A.bakeCave(CAVE_W, CAVE_H, 500 + f), ladder: null, exit: [20, 30] }
    scene = 'cave'; whaleX = 24; whaleY = 44; tasks.length = 0; task = null; fishing = null; closeBubble()
    camX = 0; camY = 0; clampCam(); setZone('cave')
  }
  function leaveCave() { scene = 'isle'; cave = null; whaleX = LAYOUT.mine.door[0]; whaleY = LAYOUT.mine.door[1] + 8; tasks.length = 0; task = null; follow = true; setZone('isle') }
  function hitCave(x, y) {
    if (Math.hypot(x - cave.exit[0], y - cave.exit[1]) < 14) return { kind: 'exit' }
    if (cave.ladder && Math.hypot(x - cave.ladder[0], y - cave.ladder[1] - 6) < 12) return { kind: 'ladder' }
    for (let k = 0; k < cave.rocks.length; k++) { const r = cave.rocks[k]; if (r.hp > 0 && x > r.x - 2 && x < r.x + 20 && y > r.y && y < r.y + 16) return { kind: 'rock', k } }
    return null
  }
  function caveHit(h, x, y) {
    if (!h) { tasks.length = 0; task = null; return goDo(x, y, null, 2) }
    if (h.kind === 'exit') return goDo(cave.exit[0], cave.exit[1] + 8, leaveCave, 6)
    if (h.kind === 'ladder') return goDo(cave.ladder[0], cave.ladder[1] + 12, () => enterCave(cave.floor + 1), 6)
    const rock = cave.rocks[h.k]
    goDo(rock.x - 6, rock.y + 12, () => {
      whaleFlip = false
      if (rock.hp <= 0) return
      const s = local().s
      if (s.en < R.WORLD.cost.mine) return bubbleSay('体力不够了')
      if ((s.cnt.mine || 0) >= R.WORLD.daily.mine) return bubbleSay('今天挖够了')
      act('swing', 380); rock.shake = 0.25; rock.hp--; sfx(rock.hp > 0 ? 'hit' : 'break')
      puff(rock.x + 9, rock.y + 8, [A.C.r3, A.C.r4, '#fff'], 5, 30)
      if (rock.hp > 0) return
      const o = push({ a: 'mine', f: cave.floor }, () => { puff(rock.x + 9, rock.y + 8, [A.C.r2, A.C.r3, A.C.r1, rock.kind === 2 ? '#d8b8ff' : A.C.gold], 16, 60); shake(2) })
      if (!o) { rock.hp = 1; return }
      pendingGot.push({ a: queue[queue.length - 1], x: rock.x + 9, y: rock.y })
      const left = cave.rocks.filter((r) => r.hp > 0).length
      const s2 = local().s
      // 已经到过更深的层：敲开第一块石头就露出梯子；最深层的梯子要等服务端「发现梯子」
      if (!cave.ladder && cave.floor < s2.mine.max) cave.ladder = [rock.x + 6, rock.y]
      if (!left && cave.floor >= R.PICK_FLOOR[s2.tools.pick]) pop(whaleX, whaleY - 34, '镐子不够硬，去铁匠铺升级才能更深', '#ffe9a8')
    }, 4)
  }
  // 服务端说发现梯子时，确保洞里出现梯子
  const _reveal = reveal
  reveal = function (batch, out, j) { _reveal(batch, out, j); if (cave && out.some((o) => /梯子/.test(o?.msg || ''))) { if (!cave.ladder) { const r = cave.rocks.find((x) => x.hp <= 0) || cave.rocks[0]; cave.ladder = [r.x + 6, r.y] } } }

  // ---------- 快捷栏（随区域变化） ----------
  let zone = 'isle'
  function setZone(z) { zone = z; drawBar() }
  function drawBar() {
    const s = local().s
    if (zone === 'cave') {
      hotbar.replaceChildren(
        el('div', { class: 'isle-bar-info' }, el('b', { text: `矿洞 第 ${cave.floor} 层` }), el('small', { text: `今天还能挖 ${R.WORLD.daily.mine - (s.cnt.mine || 0)} 下 · 最深到过 ${s.mine.max} 层` })),
        el('div', { class: 'isle-floors' }, [...new Set([1, 5, 10, 15, 20, 25, s.mine.max])].filter((f) => f <= s.mine.max && f !== cave.floor).sort((a, b) => a - b).slice(-4).map((f) => btn(`${f} 层`, () => enterCave(f), { cls: 'chip' }))),
        btn('出洞', leaveCave, { cls: 'ghost' }))
      return
    }
    if (zone === 'dock') {
      const bait = s.inv.bait?.[0] || 0
      hotbar.replaceChildren(
        el('div', { class: 'isle-bar-info' }, el('b', { text: '钓鱼中' }), el('small', { text: `看到 ❗ 立刻点屏幕收竿 · 今天还能钓 ${R.WORLD.daily.fish - (s.cnt.fish || 0)} 竿` })),
        el('button', { class: 'isle-slot' + (useBait ? ' on' : ''), type: 'button', onclick: (e) => { e.stopPropagation(); if (!bait) { push({ a: 'buy', id: 'bait', n: 10 }); useBait = true; say('买了 10 个鱼饵', 'ok') } else useBait = !useBait; drawBar() } }, el('img', { src: A.itemIcon('bait', 3), alt: '' }), el('small', { text: bait ? `鱼饵 ${bait}` : '买鱼饵' })),
        btn('甩竿', () => { fishing = null; startFishing() }), btn('收工', () => { fishing = null; setZone('isle') }, { cls: 'ghost' }))
      return
    }
    const crops = R.CROPS.filter((c) => c.seasons.includes(season))
    if (!crops.some((c) => c.id === seed)) seed = crops[0].id
    hotbar.replaceChildren(...crops.map((c) => el('button', { class: 'isle-slot' + (c.id === seed ? ' on' : ''), type: 'button', title: `${c.name}：种子 ${c.seed}，${dur(c.grow * 60)}成熟${c.regrow ? `，可再收 ${c.times - 1} 茬` : ''}`, onclick: (e) => { e.stopPropagation(); seed = c.id; drawBar(); hint.textContent = `已选 ${c.name}：${dur(c.grow * 60)}成熟${c.regrow ? `，之后每 ${dur(c.regrow * 60)} 再收一茬（共 ${c.times} 茬）` : ''}，今天卖 ${prices[c.id] || '?'}`; hint.classList.add('show'); clearTimeout(hintT); hintT = setTimeout(() => hint.classList.remove('show'), 3200) } },
      el('img', { src: A.itemIcon(c.id, 3), alt: '' }), el('small', { text: short(c.seed) }))))
  }
  let hintT = 0

  // ---------- 输入：点 = 交互；拖 = 平移镜头；从地块开始拖 = 连着种 / 收 ----------
  let down = null
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId)
    const [x, y] = toWorld(e.clientX, e.clientY)
    const h = scene === 'isle' ? hitIsle(x, y) : null
    down = { sx: e.clientX, sy: e.clientY, cx: camX, cy: camY, moved: false, farm: h?.kind === 'plot', done: new Set(h?.kind === 'plot' ? [h.i] : []), h, x, y, t: performance.now() }
  })
  cv.addEventListener('pointermove', (e) => {
    if (!down && e.pointerType === 'mouse') {
      const [x, y] = toWorld(e.clientX, e.clientY), h = scene === 'isle' ? hitIsle(x, y) : scene === 'cave' ? hitCave(x, y) : null
      hoverKind = h?.kind === 'trap' || h?.kind === 'trapSlot' ? 'fish' : h?.kind === 'lockedPlot' ? 'plot' : h?.kind || ''
      cv.style.cursor = h ? 'pointer' : 'default'
    }
    if (!down) return
    const dx = e.clientX - down.sx, dy = e.clientY - down.sy
    if (!down.moved && Math.hypot(dx, dy) > 8) { down.moved = true; if (down.farm) plotAction(down.h.i, true) }
    if (!down.moved) return
    if (down.farm) { const [x, y] = toWorld(e.clientX, e.clientY), h = hitIsle(x, y); if (h?.kind === 'plot' && !down.done.has(h.i)) { down.done.add(h.i); plotAction(h.i, true) } return }
    follow = false; camX = down.cx - (dx * dpr) / scale; camY = down.cy - (dy * dpr) / scale; clampCam(); placeBubble()
  })
  cv.addEventListener('pointerup', (e) => {
    const d = down; down = null
    if (!d || d.moved) return
    if (fishing && fishTap()) return
    follow = true
    if (scene === 'cave') return caveHit(hitCave(d.x, d.y), d.x, d.y)
    onHit(d.h, d.x, d.y)
  })
  cv.addEventListener('pointercancel', () => { down = null })
  wrap.addEventListener('click', (e) => { if (!bubble.contains(e.target) && e.target !== cv && !hotbar.contains(e.target) && !chores.contains(e.target)) closeBubble() })
  const onKey = (e) => { if (e.key === ' ' && fishing) { e.preventDefault(); fishTap() } if (e.key === 'Escape') closeBubble() }
  addEventListener('keydown', onKey)

  // ---------- 状态栏 ----------
  let hudDirty = true, reloading = false
  function drawHud() {
    const v = local(), s = v.s, max = R.energyMax(s)
    chores.hidden = scene !== 'isle' || zone === 'dock'
    hudEnergy.querySelector('i').style.width = Math.min(100, (s.en / max) * 100) + '%'
    hudEnergy.querySelector('b').textContent = `体力 ${Math.floor(s.en)}/${max}`
    const nextIn = s.en < max ? Math.max(0, R.WORLD.regen - ((now() - s.enT) % R.WORLD.regen)) : 0
    hudEnergy.querySelector('small').textContent = s.en < max ? `↻${Math.floor(nextIn / 60)}:${String(Math.floor(nextIn % 60)).padStart(2, '0')}` : '满'
    hudEnergy.classList.toggle('low', s.en < 12)
    const restLeft = Math.max(0, R.WORLD.daily.rest - (s.cnt.rest || 0))
    restChip.lastChild.textContent = String(restLeft)
    restChip.disabled = !restLeft || s.en >= max
    restChip.classList.toggle('ready', !!restLeft && s.en < max * 0.3)
    hudEnergy.title = s.en < max ? `每 ${R.WORLD.regen / 60} 分钟回 1 点体力；点 🍱 免费回满（每天 ${R.WORLD.daily.rest} 次），吃自己种的菜或喝冰美式也能回` : '体力满了'
    hudCoins.querySelector('b').textContent = short(v.coins)
    const valley = R.valleyTime(now()), h = Math.floor(valley.hour), m = Math.floor((valley.hour-h)*60)
    const dow = new Date((now() + 8 * 3600) * 1000).getUTCDay()
    hudTime.textContent = `${valley.name} · ${valley.night ? '长夜' : R.SEASONS[season]+'·'+R.WEATHERS[weather]} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    hudTime.classList.toggle('warn', dow === 0)
    autoChip.classList.toggle('on', !!s.auto?.on); autoChip.lastChild.textContent = s.auto?.on ? ' 挂机中' : ' 管家'
    hudTime.title = '现实一天三个谷日；北京时间00–06为长夜，保鲜、成长和生产暂停。便当和每日限额仍按现实日计算。'+(dow===0?' 明天换季，请及时处理田里作物。':'')
    // 跨过北京时间 0 点：重新拉一次当天价格和天气
    if (R.worldDay(now()) !== day && !inflight && !queue.length && !reloading) { reloading = true; load().then(() => { dirty(); drawBar() }).catch(() => {}).finally(() => { reloading = false }) }
    hudDirty = false
  }

  // ---------- 渲染 ----------
  let last = performance.now(), raf = 0, frame = 0, t0 = performance.now()
  function nightAlpha() { const clock=R.valleyTime(now()); if(clock.night)return .36; const h=clock.hour; if (h >= 7 && h < 17.5) return 0; if (h >= 17.5 && h < 19.5) return ((h - 17.5) / 2) * 0.36; if (h >= 5 && h < 7) return ((7 - h) / 2) * 0.36; return 0.36 }
  function drawIsle(g, fg, tm) {
    const v = local(), s = v.s, t = now()
    g.drawImage(terrain, -camX, -camY)
    // 海面闪光与岸边浪
    const ph = Math.floor(tm / 1100)
    for (const [x, y] of waterTiles) {
      const X = x * T - camX, Y = y * T - camY
      if (X < -T || Y < -T || X > vw || Y > vh) continue
      const r = ((x * 73856093) ^ (y * 19349663) ^ ph) >>> 0
      if (r % 11 === 0) { g.fillStyle = A.C.w3; g.fillRect(X + (r % 11), Y + ((r >> 4) % 13), 3, 1) }
      if (r % 37 === 0) { g.fillStyle = A.C.w5; g.fillRect(X + ((r >> 3) % 12), Y + ((r >> 6) % 12), 1, 1) }
      if (MAP[y][x - 1] && MAP[y][x - 1] !== '~') { g.fillStyle = 'rgba(228,246,255,.75)'; g.fillRect(X, Y + 2 + ((ph + y) % 3) * 4, 2 + ((ph + x) % 3), 1) }
    }
    // 钓点：码头尽头的水波
    if (!fishing) { const fx = LAYOUT.dock.x + LAYOUT.dock.len * T + 18 - camX, fy = LAYOUT.dock.y + 20 - camY; for (let k = 0; k < 2; k++) { const ph2 = ((tm / 1800 + k / 2) % 1), r = 3 + ph2 * 10; g.strokeStyle = `rgba(228,246,255,${0.7 * (1 - ph2)})`; g.beginPath(); g.ellipse(fx, fy, r, r / 2.4, 0, 0, 7); g.stroke() } }
    // 地块
    for (let i = 0; i < R.WORLD.plotsMax; i++) {
      const [px, py] = plotXY(i), X = px - camX, Y = py - camY
      if (i >= s.plotN) { g.fillStyle = 'rgba(40,70,30,.18)'; g.fillRect(X + 2, Y + 2, 12, 12); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(X + 2, Y + 2, 12, 1); if (i === s.plotN) { g.fillStyle = 'rgba(60,40,20,.35)'; g.fillRect(X + 1, Y + 1, 14, 14); g.fillStyle = A.C.a3; g.fillRect(X + 4, Y + 3, 8, 6); g.fillStyle = A.C.b1; g.fillRect(X + 7, Y + 9, 2, 5); g.fillStyle = A.C.b2; g.fillRect(X + 5, Y + 5, 6, 1) } continue }
      const p = s.plots[i], auto = R.sprinkled(s, i) || weather === 1
      const st = p && R.cropStage(p, t, auto)
      const wet = !!p && (auto || (st && p.w > st.stage - (st.stage === 3 ? 1 : 0) && p.w > 0))
      g.drawImage(A.soil(wet, i), X, Y)
      if (!p) continue
      if (st.stage === -1) { g.drawImage(A.CROP_WITHER, X - 1, Y - 3); continue }
      const img = A.CROP[p.c][st.stage]
      const sway = st.stage >= 2 && weather === 2 ? Math.round(Math.sin(tm / 300 + i) * 1) : 0
      A.blit(g, img, X - 1 + sway, Y - 4)
      if (st.stage === 3 && Math.floor(tm / 500 + i) % 6 === 0) { g.fillStyle = '#fff6a8'; g.fillRect(X + 12, Y - 2, 1, 1); g.fillRect(X + 11, Y - 1, 3, 1); g.fillRect(X + 12, Y, 1, 1) }
      if (!auto && st.stage < 3 && p.w <= st.stage) { g.drawImage(A.itemSpr('drop'), X + 10, Y - 6 + Math.round(Math.sin(tm / 250 + i))) }
    }
    if (R.WORLD.sprCover[s.tools.spr]) { const n = R.WORLD.sprCover[s.tools.spr]; for (let r = 0; r < Math.ceil(n / 8); r++) { const [px, py] = plotXY(r * 8); g.fillStyle = A.C.r3; g.fillRect(px - 6 - camX, py + 6 - camY, 3, 6); g.fillStyle = A.C.w4; if (Math.floor(tm / 200) % 2) g.fillRect(px - 7 - camX, py + 4 - camY, 5, 1) } }
    // 可排序的物体：建筑、树、动物、主角
    const draws = statics.map((o) => ({ z: o.z, f: (g) => g.drawImage(typeof o.img === 'function' ? o.img() : o.img, o.x - camX, o.y - camY) }))
    critters.forEach((c, i) => {
      const pen = s.barn[i]; if (!pen) return
      const st = R.animalReady(pen, t), img = A.ANIMAL[pen.k][Math.floor(tm / 450 + i) % 2 && c.wait > 0 ? 1 : 0]
      draws.push({ z: c.y, f: (g) => {
        const hop = c.hop > 0 ? Math.round(Math.sin(c.hop * 8) * 3) : 0
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(c.x - 7 - camX, c.y - 1 - camY, 14, 2)
        A.blit(g, img, c.x - img.width / 2 - camX, c.y - img.height - camY - Math.abs(hop), { flip: c.flip })
        if (st.ready || !st.fed) {
          const icon = st.ready ? A.itemSpr(st.def.product) : A.itemSpr('feed'), bx = c.x - 7 - camX, by = c.y - img.height - 14 - camY + Math.round(Math.sin(tm / 300 + i))
          g.fillStyle = '#fffaf0'; g.fillRect(bx, by, 14, 12); g.fillStyle = A.C.ink; g.fillRect(bx, by + 12, 14, 1); g.fillRect(bx + 6, by + 12, 2, 2)
          g.drawImage(icon, bx + 7 - icon.width / 2, by + 6 - icon.height / 2)
          if (st.ready && st.n > 1) { g.fillStyle = A.C.rf2; g.fillRect(bx + 10, by - 3, 6, 6); g.fillStyle = '#fff'; g.font = '5px monospace'; g.fillText(st.n, bx + 11, by + 2) }
        }
      } })
    })
    s.traps.forEach((tr, i) => { const [tx, ty] = TRAP_POS[i], n = R.trapReady(tr, t, weather === 2).n; draws.push({ z: ty, f: (g) => { const bob = Math.round(Math.sin(tm / 400 + i * 2)); g.fillStyle = A.C.w0; g.fillRect(tx - 6 - camX, ty + 2 - camY, 12, 2); g.drawImage(A.itemSpr('trap'), tx - 6 - camX, ty - 6 - camY + bob); g.fillStyle = A.C.rf2; g.fillRect(tx - 1 - camX, ty - 12 - camY + bob, 2, 6); if (n) { g.fillStyle = '#fffaf0'; g.fillRect(tx + 3 - camX, ty - 16 - camY, 9, 8); g.fillStyle = A.C.ink; g.font = '6px monospace'; g.fillText(n, tx + 5 - camX, ty - 10 - camY) } } }) })
    for (let i = s.traps.length; i < Math.min(R.WORLD.trapMax, s.traps.length + 1); i++) { const [tx, ty] = TRAP_POS[i]; draws.push({ z: ty, f: (g) => { g.strokeStyle = 'rgba(255,255,255,.45)'; g.setLineDash([2, 2]); g.strokeRect(tx - 6 - camX + 0.5, ty - 5 - camY + 0.5, 12, 10); g.setLineDash([]) } }) }
    if (claimable(s)) draws.push({ z: LAYOUT.board.y + 30, f: (g) => { const bx = LAYOUT.board.x + 10 - camX, by = LAYOUT.board.y - 14 - camY + Math.round(Math.sin(tm / 200) * 1.5); g.fillStyle = '#fffaf0'; g.fillRect(bx, by, 8, 11); g.fillStyle = A.C.gold2; g.fillRect(bx + 3, by + 2, 2, 5); g.fillRect(bx + 3, by + 8, 2, 2) } })
    // Claude 娘店主
    draws.push({ z: LAYOUT.stall.y + 59, f: (g) => { g.drawImage(stallFront, LAYOUT.stall.x - camX, LAYOUT.stall.y + 36 - camY); A.drawMerchant(g, LAYOUT.stall.cat[0] + 18 - camX, LAYOUT.stall.y + 82 - camY, tm) } })
    // 路灯
    for (const [lx, ly] of LAMPS) draws.push({ z: ly, f: (g) => { g.fillStyle = A.C.b0; g.fillRect(lx - camX, ly - 18 - camY, 2, 18); g.fillStyle = A.C.r1; g.fillRect(lx - 2 - camX, ly - 22 - camY, 6, 5); g.fillStyle = nightAlpha() > 0 ? '#ffe9a8' : '#c9d6e8'; g.fillRect(lx - 1 - camX, ly - 21 - camY, 4, 3) } })
    // 信箱
    draws.push({ z: MAILBOX[1], f: (g) => { const [mx, my] = MAILBOX; g.fillStyle = A.C.b1; g.fillRect(mx - camX, my - 10 - camY, 2, 10); g.fillStyle = A.C.rf2; g.fillRect(mx - 4 - camX, my - 16 - camY, 10, 7); g.fillStyle = A.C.rf3; g.fillRect(mx - 4 - camX, my - 16 - camY, 10, 1); g.fillStyle = A.C.ink; g.fillRect(mx - 3 - camX, my - 13 - camY, 8, 1); if ((mail.length && !mailRead) || giftOpen) { const b = Math.round(Math.sin(tm / 200) * 1.5); g.fillStyle = '#fffaf0'; g.fillRect(mx - 2 - camX, my - 30 - camY + b, 7, 10); g.fillStyle = A.C.fr; g.fillRect(mx - camX, my - 28 - camY + b, 3, 4); g.fillRect(mx - camX, my - 23 - camY + b, 3, 2) } } })
    if (!hiRes()) draws.push({ z: whaleY, f: (g) => drawWhale(g, tm) })
    // 比主角靠前（更靠下）的东西画到前景层，盖在主角上面
    draws.sort((a, b) => a.z - b.z).forEach((d) => d.f(d.z > whaleY && hiRes() ? fg : g))
    g = fg
    // 烟囱炊烟
    for (let k = 0; k < 3; k++) { const p = ((tm / 1600 + k / 3) % 1), sx = LAYOUT.house.x + 60 + Math.sin(p * 6 + k) * 3 - camX, sy = LAYOUT.house.y + 2 - p * 22 - camY; g.fillStyle = `rgba(235,235,240,${0.55 * (1 - p)})`; g.fillRect(Math.round(sx), Math.round(sy), 3 + Math.round(p * 3), 3 + Math.round(p * 2)) }
    // 钓鱼浮漂与鱼线
    if (fishing) {
      const f = fishing, [rx, ry] = hiRes() ? [whaleX + 20, whaleY - 40] : [whaleX + 14, whaleY - 26]
      if (hiRes()) { g.strokeStyle = '#5e3a20'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(whaleX + 6 - camX, whaleY - 20 - camY); g.lineTo(rx - camX, ry - camY); g.stroke(); g.lineWidth = 1 }
      // 甩竿途中：浮漂沿抛物线从竿尖飞到落点
      if (f.phase === 'cast') {
        const k = Math.min(1, (performance.now() - f.t) / 520), fx = rx + (f.bx - rx) * k, fy = ry + (f.by - ry) * k - Math.sin(k * Math.PI) * 26
        g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(rx - camX, ry - camY); g.lineTo(fx - camX, fy - camY); g.stroke()
        g.fillStyle = A.C.rf2; g.fillRect(Math.round(fx) - 1 - camX, Math.round(fy) - 2 - camY, 3, 2); g.fillStyle = '#fff'; g.fillRect(Math.round(fx) - 1 - camX, Math.round(fy) - camY, 3, 2)
      }
      const bob = f.phase === 'bite' ? Math.round(Math.sin(tm / 40) * 2) + 2 : Math.round(Math.sin(tm / 300))
      if (f.phase !== 'cast') { g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(rx - camX, ry - camY); g.quadraticCurveTo((rx + f.bx) / 2 - camX, ry - 6 - camY, f.bx - camX, f.by - 2 + bob - camY); g.stroke()
      g.fillStyle = A.C.rf2; g.fillRect(f.bx - 1 - camX, f.by - 3 + bob - camY, 3, 2); g.fillStyle = '#fff'; g.fillRect(f.bx - 1 - camX, f.by - 1 + bob - camY, 3, 2) }
      if (f.phase === 'bite') { g.fillStyle = A.C.fr; g.fillRect(f.bx - 1 - camX, f.by - 18 - camY, 3, 7); g.fillRect(f.bx - 1 - camX, f.by - 9 - camY, 3, 2); if (Math.floor(tm / 80) % 2) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.strokeRect(f.bx - 6 - camX, f.by - 2 - camY, 12, 4) } }
    }
    if (fishShow && performance.now() - fishShow.t < 1400) { const k = (performance.now() - fishShow.t) / 1400, img = A.itemSpr(fishShow.id); g.drawImage(img, whaleX - img.width / 2 - camX, whaleY - (hiRes() ? 60 : 44) - Math.sin(k * Math.PI) * 10 - camY) }
  }
  // ---------- 主角：站内大肥鱼原画动画截成的图集（public/pets/dsh/isle/whale.webp），图集没加载好时先用像素小人 ----------
  const CH = 46 // 主角在世界里的高度（世界像素）
  function drawChar(tm) {
    const M = whaleMeta, now2 = performance.now()
    const kind = pose?.kind, moving = !!task && !pose
    let clip = 'idle', idx = 0, flip = false
    const tri = (k) => (k < 0.5 ? k * 2 : (1 - k) * 2)
    if (pose && kind !== 'rod') {
      clip = { hoe: 'crouch', can: 'crouch', pick: 'crouch', swing: 'slam', hug: 'hug', cheer: 'cheer' }[kind] || 'idle'
      const c = M.clips[clip], k = Math.min(0.999, (now2 - pose.t0) / pose.dur)
      idx = clip === 'crouch' || clip === 'slam' ? Math.round(tri(k) * (c.n - 1)) : Math.floor(k * c.n)
    } else if (moving) { clip = 'run'; idx = Math.floor(walkT * M.clips.run.fps) % M.clips.run.n; flip = !whaleFlip }
    else if (fishing) { const c = M.clips.bubble; idx = Math.floor((tm / 1000) * c.fps) % c.n; clip = 'bubble' }
    else { const c = M.clips.idle; idx = Math.floor((tm / 1000) * c.fps) % c.n }
    const c = M.clips[clip], fi = c.start + Math.max(0, Math.min(c.n - 1, idx))
    const sx = (fi % M.cols) * M.w, sy = Math.floor(fi / M.cols) * M.h
    const dh = CH * scale, dw = (dh * M.w) / M.h
    const fx = (whaleX - camX) * scale, fy = (whaleY - camY) * scale
    const x0 = fx - (M.cx / M.w) * dw, y0 = fy - (M.foot / M.h) * dh
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(fx, fy - scale * 0.5, 7 * scale, 2 * scale, 0, 0, 7); ctx.fill()
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
    if (flip) { ctx.save(); ctx.translate(fx * 2, 0); ctx.scale(-1, 1); ctx.drawImage(whaleImg, sx, sy, M.w, M.h, x0, y0, dw, dh); ctx.restore() }
    else ctx.drawImage(whaleImg, sx, sy, M.w, M.h, x0, y0, dw, dh)
  }
  function drawWhale(g, tm) {
    const moving = !!task && !pose
    const frame = moving ? Math.floor(walkT * 8) % 4 : 0
    const blink = (tm / 1000) % blinkT < 0.12
    const img = A.whale(frame, blink)
    const bob = moving ? (frame % 2) : Math.round(Math.sin(tm / 500) * 0.6)
    const X = whaleX - img.width / 2 - camX, Y = whaleY - img.height - camY - bob
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(Math.round(whaleX - 6 - camX), Math.round(whaleY - 1 - camY), 12, 2)
    A.blit(g, img, X, Y, { flip: whaleFlip })
    // 道具动作
    const kind = pose?.kind || (fishing ? 'rod' : null)
    if (kind) {
      const k = pose ? (performance.now() - pose.t0) / pose.dur : 1
      const tool = { hoe: A.TOOLS.hoe, can: A.TOOLS.can, pick: A.TOOLS.bag, swing: A.TOOLS.pick, rod: A.TOOLS.rod }[kind]
      if (tool) {
        const dir = whaleFlip ? -1 : 1, hx = whaleX + dir * 7 - camX, hy = whaleY - 12 - camY - bob
        const ang = kind === 'swing' || kind === 'hoe' ? (-1.6 + k * 2.2) * dir : kind === 'can' ? 0.5 * dir : kind === 'rod' ? -0.3 * dir : 0
        g.save(); g.translate(Math.round(hx), Math.round(hy)); g.rotate(ang); if (whaleFlip) g.scale(-1, 1); g.drawImage(tool, -2, -tool.height + 2); g.restore()
        if (kind === 'can' && Math.random() < 0.5) parts.push({ x: whaleX + dir * 14, y: whaleY - 10, vx: dir * 10, vy: 20, c: A.C.w4, life: 0.3, g: 140 })
      }
    }
  }
  function drawCave(g, fg, tm) {
    g.drawImage(cave.bg, -camX, -camY)
    // 出口梯子
    g.drawImage(A.itemSpr('ladder'), cave.exit[0] - 4 - camX, cave.exit[1] - 14 - camY)
    g.fillStyle = 'rgba(255,240,200,.08)'; g.beginPath(); g.arc(cave.exit[0] - camX, cave.exit[1] - 10 - camY, 18, 0, 7); g.fill()
    const draws = cave.rocks.filter((r) => r.hp > 0).map((r) => ({ z: r.y + 14, f: (g) => { const sx = r.shake > 0 ? Math.round(Math.sin(r.shake * 60)) : 0; g.drawImage(r.img, r.x + sx - camX, r.y - camY); if (r.hp < r.kind + 1) { g.fillStyle = A.C.ink; g.fillRect(r.x + 6 - camX, r.y + 5 - camY, 1, 4); g.fillRect(r.x + 7 - camX, r.y + 8 - camY, 3, 1) } } }))
    if (cave.ladder) draws.push({ z: cave.ladder[1], f: (g) => { g.fillStyle = '#0c0a12'; g.fillRect(cave.ladder[0] - 6 - camX, cave.ladder[1] + 4 - camY, 14, 8); g.drawImage(A.itemSpr('ladder'), cave.ladder[0] - 3 - camX, cave.ladder[1] - 4 - camY); if (Math.floor(tm / 300) % 2) { g.fillStyle = '#ffe9a8'; g.fillRect(cave.ladder[0] + 1 - camX, cave.ladder[1] - 10 - camY, 1, 3) } } })
    if (!hiRes()) draws.push({ z: whaleY, f: (g) => drawWhale(g, tm) })
    draws.sort((a, b) => a.z - b.z).forEach((d) => d.f(d.z > whaleY && hiRes() ? fg : g))
    g = fg
    // 火把（摇曳）
    for (const [fx, fy] of [[60, 34], [CAVE_W * T - 60, 34], [CAVE_W * T / 2, 30]]) { const fl = Math.random(); g.fillStyle = A.C.b1; g.fillRect(fx - camX, fy - camY, 2, 8); g.fillStyle = fl < 0.5 ? '#ffcf4a' : '#ff9c3a'; g.fillRect(fx - 1 - camX, fy - 4 - camY, 4, 4); g.fillStyle = '#fff3b0'; g.fillRect(fx - camX, fy - 3 - camY, 2, 2) }
    // 黑暗 + 主角身边的光
    g.save(); const grd = g.createRadialGradient(whaleX - camX, whaleY - 12 - camY, 10, whaleX - camX, whaleY - 12 - camY, 90 + R.PICK_FLOOR[1] * 0)
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, `rgba(5,3,10,${Math.min(0.75, 0.35 + cave.floor / 60)})`); g.fillStyle = grd; g.fillRect(0, 0, vw + 2, vh + 2); g.restore()
    g.globalCompositeOperation = 'lighter'
    for (const [fx, fy] of [[60, 34], [CAVE_W * T - 60, 34], [CAVE_W * T / 2, 30]]) { const r = 34 + Math.random() * 3, gr = g.createRadialGradient(fx - camX, fy - camY, 2, fx - camX, fy - camY, r); gr.addColorStop(0, 'rgba(255,170,80,.35)'); gr.addColorStop(1, 'rgba(255,170,80,0)'); g.fillStyle = gr; g.fillRect(fx - r - camX, fy - r - camY, r * 2, r * 2) }
    g.globalCompositeOperation = 'source-over'
  }
  // ---------- 能互动的东西：名牌（主角走近或鼠标悬停时更醒目）+ 钓点水波 ----------
  const TAGS = [
    ['house', '🏠 小屋', () => [LAYOUT.house.x + 40, LAYOUT.house.y + 2]], ['mail', '✉ 信箱', () => [MAILBOX[0] + 1, MAILBOX[1] - 32]],
    ['barn', '🐔 畜栏', () => [LAYOUT.barn.x + 36, LAYOUT.barn.y + 4]], ['market', '📚 杂货铺', () => [LAYOUT.stall.x + 40, LAYOUT.stall.y - 4]],
    ['board', '📜 今日目标', () => [LAYOUT.board.x + 14, LAYOUT.board.y - 16]], ['gate', '⚔ 擂台', () => [LAYOUT.gate.x + 24, LAYOUT.gate.y - 2]],
    ['anvil', '🔨 铁匠铺', () => [LAYOUT.anvil.x + 14, LAYOUT.anvil.y - 4]], ['mine', '⛏ 矿洞', () => [LAYOUT.mine.x + 32, LAYOUT.mine.y + 2]],
    ['fish', '🎣 钓鱼', () => [LAYOUT.dock.x + LAYOUT.dock.len * T + 20, LAYOUT.dock.y + 8]],
    ['plots', '🌱 农田', () => [LAYOUT.farm.x + 72, LAYOUT.farm.y - 14]], ['pasture', '🐄 牧场', () => [LAYOUT.pasture.x + 72, LAYOUT.pasture.y - 4]],
  ]
  let hoverKind = ''
  function drawTags(tm) {
    const fs = Math.round((cv.clientWidth > 700 ? 13 : 11) * dpr)
    ctx.font = `700 ${fs}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    // 主角所在的屏幕区域：名牌和她重叠时不画，免得挡住人物
    const cxs = (whaleX - camX) * scale, cys = (whaleY - camY) * scale, chw = 16 * scale, chh = CH * scale
    for (const [kind, text, at] of TAGS) {
      if (kind === 'fish' && fishing) continue
      const [x, y] = at(), near = Math.hypot(whaleX - x, whaleY - y) < 90, hot = hoverKind === kind || (kind === 'plots' && hoverKind === 'plot')
      const sx = (x - camX) * scale, sy = (y - camY) * scale - (hot ? 3 * dpr : 0)
      if (sx < -80 || sy < -40 || sx > cv.width + 80 || sy > cv.height + 40) continue
      const w = ctx.measureText(text).width + fs * 1.1, h = fs * 1.7
      if (sx + w / 2 > cxs - chw && sx - w / 2 < cxs + chw && sy + h / 2 > cys - chh && sy - h / 2 < cys) continue
      ctx.globalAlpha = hot ? 1 : near ? 0.95 : 0.62
      ctx.fillStyle = hot ? '#fff3c4' : 'rgba(242,226,191,.95)'; ctx.strokeStyle = '#5a361f'; ctx.lineWidth = Math.max(1, dpr * 1.5)
      ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - h / 2, w, h, h / 2.6); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx - 4 * dpr, sy + h / 2 - 1); ctx.lineTo(sx, sy + h / 2 + 4 * dpr); ctx.lineTo(sx + 4 * dpr, sy + h / 2 - 1); ctx.fill()
      ctx.fillStyle = '#3b2416'; ctx.fillText(text, sx, sy + 0.5)
    }
    ctx.globalAlpha = 1
  }
  function drawWeather(g, tm, dt) {
    if (scene !== 'isle') return
    if (weather === 1 || weather === 3) {
      g.fillStyle = weather === 1 ? 'rgba(40,60,100,.16)' : 'rgba(220,230,255,.10)'; g.fillRect(0, 0, vw + 2, vh + 2)
      const n = Math.round((vw * vh) / (weather === 1 ? 520 : 700))
      for (let k = 0; k < n; k++) {
        const sp = weather === 1 ? 160 : 20, x = ((k * 97 + (weather === 3 ? Math.sin(tm / 900 + k) * 12 : -tm * 0.05)) % (vw + 20) + vw + 20) % (vw + 20) - 10, y = ((k * 53 + (tm / 1000) * sp) % (vh + 20)) - 10
        g.fillStyle = weather === 1 ? 'rgba(210,230,255,.6)' : 'rgba(255,255,255,.9)'
        if (weather === 1) { g.fillRect(Math.round(x), Math.round(y), 1, 5); if (k % 9 === 0) g.fillRect(Math.round(x) - 1, Math.round((k * 31 + tm / 7) % vh), 3, 1) } else g.fillRect(Math.round(x), Math.round(y), k % 3 ? 1 : 2, k % 3 ? 1 : 2)
      }
    } else if (weather === 2) {
      for (let k = 0; k < 10; k++) { const x = ((tm / 1000) * 60 + k * 71) % (vw + 30) - 15, y = (k * 41 + Math.sin(tm / 400 + k) * 8) % vh; g.fillStyle = k % 2 ? A.C.l4 : '#e8b04a'; g.fillRect(Math.round(x), Math.round(y), 2, 1) }
    }
    const na = nightAlpha()
    if (na > 0) {
      g.fillStyle = `rgba(16,18,58,${na})`; g.fillRect(0, 0, vw + 2, vh + 2)
      g.globalCompositeOperation = 'lighter'
      const lamp = (x, y, r) => { const gr = g.createRadialGradient(x - camX, y - camY, 2, x - camX, y - camY, r); gr.addColorStop(0, `rgba(255,200,110,${na * 0.9})`); gr.addColorStop(1, 'rgba(255,200,110,0)'); g.fillStyle = gr; g.fillRect(x - r - camX, y - r - camY, r * 2, r * 2) }
      lamp(LAYOUT.house.x + 20, LAYOUT.house.y + 46, 26); lamp(LAYOUT.house.x + 60, LAYOUT.house.y + 46, 26); lamp(LAYOUT.stall.x + 40, LAYOUT.stall.y + 30, 34); lamp(LAYOUT.mine.x + 14, LAYOUT.mine.y + 40, 20); lamp(whaleX, whaleY - 10, 22)
      g.globalCompositeOperation = 'source-over'
    }
  }
  function loop(tm) {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(0.05, (tm - last) / 1000)
    // 没动静时降到 ~20 帧，省电
    const busy = task || tasks.length || pose || fishing || parts.length || marks.length || down
    if (!busy && tm - last < 48) return
    last = tm; frame++
    stepWhale(dt); stepFishing(); if (frame % 10 === 0) checkZone()
    if (scene === 'isle') {
      syncCritters(local().s)
      for (const c of critters) {
        c.hop = Math.max(0, c.hop - dt)
        if (c.wait > 0) { c.wait -= dt; continue }
        if (!c.tx) { c.tx = LAYOUT.pasture.x + 14 + Math.random() * (LAYOUT.pasture.w - 28); c.ty = LAYOUT.pasture.y + 20 + Math.random() * (LAYOUT.pasture.h - 28) }
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy)
        if (d < 1) { c.tx = 0; c.wait = 1 + Math.random() * 4; continue }
        c.x += (dx / d) * 12 * dt; c.y += (dy / d) * 12 * dt; c.flip = dx < 0
      }
    }
    for (const r of cave?.rocks || []) r.shake = Math.max(0, r.shake - dt)
    // 镜头：主角在中间一块「死区」里走动时镜头不动；走出死区才平滑跟上（背景少变化，不晃）
    if (follow && !down && bubble.hidden) { // 打开气泡菜单时镜头不动，免得按钮跟着滑走点错
      const bx = vw * 0.18, by = vh * 0.16, cx = camX + vw / 2, cy = camY + vh / 2 - 10
      let tx = camX, ty = camY
      if (fishing && scene === 'isle') { tx = Math.max((whaleX + fishing.bx) / 2 - vw / 2, fishing.bx + 24 - vw) }
      else if (whaleX < cx - bx) tx = whaleX + bx - vw / 2; else if (whaleX > cx + bx) tx = whaleX - bx - vw / 2
      if (whaleY < cy - by) ty = whaleY + by - vh / 2 + 10; else if (whaleY > cy + by) ty = whaleY - by - vh / 2 + 10
      const k = Math.min(1, dt * 5); camX += (tx - camX) * k; camY += (ty - camY) * k; clampCam()
    }
    const sx = shakeT > 0 ? Math.round((Math.random() - 0.5) * shakeT) : 0, sy = shakeT > 0 ? Math.round((Math.random() - 0.5) * shakeT) : 0
    shakeT = Math.max(0, shakeT - dt * 30)
    // 像素层按整数镜头画，余下的小数部分在合成时按设备像素平移，镜头移动就不会一格一格地跳
    const cx0 = camX, cy0 = camY, ix = Math.floor(camX), iy = Math.floor(camY), ox = (camX - ix) * scale, oy = (camY - iy) * scale
    camX = ix + sx; camY = iy + sy
    bctx.setTransform(scale,0,0,scale,0,0); fctx.setTransform(scale,0,0,scale,0,0)
    bctx.imageSmoothingEnabled = false; fctx.imageSmoothingEnabled = false
    bctx.fillStyle = scene === 'cave' ? '#100c16' : A.C.w1; bctx.fillRect(0, 0, buf.width, buf.height)
    fctx.clearRect(0, 0, fbuf.width, fbuf.height)
    if (scene === 'isle') drawIsle(bctx, fctx, tm); else drawCave(bctx, fctx, tm)
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue } p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; fctx.fillStyle = p.c; fctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), 1, 1) }
    for (let i = hearts.length - 1; i >= 0; i--) { const h = hearts[i]; h.t += dt; if (h.t > 1.2) { hearts.splice(i, 1); continue } if (h.t > 0) fctx.drawImage(A.itemSpr('heart'), Math.round(h.x - camX), Math.round(h.y - h.t * 16 - camY)) }
    for (let i = marks.length - 1; i >= 0; i--) { const m = marks[i]; m.t += dt; if (m.t > 0.5) { marks.splice(i, 1); continue } const r = Math.round(2 + m.t * 10); fctx.strokeStyle = `rgba(255,255,255,${0.8 - m.t * 1.5})`; fctx.strokeRect(Math.round(m.x - r - camX) + 0.5, Math.round(m.y - r / 2 - camY) + 0.5, r * 2, r) }
    drawWeather(fctx, tm, dt)
    // 合成：背景层 → 主角（原画，高清）→ 前景层（遮挡物、特效、天气、夜色）
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = scene === 'cave' ? '#100c16' : A.C.w1; ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.drawImage(buf, -ox, -oy)
    camX = cx0 + sx; camY = cy0 + sy
    if (hiRes()) drawChar(tm)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(fbuf, -ox, -oy)
    if (scene === 'isle') drawTags(tm)
    camX = cx0; camY = cy0
    if (hudDirty || frame % 30 === 0) drawHud()
    if (terrainSeason !== season) bakeWorld()
    if (houseLv !== local().s.tools.house) { houseLv = local().s.tools.house; houseImg = A.bakeHouse(houseLv) }
    if (bubbleAnchor && frame % 2 === 0) placeBubble()
  }
  // 屏幕外：停帧、把队列立即提交
  const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; if (queue.length) beacon() } else if (!raf && !destroyed) { last = performance.now(); raf = requestAnimationFrame(loop) } }
  function beacon() {
    if (!queue.length || inflight) return
    const batch = queue.slice(0, R.WORLD.maxActions)
    try { fetch('/api/pet/world/act', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rev, operation: uuid(), actions: batch }) }).catch(() => {}); queue = queue.slice(batch.length); dirty() } catch {}
  }
  document.addEventListener('visibilitychange', onVis)
  addEventListener('pagehide', beacon)
  const ro = new ResizeObserver(resize); ro.observe(wrap)
  wrap.append(banner)
  resize(); syncCritters(srv); drawBar(); drawHud()
  if (mail.length) setTimeout(() => pop(MAILBOX[0], MAILBOX[1] - 34, '信箱有新消息', '#ffe9a8'), 900)
  if (giftOpen) setTimeout(giftCard, 700)
  else if (R.autoDue(srv, now())) setTimeout(() => autoPost().catch((e) => say(e.message, 'err')), 400)
  camX = whaleX - vw / 2; camY = whaleY - vh / 2; clampCam()
  raf = requestAnimationFrame(loop)
  if (/isledebug/.test(location.search)) window.__isle = { walkableAt, startFishing, toScreen, local, plotXY, critters, TRAP_POS, LAYOUT, get scene() { return scene }, get cave() { return cave }, get fishing() { return fishing }, get queue() { return queue }, get whale() { return [whaleX, whaleY] }, walkTo: (x, y) => { tasks.length = 0; task = null; follow = true; goDo(x, y, null, 2) }, setScale: (n) => { forceScale = n; resize() }, setWeather: (w) => { weather = w; dirty() }, setSeason: (x) => { season = x; dirty(); drawBar() }, setHour: (h) => { const cur = R.hourOf(now()); skew += ((h - cur + 24) % 24) * 3600; dirty() } }
  // 新手引导：第一次进来时提示怎么玩
  try { if (!localStorage.getItem('isleTip')) { localStorage.setItem('isleTip', '1'); setTimeout(() => { hint.textContent = '点空地种菜，熟了再点一下收获；手指划过一排地块能连着种。点Claude 娘店主卖货，点码头钓鱼，点矿洞挖矿。'; hint.classList.add('show'); setTimeout(() => hint.classList.remove('show'), 7000) }, 800) } } catch {}

  return {
    // 给外层（集市 / 背包面板）用
    get state() { return local().s }, get persistedState() { return srv }, get revision() { return rev }, get coins() { return local().coins }, get prices() { return prices }, get day() { return day }, get season() { return season }, get weather() { return weather }, get serverInv() { return srv.inv },
    reload: async () => { await load(); dirty(); drawBar() }, push: (a, fx) => push(a, fx), flush: () => flush(), autoSave: (cfg) => autoPost(cfg), now: () => now(), busy: () => inflight || queue.length > 0, coinBurst, refresh: () => { dirty(); drawBar() },
    async destroy() { destroyed = true; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); removeEventListener('pagehide', beacon); removeEventListener('keydown', onKey); clearTimeout(flushTimer); if (queue.length) { destroyed = false; inflight = false; await flush().catch(() => beacon()); destroyed = true } },
  }
}
