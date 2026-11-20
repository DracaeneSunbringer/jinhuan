// 大肥鱼擂台回放：多场景背景 + 冲刺 / 打击停顿 / 震屏 / 连击 / 状态 / 终结慢动作。
// 角色用大肥鱼动作视频；背景与特效为本站原创的 Canvas 实时绘制。所有动作按顺序结算，同一时间只有一个招式的特效。
import { createPlayerFor } from '/pet-player.js'
import { petSrc } from '/pet-store.js'

const ANIMS = { idle: '待机呼吸休闲', hurt: '被吓一跳', dodge: '原地重力下蹲压缩', stunned: '打瞌睡被惊醒', win: '工作状态-雀跃庆祝', lose: '工作状态-垂头叹气冒汗', counter: '点击回应-傲娇生气', revive: '超大伸懒腰' }
const MELEE = new Set(['slash', 'impact', 'crit', 'whip', 'spin', 'balls', 'disc'])
const COLORS = { slash: '#fff3c4', impact: '#ffd36b', crit: '#ffe14d', bubble: '#9fe8ff', firework: '#ff7ab6', wave: '#58b8ff', heal: '#7cf0b0', fire: '#ff7a2a', notes: '#d6a8ff', balls: '#ffe08a', cards: '#ff5d73', shield: '#8fd8ff', sparkle: '#fff6b0', petals: '#ffb3cf', drain: '#c86bff', whip: '#7ee08a', wind: '#d9fff2', water: '#6fd0ff', spin: '#ff9b5c', ink: '#3b3b55', ghost: '#e8e6ff', feathers: '#ffffff', disc: '#ffc9b5' }
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v) }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c)
  return n
}
// replaceChildren 会把 null 变成文字 "null"，统一过滤掉
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((x) => x != null && x !== false))
const rnd = (a, b) => a + Math.random() * (b - a)
const ease = (t) => 1 - Math.pow(1 - t, 3)

// ---------- 场景：每场按战报编号固定一个 ----------
const SCENES = [
  { id: 'sea', name: '深海擂台', sky: ['#04263f', '#0b4a6b', '#0f6b7a'], ground: ['#0d3b3f', '#082629'], amb: 'bubbles', light: 'rays' },
  { id: 'sakura', name: '樱花庭院', sky: ['#ffd6e3', '#f7b1c8', '#e88fae'], ground: ['#c9a27e', '#9a7457'], amb: 'petals', light: 'sun' },
  { id: 'snow', name: '雪夜小镇', sky: ['#0b1433', '#1d2b5c', '#36497d'], ground: ['#e8eef8', '#b9c6dc'], amb: 'snow', light: 'moon' },
  { id: 'beach', name: '夏日海滩', sky: ['#55c8ff', '#8fe0ff', '#ffe7a8'], ground: ['#f2d49a', '#d9b376'], amb: 'sparkle', light: 'sun' },
  { id: 'neon', name: '霓虹机房', sky: ['#120a24', '#2a0f48', '#3f1260'], ground: ['#1a1030', '#0b0718'], amb: 'grid', light: 'neon' },
  { id: 'moon', name: '中秋月夜', sky: ['#0d0b26', '#2b1d4d', '#5b3b6e'], ground: ['#3a2a3a', '#211622'], amb: 'lanterns', light: 'moon' },
]

let dshDef = null
const loadDsh = async () => dshDef ??= { id: 'dsh-blue-whale', kind: 'video', actions: (await (await fetch('/pets/dsh/manifest.json', { cache: 'force-cache' })).json()).actions }

export async function createArena(host, { battle, skills }, viewer, back) {
  const def = await loadDsh()
  const byName = new Map(def.actions.map((a) => [a.name, a]))
  const skillOf = (id) => skills.find((s) => s.id === id)
  const scene = SCENES[battle.id % SCENES.length]
  const [A, B] = battle.fighters
  const mineIdx = battle.attacker_id === viewer ? 0 : 1

  const stage = el('div', { class: 'pa-stage', 'data-scene': scene.id })
  const cam = el('div', { class: 'pa-cam' })
  const bg = el('canvas', { class: 'pa-bg', 'aria-hidden': 'true' })
  const fx = el('canvas', { class: 'pa-fx', 'aria-hidden': 'true' })
  const flash = el('div', { class: 'pa-flash' })
  const banner = el('div', { class: 'pa-banner' })
  const combo = el('div', { class: 'pa-combo' })
  const roundEl = el('div', { class: 'pa-round' })
  const sceneTag = el('div', { class: 'pa-scene-tag', text: scene.name })
  const ticker = el('div', { class: 'pa-ticker' })
  const result = el('div', { class: 'pa-result', hidden: true })
  const speedBtn = el('button', { class: 'pa-btn', type: 'button', text: '1×' })
  const skipBtn = el('button', { class: 'pa-btn', type: 'button', text: '跳过' })
  const backBtn = el('button', { class: 'pa-btn', type: 'button', text: '返回' })
  const logBtn = el('button', { class: 'pa-btn', type: 'button', text: '战报' })
  const log = el('ol', { class: 'pa-log', hidden: true })

  const side = (f, i) => {
    const box = el('div', { class: `pa-fighter pa-f${i}` })
    const body = el('div', { class: 'pa-body' })
    const shadow = el('div', { class: 'pa-shadow' })
    const status = el('div', { class: 'pa-status' })
    box.append(shadow, body, status)
    const hp = el('i', { class: 'pa-hp-fill' }), ghost = el('i', { class: 'pa-hp-ghost' }), shield = el('i', { class: 'pa-hp-shield' })
    const hpText = el('span', { class: 'pa-hp-text', text: f.hp })
    const gear = Object.values(f.gear || {}).map((g) => el('img', { class: 'pa-gear r' + g.rarity, src: `/pets/dsh/thumbs/${g.id}.webp`, alt: g.name, title: g.name + (g.enh ? ' +' + g.enh : '') }))
    const bar = el('div', { class: `pa-bar pa-bar${i}` },
      el('div', { class: 'pa-bar-top' }, el('strong', { text: f.name }), el('span', { class: 'pa-lv', text: 'Lv' + f.level })),
      el('div', { class: 'pa-hp' }, ghost, hp, shield), el('div', { class: 'pa-bar-bottom' }, hpText, el('span', { class: 'pa-gears' }, gear)))
    const player = createPlayerFor(def, body, { className: 'pa-video', srcOf: petSrc, onEnded: () => {}, onBlocked: () => {}, onBroken: () => {} })
    const s = { f, i, box, body, bar, hp, ghost, shield, hpText, status, player, cur: f.hp, sh: 0, statuses: new Set() }
    s.play = (name, loop = false) => { const item = byName.get(name); if (item) player.play(item, { loop, mirror: i === 0 }) }
    s.play(ANIMS.idle, true)
    return s
  }
  const L = side(A, 0), R = side(B, 1), sides = [L, R]
  cam.append(bg, L.box, R.box, fx)
  stage.append(cam, flash, L.bar, R.bar, roundEl, sceneTag, banner, combo, ticker, result,
    el('div', { class: 'pa-controls' }, speedBtn, skipBtn, logBtn, backBtn))
  put(host, stage, log)
  stage.classList.add('pa-enter')

  // ---------- 时间控制 ----------
  let speed = 1, skip = false, dead = false, hitstop = 0
  speedBtn.addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; speedBtn.textContent = speed + '×' })
  skipBtn.addEventListener('click', () => { skip = true })
  backBtn.addEventListener('click', () => back())
  logBtn.addEventListener('click', () => { log.hidden = !log.hidden; if (!log.hidden) log.lastElementChild?.scrollIntoView({ block: 'nearest' }) })
  // 双击舞台加速
  stage.addEventListener('dblclick', () => { speed = Math.min(3, speed + 1); speedBtn.textContent = speed + '×' })
  const wait = (ms) => skip || dead ? Promise.resolve() : new Promise((r) => setTimeout(r, ms / speed))

  // ---------- 画布 ----------
  const bctx = bg.getContext('2d'), ctx = fx.getContext('2d')
  let W = 0, H = 0, dpr = 1
  const fit = () => { const r = cam.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; for (const c of [bg, fx]) { c.width = W * dpr; c.height = H * dpr } bctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ambient.length = 0; seedAmbient(); far = null }
  const ro = new ResizeObserver(fit)
  const ambient = []
  const groundY = () => H * 0.78
  function seedAmbient() {
    const n = scene.amb === 'grid' ? 30 : scene.amb === 'lanterns' ? 14 : 46
    for (let i = 0; i < n; i++) ambient.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(1, 4), v: rnd(0.2, 1), p: rnd(0, 6.28), s: rnd(0.5, 1.5) })
  }
  // 远景剪影：按场景画一次缓存
  let far = null
  function drawFar() {
    far = document.createElement('canvas'); far.width = W * dpr; far.height = H * dpr
    const c = far.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0)
    const g = c.createLinearGradient(0, 0, 0, H); scene.sky.forEach((col, i) => g.addColorStop(i / (scene.sky.length - 1), col)); c.fillStyle = g; c.fillRect(0, 0, W, H)
    const gy = groundY()
    if (scene.light === 'moon') { const m = c.createRadialGradient(W * 0.78, H * 0.2, 4, W * 0.78, H * 0.2, H * 0.4); m.addColorStop(0, 'rgba(255,248,220,1)'); m.addColorStop(0.12, 'rgba(255,240,200,.95)'); m.addColorStop(0.16, 'rgba(255,230,180,.25)'); m.addColorStop(1, 'rgba(255,230,180,0)'); c.fillStyle = m; c.fillRect(0, 0, W, H) }
    if (scene.light === 'sun') { const m = c.createRadialGradient(W * 0.2, H * 0.12, 4, W * 0.2, H * 0.12, H * 0.6); m.addColorStop(0, 'rgba(255,255,240,.95)'); m.addColorStop(0.1, 'rgba(255,250,220,.5)'); m.addColorStop(1, 'rgba(255,240,200,0)'); c.fillStyle = m; c.fillRect(0, 0, W, H) }
    const hills = (y, amp, col, seed) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += 8) c.lineTo(x, y - Math.sin(x / (60 + seed * 20) + seed) * amp - Math.sin(x / 23 + seed * 3) * amp * 0.3); c.lineTo(W, H); c.fill() }
    if (scene.id === 'sea') { hills(gy - 40, 26, 'rgba(10,60,70,.7)', 1); for (let i = 0; i < 9; i++) { const x = (i + 0.5) * W / 9 + rnd(-20, 20), h = rnd(40, 110); c.strokeStyle = `rgba(${rnd(200, 255) | 0},${rnd(80, 140) | 0},${rnd(110, 160) | 0},.55)`; c.lineWidth = rnd(3, 6); c.lineCap = 'round'; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(x, gy); c.quadraticCurveTo(x + rnd(-30, 30), gy - h * 0.6, x + rnd(-25, 25), gy - h); c.stroke() } } }
    if (scene.id === 'sakura') { hills(gy - 30, 18, 'rgba(160,110,120,.35)', 2); c.fillStyle = '#6b3d2e'; for (const x of [W * 0.08, W * 0.92]) { c.fillRect(x - 6, gy - 150, 12, 150); c.fillStyle = 'rgba(255,180,205,.9)'; for (let k = 0; k < 40; k++) { c.beginPath(); c.arc(x + rnd(-70, 70), gy - 150 + rnd(-60, 40), rnd(10, 26), 0, 7); c.fill() } c.fillStyle = '#6b3d2e' } c.fillStyle = '#c4473a'; c.fillRect(W * 0.38, gy - 120, 8, 120); c.fillRect(W * 0.62 - 8, gy - 120, 8, 120); c.fillRect(W * 0.35, gy - 124, W * 0.3, 10); c.fillRect(W * 0.37, gy - 102, W * 0.26, 7) }
    if (scene.id === 'snow') { for (let i = 0; i < 9; i++) { const x = i * W / 8 + rnd(-10, 10), h = rnd(50, 110), w = rnd(40, 70); c.fillStyle = '#1b2448'; c.fillRect(x, gy - h, w, h); c.beginPath(); c.moveTo(x - 6, gy - h); c.lineTo(x + w / 2, gy - h - 26); c.lineTo(x + w + 6, gy - h); c.fillStyle = '#e8eef8'; c.fill(); c.fillStyle = 'rgba(255,214,120,.85)'; for (let k = 0; k < 3; k++) c.fillRect(x + 8 + k * (w - 20) / 2, gy - h + 18, 8, 10) } }
    if (scene.id === 'beach') { c.fillStyle = 'rgba(40,140,220,.85)'; c.fillRect(0, gy - 50, W, 50); for (let k = 0; k < 6; k++) { c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 2; c.beginPath(); for (let x = 0; x <= W; x += 10) c.lineTo(x, gy - 46 + k * 8 + Math.sin(x / 30 + k) * 2); c.stroke() } c.fillStyle = '#7a5531'; c.save(); c.translate(W * 0.88, gy); c.rotate(-0.15); c.fillRect(-5, -150, 10, 150); c.fillStyle = '#2f9e44'; for (let k = 0; k < 6; k++) { c.save(); c.translate(0, -150); c.rotate(k * 1.05); c.beginPath(); c.ellipse(40, 0, 44, 10, 0.2, 0, 7); c.fill(); c.restore() } c.restore() }
    if (scene.id === 'neon') { for (let i = 0; i < 7; i++) { const x = i * W / 6 - 20, h = rnd(110, 180); c.fillStyle = '#1c1238'; c.fillRect(x, gy - h, W / 8, h); for (let k = 0; k < 8; k++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(80,255,200,.8)' : 'rgba(255,80,200,.7)'; c.fillRect(x + 8, gy - h + 10 + k * 16, rnd(6, W / 10), 3) } } }
    if (scene.id === 'moon') { hills(gy - 50, 30, '#1a1430', 3); c.strokeStyle = 'rgba(255,200,120,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, gy - 110); c.quadraticCurveTo(W / 2, gy - 60, W, gy - 110); c.stroke() }
    // 地面：透视网格 + 擂台
    const gg = c.createLinearGradient(0, gy - 20, 0, H); gg.addColorStop(0, scene.ground[0]); gg.addColorStop(1, scene.ground[1]); c.fillStyle = gg; c.fillRect(0, gy - 20, W, H)
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 1
    for (let k = -10; k <= 10; k++) { c.beginPath(); c.moveTo(W / 2 + k * 30, gy - 20); c.lineTo(W / 2 + k * 160, H); c.stroke() }
    c.save(); c.translate(W / 2, gy + 6); c.scale(1, 0.22); const ring = c.createRadialGradient(0, 0, W * 0.1, 0, 0, W * 0.42); ring.addColorStop(0, 'rgba(255,255,255,.10)'); ring.addColorStop(0.9, 'rgba(255,230,160,.22)'); ring.addColorStop(1, 'rgba(255,230,160,0)'); c.fillStyle = ring; c.beginPath(); c.arc(0, 0, W * 0.42, 0, 7); c.fill(); c.strokeStyle = 'rgba(255,230,160,.55)'; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, W * 0.38, 0, 7); c.stroke(); c.restore()
  }
  let tAmb = 0
  function drawBg(dt) {
    if (!far) drawFar()
    bctx.drawImage(far, 0, 0, W, H)
    tAmb += dt
    const gy = groundY()
    if (scene.light === 'rays') { for (let k = 0; k < 4; k++) { const x = W * (0.15 + k * 0.25) + Math.sin(tAmb * 0.3 + k) * 30, g = bctx.createLinearGradient(x, 0, x + 60, gy); g.addColorStop(0, 'rgba(180,240,255,.18)'); g.addColorStop(1, 'rgba(180,240,255,0)'); bctx.fillStyle = g; bctx.beginPath(); bctx.moveTo(x - 20, 0); bctx.lineTo(x + 40, 0); bctx.lineTo(x + 140, gy); bctx.lineTo(x + 40, gy); bctx.fill() } }
    if (scene.light === 'neon') { bctx.fillStyle = `rgba(255,60,200,${0.05 + 0.04 * Math.sin(tAmb * 3)})`; bctx.fillRect(0, 0, W, H) }
    for (const p of ambient) {
      if (scene.amb === 'bubbles') { p.y -= p.v * 30 * dt; p.x += Math.sin(tAmb * p.s + p.p) * 0.3; if (p.y < -10) { p.y = H + 10; p.x = rnd(0, W) } bctx.strokeStyle = 'rgba(200,245,255,.5)'; bctx.lineWidth = 1; bctx.beginPath(); bctx.arc(p.x, p.y, p.r + 1, 0, 7); bctx.stroke() }
      else if (scene.amb === 'petals') { p.y += p.v * 40 * dt; p.x += Math.sin(tAmb * p.s + p.p) * 0.8 + 0.4; if (p.y > H) { p.y = -10; p.x = rnd(-40, W) } bctx.save(); bctx.translate(p.x, p.y); bctx.rotate(tAmb * p.s + p.p); bctx.fillStyle = 'rgba(255,170,200,.85)'; bctx.beginPath(); bctx.ellipse(0, 0, p.r + 2, p.r, 0, 0, 7); bctx.fill(); bctx.restore() }
      else if (scene.amb === 'snow') { p.y += p.v * 35 * dt; p.x += Math.sin(tAmb * p.s + p.p) * 0.5; if (p.y > H) { p.y = -5; p.x = rnd(0, W) } bctx.fillStyle = 'rgba(255,255,255,.9)'; bctx.beginPath(); bctx.arc(p.x, p.y, p.r * 0.7, 0, 7); bctx.fill() }
      else if (scene.amb === 'sparkle') { const a = 0.5 + 0.5 * Math.sin(tAmb * 3 * p.s + p.p); bctx.fillStyle = `rgba(255,255,255,${a * 0.8})`; const y = gy - 52 + (p.y % 46); bctx.fillRect(p.x, y, 2, 2) }
      else if (scene.amb === 'grid') { p.y += p.v * 60 * dt; if (p.y > H) { p.y = 0; p.x = rnd(0, W) } bctx.fillStyle = 'rgba(90,255,210,.5)'; bctx.fillRect(p.x, p.y, 1.5, 12) }
      else if (scene.amb === 'lanterns') { p.y -= p.v * 12 * dt; p.x += Math.sin(tAmb * 0.5 + p.p) * 0.2; if (p.y < -20) { p.y = H * 0.7; p.x = rnd(0, W) } const g = bctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 16); g.addColorStop(0, 'rgba(255,200,110,.9)'); g.addColorStop(1, 'rgba(255,140,60,0)'); bctx.fillStyle = g; bctx.fillRect(p.x - 16, p.y - 16, 32, 32); bctx.fillStyle = '#ff8a3c'; bctx.fillRect(p.x - 4, p.y - 6, 8, 11) }
    }
  }

  // ---------- 特效粒子（每个招式开始前清空，避免堆叠） ----------
  let parts = []
  const add = (p) => parts.push({ t: 0, ...p })
  const clearFx = () => { parts = [] }
  function drawFx(dt) {
    ctx.clearRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'lighter'
    parts = parts.filter((p) => { p.t += dt; if (p.t > p.life) return false; p.draw(ctx, p.t / p.life, p); return true })
    ctx.globalCompositeOperation = 'source-over'
    // 常驻状态：灼烧火苗、眩晕星星、护盾气泡
    for (const s of sides) {
      const c = center(s)
      if (s.statuses.has('burn')) for (let k = 0; k < 6; k++) { const x = c.x + Math.sin(tAmb * 9 + k * 2) * 26, y = c.y + 30 - ((tAmb * 60 + k * 17) % 50); ctx.fillStyle = `rgba(255,${120 + k * 15},40,${0.7 - ((tAmb * 60 + k * 17) % 50) / 80})`; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill() }
      if (s.statuses.has('stun')) for (let k = 0; k < 3; k++) { const a = tAmb * 4 + k * 2.09; ctx.fillStyle = '#ffe66b'; ctx.font = 'bold 16px sans-serif'; ctx.fillText('★', c.x + Math.cos(a) * 30 - 8, c.y - 70 + Math.sin(a) * 8) }
      if (s.sh > 0) { ctx.strokeStyle = `rgba(140,215,255,${0.5 + 0.2 * Math.sin(tAmb * 4)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(c.x, c.y - 10, 60, 78, 0, 0, 7); ctx.stroke(); ctx.fillStyle = 'rgba(140,215,255,.08)'; ctx.fill() }
      if (s.statuses.has('evade')) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; for (let k = 1; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(c.x - k * 10 * (s.i ? -1 : 1), c.y - 10, 40, 70, 0, 0, 7); ctx.stroke() } }
    }
  }
  const center = (s) => { const a = cam.getBoundingClientRect(), b = s.body.getBoundingClientRect(); return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height * 0.58 } }

  let raf = 0, last = performance.now()
  const frame = (now) => {
    raf = 0; if (dead) return
    let dt = Math.min(0.05, (now - last) / 1000); last = now
    if (hitstop > 0) { hitstop -= dt; dt *= 0.08 }
    dt *= speed
    drawBg(dt); drawFx(dt)
    raf = requestAnimationFrame(frame)
  }
  ro.observe(cam); fit(); raf = requestAnimationFrame(frame)

  // ---------- 特效库 ----------
  const burst = (at, col, n = 18, sp = [120, 320], size = [2, 5], life = [0.35, 0.7]) => { for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), v = rnd(...sp), r = rnd(...size); add({ life: rnd(...life), draw(c, k) { c.globalAlpha = 1 - k; c.fillStyle = col; c.beginPath(); c.arc(at.x + Math.cos(a) * v * ease(k) * 0.6, at.y + Math.sin(a) * v * ease(k) * 0.6 + 40 * k * k, r * (1 - k * 0.5), 0, 7); c.fill(); c.globalAlpha = 1 } }) } }
  const ring = (at, col, r0 = 10, r1 = 110, life = 0.4, w = 5) => add({ life, draw(c, k) { c.globalAlpha = 1 - k; c.strokeStyle = col; c.lineWidth = w * (1 - k) + 1; c.beginPath(); c.arc(at.x, at.y, r0 + (r1 - r0) * ease(k), 0, 7); c.stroke(); c.globalAlpha = 1 } })
  const slashArc = (at, dir, col, big = 1) => add({ life: 0.28, draw(c, k) { c.save(); c.translate(at.x, at.y); c.scale(dir, 1); c.rotate(-0.6 + k * 0.5); const g = c.createLinearGradient(-90 * big, 0, 90 * big, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, col); g.addColorStop(1, '#fff'); c.strokeStyle = g; c.lineWidth = (16 * (1 - k) + 2) * big; c.lineCap = 'round'; c.beginPath(); c.arc(-20, 0, 80 * big, -1.3, 0.9 * ease(k) + 0.1); c.stroke(); c.restore() } })
  const glow = (at, col, r = 90, life = 0.5) => add({ life, draw(c, k) { const g = c.createRadialGradient(at.x, at.y, 0, at.x, at.y, r * (0.6 + k * 0.6)); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = (1 - k) * 0.8; c.fillStyle = g; c.fillRect(at.x - r * 1.3, at.y - r * 1.3, r * 2.6, r * 2.6); c.globalAlpha = 1 } })
  const projectile = (from, to, fxName, ms) => new Promise((done) => {
    const col = COLORS[fxName] || '#fff', n = fxName === 'wave' ? 1 : fxName === 'cards' || fxName === 'feathers' || fxName === 'notes' ? 5 : 3
    const life = ms / 1000
    for (let i = 0; i < n; i++) {
      const delay = i * 0.06, arc = rnd(-60, 60)
      add({ life: life + delay, draw(c, k0) {
        const k = Math.max(0, Math.min(1, (k0 * (life + delay) - delay) / life)); if (k <= 0) return
        const x = from.x + (to.x - from.x) * ease(k), y = from.y + (to.y - from.y) * ease(k) - Math.sin(k * Math.PI) * arc
        if (fxName === 'wave') { const g = c.createLinearGradient(x - 160, 0, x + 40, 0); g.addColorStop(0, 'rgba(60,140,255,0)'); g.addColorStop(1, 'rgba(160,220,255,.9)'); c.fillStyle = g; c.beginPath(); c.moveTo(x - 180, to.y + 90); for (let j = 0; j <= 12; j++) c.quadraticCurveTo(x - 180 + j * 18, to.y - 70 - Math.sin(j + k * 12) * 26, x - 170 + j * 18, to.y + 90); c.fill(); return }
        c.save(); c.translate(x, y)
        for (let tr = 1; tr <= 4; tr++) { c.globalAlpha = 0.25 / tr; c.fillStyle = col; c.beginPath(); c.arc(-(to.x - from.x) * 0.02 * tr, 0, 9 - tr, 0, 7); c.fill() }
        c.globalAlpha = 1; c.fillStyle = col
        if (fxName === 'notes') { c.font = 'bold 22px sans-serif'; c.fillText(i % 2 ? '♪' : '♫', -8, 8) }
        else if (fxName === 'cards') { c.rotate(k * 12); c.fillStyle = '#fff'; c.fillRect(-8, -11, 16, 22); c.fillStyle = col; c.font = 'bold 12px sans-serif'; c.fillText(['♥', '♠', '♦', '♣'][i % 4], -5, 5) }
        else if (fxName === 'feathers') { c.rotate(k * 6 + i); c.beginPath(); c.ellipse(0, 0, 12, 4, 0, 0, 7); c.fill() }
        else if (fxName === 'fire') { const g = c.createRadialGradient(0, 0, 1, 0, 0, 14); g.addColorStop(0, '#fff2a8'); g.addColorStop(0.5, '#ff8a2a'); g.addColorStop(1, 'rgba(255,60,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 14, 0, 7); c.fill() }
        else if (fxName === 'bubble' || fxName === 'water') { c.strokeStyle = '#e8fbff'; c.lineWidth = 2; c.fillStyle = 'rgba(160,230,255,.35)'; c.beginPath(); c.arc(0, 0, 10 + i * 2, 0, 7); c.fill(); c.stroke() }
        else if (fxName === 'ink') { c.fillStyle = '#20203a'; c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fill() }
        else if (fxName === 'ghost') { c.fillStyle = 'rgba(240,240,255,.9)'; c.beginPath(); c.arc(0, -4, 10, Math.PI, 0); c.lineTo(10, 10); c.lineTo(-10, 10); c.fill() }
        else { c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fill() }
        c.restore()
      } })
    }
    setTimeout(done, skip ? 0 : ms / speed)
  })
  const impact = (at, fxName, crit, dir) => {
    const col = COLORS[fxName] || '#fff'
    if (MELEE.has(fxName)) slashArc(at, dir, col, crit ? 1.4 : 1)
    if (fxName === 'firework') for (let b = 0; b < 3; b++) { const o = { x: at.x + rnd(-50, 50), y: at.y - rnd(20, 80) }; burst(o, ['#ff7ab6', '#ffd36b', '#7cf0b0'][b], 22, [80, 200], [2, 4], [0.6, 1]) }
    else if (fxName === 'fire') { burst(at, '#ff8a2a', 26, [80, 220], [3, 7]); glow(at, 'rgba(255,120,40,.9)', 110) }
    else if (fxName === 'wave') { burst(at, '#9fdcff', 30, [100, 300], [2, 6]); ring(at, '#bfe8ff', 20, 140, 0.5, 6) }
    else burst(at, col, crit ? 30 : 16)
    ring(at, crit ? '#fff3a0' : 'rgba(255,255,255,.9)', 10, crit ? 150 : 90, 0.35, crit ? 8 : 4)
    glow(at, crit ? 'rgba(255,240,150,.95)' : 'rgba(255,255,255,.6)', crit ? 140 : 80, 0.3)
  }
  const healFx = (at, col = '#7cf0b0') => { for (let i = 0; i < 14; i++) { const dx = rnd(-46, 46), d = rnd(0, 0.3); add({ life: 1 + d, draw(c, k0) { const k = Math.max(0, k0 * (1 + d) - d); c.globalAlpha = 1 - k; c.fillStyle = col; c.font = 'bold 18px sans-serif'; c.fillText('+', at.x + dx, at.y + 40 - 120 * k); c.globalAlpha = 1 } }) } ring({ x: at.x, y: at.y + 70 }, col, 20, 70, 0.6, 3); glow(at, 'rgba(120,240,170,.6)', 100, 0.6) }

  // ---------- 角色动作（CSS 位移，镜头跟随） ----------
  const move = (s, x, y, ms, cls = '') => new Promise((done) => { s.box.style.transition = skip ? 'none' : `transform ${ms / speed}ms cubic-bezier(.2,.8,.2,1)`; s.box.style.setProperty('--dx', x + 'px'); s.box.style.setProperty('--dy', y + 'px'); if (cls) s.box.classList.add(cls); setTimeout(done, skip ? 0 : ms / speed) })
  const shake = (power = 1) => { if (skip) return; cam.style.setProperty('--shake', power * 8 + 'px'); cam.classList.remove('pa-shaking'); void cam.offsetWidth; cam.classList.add('pa-shaking') }
  const zoom = (on, at) => { cam.style.transformOrigin = at ? `${at.x}px ${at.y}px` : '50% 60%'; cam.classList.toggle('pa-zoom', on) }
  const doFlash = (col = '#fff') => { if (skip) return; flash.style.background = col; flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on') }
  const hitFlash = (s) => { s.box.classList.remove('pa-hit'); void s.box.offsetWidth; s.box.classList.add('pa-hit') }
  const floatNum = (s, text, cls, idx = 0) => {
    if (skip) return
    const c = center(s), n = el('span', { class: 'pa-num ' + cls, text })
    n.style.left = c.x + (idx % 2 ? 24 : -24) * Math.min(1, idx) + 'px'; n.style.top = c.y - 70 - idx * 26 + 'px'
    cam.append(n); setTimeout(() => n.remove(), 1200)
  }
  const showBanner = (text, sub, cls, icon) => { if (skip) return; put(banner, icon ? el('img', { src: icon, alt: '' }) : null, el('div', null, el('strong', { text }), sub ? el('small', { text: sub }) : null)); banner.className = 'pa-banner on ' + cls }
  const hideBanner = () => { banner.className = 'pa-banner' }
  const setHp = (s, v, sh = s.sh) => {
    const pct = Math.max(0, v / s.f.hp * 100)
    s.hp.style.width = pct + '%'; s.cur = v; s.sh = sh
    s.shield.style.width = Math.min(100, sh / s.f.hp * 100) + '%'
    s.hpText.textContent = v + (sh ? ` +${sh}` : '')
    setTimeout(() => { s.ghost.style.width = pct + '%' }, skip ? 0 : 450 / speed)
    s.bar.classList.toggle('low', pct < 30)
  }
  const statusChip = (s) => { put(s.status, ...[...s.statuses].map((k) => el('span', { class: 'pa-chip ' + k, text: { burn: '灼烧', stun: '眩晕', weak: '虚弱', evade: '灵巧', focus: '蓄力' }[k] }))) }
  const line = (text, cls = '') => { log.append(el('li', { class: cls, text })); ticker.textContent = text; ticker.className = 'pa-ticker ' + cls }

  // ---------- 回放 ----------
  const dirOf = (by) => (by === 0 ? 1 : -1)
  // 冲到对手面前留出一个身位（按角色实际宽度算，避免两人完全重叠）；手机上是斜对角站位，所以 x / y 一起走。
  const melee = async (me, foe) => {
    const a = center(me), b = center(foe), dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1
    const stop = Math.max(110, foe.body.getBoundingClientRect().width * 0.42)
    const k = Math.max(0, (dist - stop) / dist)
    await move(me, dx * k, dy * k, 260, 'pa-dash')
  }
  const retreat = async (me) => { me.box.classList.remove('pa-dash'); await move(me, 0, 0, 280) }

  ;(async () => {
    await wait(500)
    stage.classList.remove('pa-enter')
    showBanner(`${scene.name}`, `${A.name} VS ${B.name}`, 'vs')
    line(`${A.name}（Lv${A.level}）向 ${B.name}（Lv${B.level}）发起挑战！`, 'sys')
    await wait(1300); hideBanner()
    let round = 0, comboN = 0
    const events = battle.events
    for (let ei = 0; ei < events.length && !dead; ei++) {
      const e = events[ei], me = sides[e.by], foe = sides[1 - e.by], sk = skillOf(e.skill)
      const isLast = ei === events.length - 1 && battle.winner !== -1
      if (e.r !== round) { round = e.r; roundEl.textContent = `ROUND ${round}`; roundEl.classList.remove('pa-pop'); void roundEl.offsetWidth; roundEl.classList.add('pa-pop') }
      clearFx()
      if (e.tick) { me.statuses.add('burn'); hitFlash(me); floatNum(me, '-' + e.dmg, 'burn'); setHp(me, e.hp[e.by], e.sh?.[e.by] ?? me.sh); line(`${me.f.name} 灼烧 -${e.dmg}`, 'burn'); await wait(500); continue }
      if (e.stunned) { me.statuses.delete('stun'); statusChip(me); me.play(ANIMS.stunned); floatNum(me, '眩晕中', 'miss'); line(`${me.f.name} 晕乎乎的，这回合动不了`); await wait(900); me.play(ANIMS.idle, true); continue }
      if (e.revive) { me.play(ANIMS.revive); healFx(center(me), '#ffd36b'); showBanner('复活！', me.f.name + ' 重新站了起来', 'revive'); setHp(me, e.hp[e.by], e.sh?.[e.by] ?? 0); line(`${me.f.name} 复活，回到 ${e.heal} 生命`, 'heal'); await wait(1200); hideBanner(); me.play(ANIMS.idle, true); continue }
      if (e.counter) { me.play(ANIMS.counter); await melee(me, foe); impact(center(foe), 'impact', false, dirOf(e.by)); hitFlash(foe); shake(0.6); foe.play(ANIMS.hurt); floatNum(foe, '-' + e.dmg, 'dmg'); setHp(foe, e.hp[1 - e.by], e.sh?.[1 - e.by] ?? foe.sh); line(`${me.f.name} 反击！造成 ${e.dmg} 伤害`, 'crit'); await retreat(me); me.play(ANIMS.idle, true); foe.play(ANIMS.idle, true); await wait(250); continue }
      const isWeapon = e.skill.startsWith('w-')
      const name = sk?.name || '攻击', fxName = sk?.fx || 'slash'
      // 起手：招式名 + 蓄力光
      me.play(sk?.anim || ANIMS.idle)
      if (e.skill !== 'tail') showBanner(name, isWeapon ? '武器技' : sk?.desc || '', isWeapon ? 'weapon' : 'skill', isWeapon ? `/pets/dsh/thumbs/${e.skill.slice(2)}.webp` : null)
      glow(center(me), (COLORS[fxName] || '#fff') + '', 120, 0.7)
      await wait(e.skill === 'tail' ? 300 : 650)
      hideBanner()
      const from = center(me), to = center(foe)
      if (e.heal != null && !e.dmg) { healFx(from); floatNum(me, '+' + e.heal, 'heal'); setHp(me, e.hp[e.by], e.sh?.[e.by] ?? me.sh); if (e.cleanse) { me.statuses.delete('burn'); me.statuses.delete('weak'); statusChip(me) } line(`${me.f.name}「${name}」回复 ${e.heal}${e.shield ? `，护盾 +${e.shield}` : ''}`, 'heal'); await wait(900); me.play(ANIMS.idle, true); continue }
      if (e.shield && !e.dmg) { ring(from, '#8fd8ff', 30, 100, 0.6, 5); setHp(me, e.hp[e.by], e.sh?.[e.by] ?? e.shield); floatNum(me, '护盾 +' + e.shield, 'shield'); line(`${me.f.name}「${name}」获得 ${e.shield} 护盾`); await wait(800); me.play(ANIMS.idle, true); continue }
      if (e.evade || e.focus) { me.statuses.add(e.evade ? 'evade' : 'focus'); statusChip(me); burst(from, '#fff6b0', 20, [60, 160]); line(`${me.f.name}「${name}」${e.evade ? '身法变得灵巧' : '进入蓄力状态，下一击必暴'}`); await wait(800); me.play(ANIMS.idle, true); continue }
      // 攻击：近战冲上去，远程发射
      const isMelee = MELEE.has(fxName)
      if (isMelee) await melee(me, foe)
      else await projectile(from, center(foe), fxName, 420)
      const hits = e.hits?.length ? e.hits : [{ dmg: e.dmg, crit: e.crit, dodge: e.dodge }]
      let shown = 0
      comboN = 0
      for (let h = 0; h < hits.length; h++) {
        const hit = hits[h], at = center(foe)
        if (hit.dodge) { foe.play(ANIMS.dodge); foe.box.classList.remove('pa-dodge'); void foe.box.offsetWidth; foe.box.classList.add('pa-dodge'); floatNum(foe, 'MISS', 'miss', h); if (isMelee) slashArc(at, dirOf(e.by), 'rgba(255,255,255,.5)') }
        else {
          impact(at, fxName, hit.crit, dirOf(e.by)); hitFlash(foe); foe.play(ANIMS.hurt)
          if (hit.crit) { hitstop = 0.12; shake(1.4); doFlash('rgba(255,250,200,.55)'); zoom(true, at) } else { hitstop = 0.05; shake(0.6) }
          shown += hit.dmg
          floatNum(foe, (hit.crit ? '暴击 ' : '') + '-' + hit.dmg, hit.crit ? 'crit' : 'dmg', h)
          if (hits.length > 1) { comboN++; combo.textContent = comboN + ' HIT'; combo.classList.remove('on'); void combo.offsetWidth; combo.classList.add('on') }
        }
        if (hits.length > 1 && h < hits.length - 1) await wait(220)
      }
      setHp(foe, e.hp[1 - e.by], e.sh?.[1 - e.by] ?? 0)
      if (e.stun) { foe.statuses.add('stun'); statusChip(foe) }
      if (e.burn) { foe.statuses.add('burn'); statusChip(foe) }
      if (e.weak) { foe.statuses.add('weak'); statusChip(foe) }
      if (e.drain) { healFx(center(me), '#d6a0ff'); floatNum(me, '+' + e.drain, 'heal'); setHp(me, e.hp[e.by], e.sh?.[e.by] ?? me.sh) }
      if (e.thorns) { floatNum(me, '反伤 -' + e.thorns, 'dmg'); hitFlash(me); setHp(me, e.hp[e.by], e.sh?.[e.by] ?? me.sh) }
      if (me.statuses.delete('focus')) statusChip(me)
      const parts2 = [`${me.f.name}「${name}」`]
      if (hits.every((x) => x.dodge)) parts2.push(`被 ${foe.f.name} 闪开`)
      else parts2.push(`${hits.length > 1 ? hits.length + ' 连击，' : ''}${hits.some((x) => x.crit) ? '暴击！' : ''}造成 ${shown} 伤害`)
      if (e.stun) parts2.push('，对方被眩晕'); if (e.burn) parts2.push('，对方灼烧'); if (e.weak) parts2.push('，对方虚弱'); if (e.drain) parts2.push(`，吸血 ${e.drain}`)
      line(parts2.join(''), hits.some((x) => x.crit) ? 'crit' : '')
      // 终结一击：慢动作 + K.O.
      if (isLast && (e.hp[1 - e.by] === 0)) { hitstop = 0.6; zoom(true, center(foe)); doFlash('rgba(255,255,255,.8)'); await wait(700) }
      await wait(isMelee ? 380 : 260)
      zoom(false)
      if (isMelee) await retreat(me)
      me.play(ANIMS.idle, true)
      if (foe.cur > 0) foe.play(ANIMS.idle, true)
      if (!foe.statuses.has('stun') && foe.statuses.has('weak') && Math.random() < 0.3) { foe.statuses.delete('weak'); statusChip(foe) }
      await wait(200)
    }
    if (dead) return
    skip = false
    const last = battle.events.at(-1)
    if (last) { setHp(L, last.hp[0], last.sh?.[0] ?? 0); setHp(R, last.hp[1], last.sh?.[1] ?? 0) }
    for (const s of sides) { s.statuses.clear(); statusChip(s) }
    clearFx(); zoom(false)
    const w = battle.winner
    if (w === -1) { L.play(ANIMS.idle, true); R.play(ANIMS.idle, true); showBanner('平局', `${battle.rounds} 回合打满`, 'draw') }
    else {
      const win = sides[w], lose = sides[1 - w]
      lose.box.classList.add('pa-down'); lose.play(ANIMS.lose, true)
      showBanner('K.O.', win.f.name + ' 获胜！', 'ko'); doFlash('rgba(255,255,255,.6)'); shake(1.6)
      await wait(900)
      win.play(ANIMS.win, true); win.box.classList.add('pa-victory')
      for (let k = 0; k < 4; k++) setTimeout(() => { const c = center(win); burst({ x: c.x + rnd(-80, 80), y: c.y - rnd(60, 140) }, ['#ff7ab6', '#ffd36b', '#7cf0b0', '#8fb8ff'][k], 28, [80, 220], [2, 4], [0.7, 1.1]) }, k * 260)
    }
    line(w === -1 ? `${battle.rounds} 回合打满，平局。` : `${sides[w].f.name} 获胜！`, 'sys')
    const won = w === mineIdx
    const drop = battle.drop
    put(result, 
      el('strong', { class: 'pa-res-title ' + (w === -1 ? 'draw' : won ? 'win' : 'lose'), text: w === -1 ? '平局' : won ? '胜利！' : '惜败' }),
      battle.attacker_id === viewer && battle.xp ? el('span', { class: 'pa-res-xp', text: `经验 +${battle.xp}` }) : null,
      battle.duel ? el('span', { class: 'pa-duel', text: battle.duel.winner_id == null ? `约战平局，押注 ${battle.duel.stake} D币 已退回` : battle.duel.winner_id === viewer ? `约战获胜 +${battle.duel.payout} D币（押注 ${battle.duel.stake}，抽成 ${battle.duel.rake}）` : `约战失利 -${battle.duel.stake} D币` }) : null,
      drop ? el('div', { class: 'pa-drop' }, el('img', { src: `/pets/dsh/thumbs/${drop.item}.webp`, alt: '' }), el('span', { text: drop.upgraded ? '获得重复装备，自动强化 +1' : '获得新装备！' })) : null,
      el('div', { class: 'pa-res-actions' }, el('button', { class: 'pa-btn primary', type: 'button', onclick: () => back() }, '返回擂台')))
    await wait(700); result.hidden = false; hideBanner()
    skipBtn.hidden = true; speedBtn.hidden = true
  })()

  return { destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); L.player.destroy?.(); R.player.destroy?.() } }
}
