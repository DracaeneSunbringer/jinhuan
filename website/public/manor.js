// 肥鱼庄园：大肥鱼在自己 / 别人的庄园里走来走去。点场景里的东西 → 大肥鱼走过去 → 做对应的事（种、收、偷、帮…）。
// 只在玩家操作时请求接口；不轮询（回到页面时刷新一次）。
import * as R from '/manor-rules.js'
import * as A from '/manor-art.js'

const $ = (s) => document.querySelector(s)
const cv = $('#cv'), ctx = cv.getContext('2d'), stage = $('#stage')
const fmt = (n) => Math.round(n).toLocaleString('zh-CN')
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const dur = (s) => { s = Math.max(0, Math.round(s)); if (s < 60) return s + ' 秒'; const m = Math.round(s / 60); if (m < 60) return m + ' 分钟'; const h = Math.floor(m / 60); return h + ' 小时' + (m % 60 ? (m % 60) + ' 分' : '') }
const ago = (t) => { const s = now() - t; if (s < 60) return '刚刚'; if (s < 3600) return Math.floor(s / 60) + ' 分钟前'; if (s < 86400) return Math.floor(s / 3600) + ' 小时前'; return Math.floor(s / 86400) + ' 天前' }
const name = (id) => R.M_NAME[id] || (id === 'energy' ? '能量' : id)
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16) })

// ---------- 数据 ----------
let home = null // { me, name, rev, state, coins, prices }
let visit = null // { id, name, rev, state }
let skew = 0
const now = () => Math.floor(Date.now() / 1000 + skew)
const cur = () => (visit ? visit.state : home.state)
const curUid = () => (visit ? visit.id : home.me)

async function api(path, body) {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent('/manor'); throw new Error('请先登录') }
  if (!r.ok && !j.state) throw new Error(j.error || '网络开小差了')
  if (j.now) skew = j.now - Date.now() / 1000
  return { status: r.status, ...j }
}
async function loadHome() {
  const j = await api('/api/manor')
  home = { me: j.me, name: j.name, rev: j.rev, state: j.state, coins: j.coins, prices: j.prices }
  hud()
}

// ---------- 画布 ----------
let scale = 1, vw = 0, vh = 0, camY = 0, camX = 0, bg = null, dpr = 1, follow = true
function resize() {
  dpr = Math.min(2.5, window.devicePixelRatio || 1)
  const r = stage.getBoundingClientRect(); vw = r.width; vh = r.height
  scale = Math.min(vw / A.W, 1.9)
  if (vw > 700) scale = Math.min(vw / A.W, vh / 620, 1.6)
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr)
  bg = A.bakeBackground(scale * dpr)
  document.documentElement.style.setProperty('--mh', $('.mh').getBoundingClientRect().height + 'px')
  clampCam()
}
const viewH = () => vh / scale, viewW = () => vw / scale
function clampCam() {
  camY = Math.max(-(visit ? 30 : 0), Math.min(A.H - viewH(), camY)); if (A.H <= viewH()) camY = (A.H - viewH()) / 2
  camX = (A.W - viewW()) / 2
}

// ---------- 大肥鱼 ----------
const whaleImg = new Image(); let whaleMeta = null
whaleImg.src = '/pets/dsh/isle/whale.webp?v=1'
fetch('/pets/dsh/isle/whale.json?v=1').then((r) => r.json()).then((m) => { whaleMeta = m }).catch(() => {})
const fish = { x: 180, y: 318, tx: 180, ty: 318, flip: false, walkT: 0, pose: null, then: null, say: null }
const CH = 50
function walkTo(x, y, then) { fish.tx = Math.max(12, Math.min(A.W - 12, x)); fish.ty = Math.max(20, Math.min(A.H - 8, y)); fish.then = then; follow = true }
function pose(kind, ms = 700) { fish.pose = { kind, t0: performance.now(), dur: ms } }
function drawFish(tm) {
  const M = whaleMeta
  if (!M || !whaleImg.complete || !whaleImg.naturalWidth) { A.shadow(ctx, fish.x, fish.y, 8); ctx.fillStyle = '#3b5bb5'; ctx.beginPath(); ctx.ellipse(fish.x, fish.y - 14, 9, 14, 0, 0, 7); ctx.fill(); return }
  const moving = Math.hypot(fish.tx - fish.x, fish.ty - fish.y) > 1 && !fish.pose
  let clip = 'idle', idx = 0, flip = fish.flip
  const tri = (k) => (k < 0.5 ? k * 2 : (1 - k) * 2)
  if (fish.pose) {
    clip = { crouch: 'crouch', cheer: 'cheer', hug: 'hug', slam: 'slam', bubble: 'bubble' }[fish.pose.kind] || 'idle'
    const c = M.clips[clip], k = Math.min(0.999, (performance.now() - fish.pose.t0) / fish.pose.dur)
    idx = clip === 'crouch' || clip === 'slam' ? Math.round(tri(k) * (c.n - 1)) : Math.floor(k * c.n)
  } else if (moving) { clip = 'run'; idx = Math.floor(fish.walkT * M.clips.run.fps) % M.clips.run.n; flip = !fish.flip }
  else { const c = M.clips.idle; idx = Math.floor((tm / 1000) * c.fps) % c.n }
  const c = M.clips[clip], fi = c.start + Math.max(0, Math.min(c.n - 1, idx))
  const sx = (fi % M.cols) * M.w, sy = Math.floor(fi / M.cols) * M.h
  const dh = CH, dw = (dh * M.w) / M.h, x0 = fish.x - (M.cx / M.w) * dw, y0 = fish.y - (M.foot / M.h) * dh
  A.shadow(ctx, fish.x, fish.y, 9, 2.6, 0.25)
  if (flip) { ctx.save(); ctx.translate(fish.x * 2, 0); ctx.scale(-1, 1); ctx.drawImage(whaleImg, sx, sy, M.w, M.h, x0, y0, dw, dh); ctx.restore() }
  else ctx.drawImage(whaleImg, sx, sy, M.w, M.h, x0, y0, dw, dh)
  if (fish.say && performance.now() < fish.say.until) bubble(fish.x, y0 + 4, fish.say.text)
}
function bubble(x, y, text) {
  ctx.font = 'bold 9px system-ui,sans-serif'; const w = ctx.measureText(text).width + 12
  const bx = Math.max(camX + 4, Math.min(camX + viewW() - w - 4, x - w / 2)), by = y - 18
  ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.beginPath(); ctx.roundRect(bx, by, w, 15, 7); ctx.fill()
  ctx.beginPath(); ctx.moveTo(x - 3, by + 15); ctx.lineTo(x, by + 19); ctx.lineTo(x + 3, by + 15); ctx.fill()
  ctx.fillStyle = '#2b3a22'; ctx.fillText(text, bx + 6, by + 10.5)
}
const say = (text, ms = 1800) => { fish.say = { text, until: performance.now() + ms } }

// ---------- 飘字 / 粒子 ----------
const pops = [], parts = []
function pop(x, y, text, color = '#fff') { pops.push({ x, y, text, color, t: performance.now() }) }
function burst(x, y, color, n = 10) { for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 50; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, c: color, life: 0.7 }) } }

// ---------- 场景里的可点对象 ----------
function targets() {
  const s = cur(), t = now(), list = []
  for (let i = 0; i < R.MANOR.plotsMax; i++) {
    const p = A.plotRect(i)
    list.push({ kind: i < s.plotN ? 'plot' : 'lock', i, x: p.x, y: p.y, w: p.w, h: p.h, go: [p.x + p.w / 2, p.y + p.h + 6] })
  }
  for (let i = 0; i < R.MANOR.pensMax; i++) { const n = A.nestSpot(i); list.push({ kind: i < s.pens.length ? 'pen' : i < s.penN ? 'penEmpty' : 'penLock', i, x: n.x - 22, y: n.y - 26, w: 44, h: 40, go: [n.x, n.y + 16] }) }
  for (let i = 0; i < 6; i++) { const p = animalPos(i, t); if (i < s.pens.length) list.push({ kind: 'pen', i, x: p.x - 16, y: p.y - 26, w: 32, h: 30, go: [p.x, p.y + 8] }) }
  for (let i = 0; i < R.MANOR.treesMax; i++) { const p = A.treeSpot(i); list.push({ kind: i < s.trees.length ? 'tree' : 'treeEmpty', i, x: p.x - 22, y: p.y - 58, w: 44, h: 68, go: [p.x, p.y + 12] }) }
  R.ballsView(s, curUid(), t).forEach((b, n) => { const p = A.ballSpot(n); list.push({ kind: 'ball', k: b.k, b, x: p.x - 16, y: p.y - 16, w: 32, h: 32, go: [A.DREAM.x + (p.x - A.DREAM.x) * 0.4, A.DREAM.y + 96] }) })
  list.push({ kind: 'dream', x: A.DREAM.x - 60, y: A.DREAM.y - 80, w: 120, h: 180, go: [A.DREAM.x, A.DREAM.y + 96] })
  list.push({ kind: 'house', x: A.HOUSE.x - 34, y: A.HOUSE.y - 62, w: 68, h: 66, go: [A.HOUSE.x, A.HOUSE.y + 10] })
  list.push({ kind: 'dog', x: A.DOGHOUSE.x - 20, y: A.DOGHOUSE.y - 34, w: 60, h: 40, go: [A.DOGHOUSE.x + 10, A.DOGHOUSE.y + 12] })
  return list
}
function animalPos(i, t) {
  const tt = t + (performance.now() % 1000) / 1000, nx = A.nestSpot(i).x
  const x = Math.max(36, Math.min(A.W - 36, nx + Math.sin(tt * 0.23 + i * 1.9) * 34 + Math.sin(tt * 0.071 + i) * 18))
  const y = 680 + Math.cos(tt * 0.17 + i * 2.3) * 52 + (i % 2) * 18
  const dx = Math.cos(tt * 0.23 + i * 1.9) * 0.23 * 34 + Math.cos(tt * 0.071 + i) * 0.071 * 18
  return { x, y, flip: dx < 0 }
}

// ---------- 绘制 ----------
let shake = 0, dogAlert = 0
function draw(tm) {
  const s = cur(), t = now()
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#7fbf6a'; ctx.fillRect(0, 0, cv.width, cv.height)
  const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0
  ctx.drawImage(bg, Math.round((-camX + sx) * scale * dpr), Math.round(-camY * scale * dpr))
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, (-camX + sx) * scale * dpr, -camY * scale * dpr)
  const draws = [] // [z, fn]
  // 林子
  draws.push([A.DREAM.y + 92, () => A.dreamTree(ctx, tm)])
  R.ballsView(s, curUid(), t).forEach((b, n) => { const p = A.ballSpot(n); draws.push([999, () => {
    const label = b.ripe ? (visit ? (b.stealable ? '偷' + b.stealable + 'g' : b.have + 'g') : b.have + 'g') : dur(b.left).replace(' 分钟', '分').replace(' 小时', '时').replace(' 秒', '秒')
    A.energyBall(ctx, p.x, p.y, b.have, b.ripe, tm, n, label)
  }]) })
  for (let i = 0; i < R.MANOR.treesMax; i++) {
    const p = A.treeSpot(i), tr = s.trees[i]
    if (tr) { const v = R.treeView(tr, t); draws.push([p.y, () => { A.tree(ctx, tr.k, p.x, p.y, tm, v.n); if (visit && v.stealLeft && !tr.by.includes(home.me)) hand(p.x + 14, p.y - 40, tm) }]) }
    else if (!visit) draws.push([p.y, () => A.sapling(ctx, p.x, p.y)])
  }
  draws.push([A.HOUSE.y, () => A.house(ctx, A.HOUSE.x, A.HOUSE.y)])
  draws.push([A.DOGHOUSE.y, () => A.dogHouse(ctx, A.DOGHOUSE.x, A.DOGHOUSE.y, !!s.dog, tm, performance.now() < dogAlert)])
  // 菜地
  for (let i = 0; i < R.MANOR.plotsMax; i++) {
    const r = A.plotRect(i), p = i < s.plotN ? s.plots[i] : null
    draws.push([r.y, () => {
      if (i >= s.plotN) { if (!visit && i === s.plotN) { A.plot(ctx, r, false, true); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('＋扩建', r.x + r.w / 2, r.y + r.h / 2 + 3); ctx.textAlign = 'left' } return }
      const v = p ? R.plotView(p, i, t) : null
      A.plot(ctx, r, !!v && !v.open.includes(1) && !v.ripe && t > p.t + 60, false)
      if (!p) { if (!visit) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('点我播种', r.x + r.w / 2, r.y + r.h / 2 + 3); ctx.textAlign = 'left' } return }
      A.crop(ctx, r, p.c, v.stage, tm, i)
      if (!v.ripe) v.open.forEach((bit, k) => A.issueIcon(ctx, r.x + r.w - 10 - k * 18, r.y + 2, bit, tm))
      if (v.ripe) {
        const glow = 0.5 + Math.sin(tm / 300 + i) * 0.5; ctx.strokeStyle = `rgba(255,230,120,${0.35 + glow * 0.4})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, 11); ctx.stroke()
        if (visit) { if (v.stealLeft > 0 && !p.by.includes(home.me)) hand(r.x + r.w - 8, r.y + 4, tm); else tagText(r.x + r.w / 2, r.y + r.h - 4, p.by.includes(home.me) ? '偷过了' : '偷光了') }
        else if (p.s) tagText(r.x + r.w / 2, r.y + r.h - 4, `被偷 ${p.s}`)
      } else if (!visit) progress(r.x + 6, r.y + r.h - 7, r.w - 12, 1 - v.left / (v.c.grow * 60))
    }])
  }
  // 牧场
  for (let i = 0; i < R.MANOR.pensMax; i++) {
    const n = A.nestSpot(i), pen = s.pens[i]
    draws.push([n.y, () => {
      if (!pen) { if (i < s.penN && !visit) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('＋买动物', n.x, n.y + 3); ctx.textAlign = 'left' } else if (i === s.penN && !visit) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('＋扩栏', n.x, n.y + 3); ctx.textAlign = 'left' } return }
      const v = R.penView(pen, t), d = v.d
      A.nest(ctx, n.x, n.y, v.n, A.PRODUCT[d.product])
      for (let m = 0; m < v.mess; m++) A.poop(ctx, n.x - 12 + m * 12, n.y + 18 + (m % 2) * 3)
      if (v.feedable) { ctx.font = '11px sans-serif'; ctx.fillText(v.hungry ? '🍽️' : '', n.x + 10, n.y - 10) }
      if (visit && v.stealLeft > 0 && !pen.by.includes(home.me)) hand(n.x + 12, n.y - 14, tm)
    }])
    if (pen) { const p = animalPos(i, t); draws.push([p.y, () => { A.animal(ctx, pen.k, p.x, p.y, tm, p.flip, i); const v = R.penView(pen, t); if (v.hungry) { ctx.font = '9px sans-serif'; ctx.fillText('💤', p.x + 6, p.y - 24) } }]) }
  }
  draws.push([fish.y, () => drawFish(tm)])
  draws.sort((a, b) => a[0] - b[0]).forEach((d) => d[1]())
  // 飘字、粒子
  const pn = performance.now()
  for (let k = pops.length - 1; k >= 0; k--) {
    const p = pops[k], a = (pn - p.t) / 1400
    if (a >= 1) { pops.splice(k, 1); continue }
    ctx.globalAlpha = 1 - a * a; ctx.font = 'bold 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(30,40,20,.7)'
    ctx.strokeText(p.text, p.x, p.y - a * 30); ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y - a * 30); ctx.textAlign = 'left'; ctx.globalAlpha = 1
  }
  for (let k = parts.length - 1; k >= 0; k--) { const p = parts[k]; ctx.globalAlpha = Math.max(0, p.life / 0.7); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 7); ctx.fill(); ctx.globalAlpha = 1 }
}
function hand(x, y, tm) { const b = Math.sin(tm / 200) * 2; ctx.font = '13px sans-serif'; ctx.fillText('✋', x - 6, y + b) }
function tagText(x, y, text) { ctx.font = 'bold 8px system-ui'; const w = ctx.measureText(text).width + 8; ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 9, w, 12, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(text, x, y); ctx.textAlign = 'left' }
function progress(x, y, w, k) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.roundRect(x, y, w, 4, 2); ctx.fill(); ctx.fillStyle = '#9be37a'; ctx.beginPath(); ctx.roundRect(x, y, Math.max(4, w * Math.max(0, Math.min(1, k))), 4, 2); ctx.fill() }

// ---------- 主循环 ----------
let last = performance.now()
function frame(tm) {
  const dt = Math.min(0.05, (tm - last) / 1000); last = tm
  if (home) {
    if (fish.pose && tm - fish.pose.t0 > fish.pose.dur) fish.pose = null
    const dx = fish.tx - fish.x, dy = fish.ty - fish.y, d = Math.hypot(dx, dy)
    if (!fish.pose && d > 1) { const sp = 150 * dt; fish.x += (dx / d) * Math.min(sp, d); fish.y += (dy / d) * Math.min(sp, d); fish.walkT += dt; if (Math.abs(dx) > 0.5) fish.flip = dx < 0 }
    else if (!fish.pose && fish.then) { const f = fish.then; fish.then = null; f() }
    if (follow && !drag) camY += (fish.y - viewH() * 0.55 - camY) * Math.min(1, dt * 4)
    clampCam()
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; p.life -= dt }
    for (let k = parts.length - 1; k >= 0; k--) if (parts[k].life <= 0) parts.splice(k, 1)
    shake = Math.max(0, shake - dt * 20)
    draw(tm)
  }
  requestAnimationFrame(frame)
}

// ---------- 点按 / 拖动 ----------
let drag = null
stage.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, cam: camY, moved: false, id: e.pointerId }; stage.setPointerCapture?.(e.pointerId) })
stage.addEventListener('pointermove', (e) => { if (!drag) return; const dy = e.clientY - drag.y; if (Math.abs(dy) > 6) drag.moved = true; if (drag.moved) { follow = false; camY = drag.cam - dy / scale; clampCam() } })
stage.addEventListener('pointerup', (e) => { const d = drag; drag = null; if (!d || d.moved || !home) return; const r = stage.getBoundingClientRect(); tap((e.clientX - r.left) / scale + camX, (e.clientY - r.top) / scale + camY) })
stage.addEventListener('pointercancel', () => { drag = null })
stage.addEventListener('wheel', (e) => { follow = false; camY += e.deltaY / scale; clampCam() }, { passive: true })

function tap(x, y) {
  const hits = targets().filter((o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h)
  const order = ['ball', 'pen', 'plot', 'tree', 'treeEmpty', 'penEmpty', 'lock', 'penLock', 'dog', 'house', 'dream']
  hits.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
  const o = hits[0]
  if (!o) { walkTo(x, y); return }
  walkTo(o.go[0], o.go[1], () => (visit ? onVisitTap(o) : onHomeTap(o)))
}

// ---------- 自己庄园 ----------
function onHomeTap(o) {
  const s = home.state, t = now()
  if (o.kind === 'plot') {
    const p = s.plots[o.i]
    if (!p) return openPlant(o.i)
    const v = R.plotView(p, o.i, t)
    if (v.ripe) return doOwn([{ a: 'harvest', i: o.i }], 'crouch')
    if (v.open.length) return doOwn(v.open.map((bit) => ({ a: 'fix', i: o.i, bit })), 'crouch')
    say(`${v.c.name}：还要 ${dur(v.left)}`); return
  }
  if (o.kind === 'lock') return openShop('expand')
  if (o.kind === 'pen') {
    const pen = s.pens[o.i], v = R.penView(pen, t), acts = []
    if (v.n) acts.push({ a: 'collect', i: o.i })
    if (v.mess) acts.push({ a: 'clean', i: o.i })
    if (v.feedable) acts.push({ a: 'feed', i: o.i })
    if (acts.length) return doOwn(acts, 'crouch')
    return openPen(o.i)
  }
  if (o.kind === 'penEmpty') return openShop('animal')
  if (o.kind === 'penLock') return openShop('expand')
  if (o.kind === 'tree') { const v = R.treeView(s.trees[o.i], t); if (v.n) return doOwn([{ a: 'wood', i: o.i }], 'slam'); say(`${v.d.name}：${dur(v.next)}后出木材`); return }
  if (o.kind === 'treeEmpty') return openShop('tree')
  if (o.kind === 'ball' || o.kind === 'dream') {
    const ripe = R.ballsView(s, home.me, t).filter((b) => b.ripe)
    if (ripe.length) return doOwn([{ a: 'balls' }], 'cheer')
    const next = R.ballsView(s, home.me, t).find((b) => !b.ripe)
    say(next ? `能量还要 ${dur(next.left)} 成熟` : '能量球每 3 小时长一颗'); return
  }
  if (o.kind === 'dog') { if (s.dog) { dogAlert = performance.now() + 900; say('看门狗在站岗！') } else openShop('expand'); return }
  if (o.kind === 'house') { say(['今天也要好好种地！', '去别人家串串门吧', '记得收能量哦'][Math.floor(Math.random() * 3)]); pose('hug', 900) }
}

// 动作队列：本地先用同一份规则算一遍（立刻看到效果），再交给服务端结算；服务端结果为准。
let queue = [], sending = false, lastSend = 0, flushTimer = 0
function doOwn(actions, anim) {
  if (anim) pose(anim, anim === 'slam' ? 600 : 700)
  const before = JSON.parse(JSON.stringify(home.state))
  const r = R.applyOwn(home.state, actions, { t: now(), uid: home.me, rand: Math.random, coins: home.coins })
  home.coins += r.earn - r.spend
  showOutcome(r.out, before)
  if (!r.out.some((o) => o.ok)) return
  queue.push(...actions)
  hud(); schedule()
}
function schedule() { clearTimeout(flushTimer); flushTimer = setTimeout(flush, Math.max(350, 1100 - (Date.now() - lastSend))) }
async function flush() {
  if (sending || !queue.length) return
  sending = true; const batch = queue.splice(0, R.MANOR.maxActions); lastSend = Date.now()
  try {
    const j = await api('/api/manor/act', { rev: home.rev, operation: uuid(), actions: batch })
    if (j.state) { home.state = j.state; home.rev = j.rev; home.coins = j.coins }
    if (j.status === 409) toast(j.error || '刷新了一下')
    else if (j.out) { const bad = j.out.find((o) => !o.ok); if (bad) toast(bad.msg) }
  } catch (e) { toast(e.message); await loadHome().catch(() => {}) }
  sending = false; hud()
  if (queue.length) schedule()
}
function showOutcome(out, before) {
  for (const o of out) {
    if (!o.ok) { toast(o.msg); continue }
    if (o.got) for (const [id, n] of o.got) { pop(fish.x, fish.y - 52, `+${n}${id === 'energy' ? 'g 能量' : ' ' + name(id)}`, id === 'energy' ? '#b9ffb0' : '#ffe9a8'); burst(fish.x, fish.y - 30, id === 'energy' ? '#7ff08a' : '#ffd75e', 8) }
    if (o.earn) { pop(fish.x, fish.y - 64, `+${fmt(o.earn)} D币`, '#ffd75e'); bumpPill('.pill.coin') }
    if (o.spend) pop(fish.x, fish.y - 64, `-${fmt(o.spend)} D币`, '#ffb4a8')
    if (o.a === 'fix') { pop(fish.x, fish.y - 52, '搞定！', '#cfe9ff'); burst(fish.x, fish.y - 26, '#8fd0ff', 6) }
    if (o.a === 'feed') pop(fish.x, fish.y - 52, '吃饱啦', '#ffe9a8')
    if (o.a === 'clean') pop(fish.x, fish.y - 52, '干净了', '#cfe9ff')
    if (o.a === 'plant') burst(fish.x, fish.y - 10, '#8b5a33', 6)
  }
  const lv0 = R.levelOf(before.xp), lv1 = R.levelOf(cur().xp)
  if (lv1 > lv0) { toast(`升到 ${lv1} 级！解锁了新东西`); burst(fish.x, fish.y - 40, '#ffd75e', 24); pose('cheer', 1200) }
}

// ---------- 串门 ----------
async function goVisit(id) {
  closeSheet()
  try {
    const j = await api('/api/manor/visit/' + id)
    visit = { id: j.id, name: j.name, rev: j.rev, state: j.state }
    $('#mvisit-text').textContent = `正在 ${j.name} 的庄园 · 点 ✋ 偷，点 💧🐛🌿 帮忙`
    $('#mvisit').hidden = false; $('#mh-title').textContent = j.name + ' 的庄园'
    fish.x = fish.tx = 180; fish.y = fish.ty = 318; camY = 0; follow = true
    say(j.state.dog ? '小心，有看门狗…' : '嘿嘿，悄悄地…'); hud()
  } catch (e) { toast(e.message) }
}
function goHome() {
  visit = null; $('#mvisit').hidden = true; $('#mh-title').textContent = home.name + ' 的庄园'
  fish.x = fish.tx = A.HOUSE.x + 20; fish.y = fish.ty = A.HOUSE.y + 18; camY = 0; hud(); say('到家啦')
  loadHome().catch(() => {})
}
$('#mvisit-home').onclick = goHome
let visitBusy = false
function onVisitTap(o) {
  const s = visit.state, t = now(), acts = []
  if (o.kind === 'plot') {
    const p = s.plots[o.i]; if (!p) return say('空地，没什么好拿的')
    const v = R.plotView(p, o.i, t)
    if (v.ripe) { if (p.by.includes(home.me)) return say('这块偷过了'); if (!v.stealLeft) return say('被偷光啦，给主人留点'); acts.push({ a: 'steal', i: o.i }) }
    else if (v.open.length) v.open.forEach((bit) => acts.push({ a: 'fix', i: o.i, bit }))
    else return say(`${v.c.name}还要 ${dur(v.left)} 才熟`)
  } else if (o.kind === 'pen') {
    const pen = s.pens[o.i], v = R.penView(pen, t)
    if (v.stealLeft > 0 && !pen.by.includes(home.me)) acts.push({ a: 'stealPen', i: o.i })
    if (v.mess) acts.push({ a: 'clean', i: o.i })
    if (v.feedable) acts.push({ a: 'feed', i: o.i })
    if (!acts.length) return say(`${v.d.name}过得挺好`)
  } else if (o.kind === 'ball') {
    if (!o.b.ripe) return say(`还要 ${dur(o.b.left)} 才成熟`)
    if (o.b.by.includes(home.me)) return say('这颗收过了')
    if (!o.b.stealable) return say('这颗被收过两次了')
    acts.push({ a: 'stealBall', k: o.k })
  } else if (o.kind === 'tree') {
    const tr = s.trees[o.i], v = R.treeView(tr, t)
    if (v.stealLeft && !tr.by.includes(home.me)) acts.push({ a: 'stealWood', i: o.i })
    else if (tr.wd !== s.day) acts.push({ a: 'waterTree', i: o.i })
    else return say('今天已经有人浇过了')
  } else if (o.kind === 'dream') { const b = R.ballsView(s, visit.id, t).find((x) => x.stealable && !x.by.includes(home.me)); if (b) acts.push({ a: 'stealBall', k: b.k }); else return say('没有能收的能量') }
  else if (o.kind === 'dog') { if (s.dog) { dogAlert = performance.now() + 1200; return say('汪！快跑…') } return say('这家没养狗，嘿嘿') }
  else return say('不是我的东西，不能乱动')
  visitAct(acts)
}
async function visitAct(acts) {
  if (visitBusy) return toast('慢一点…')
  const steal = acts.some((a) => a.a.startsWith('steal'))
  pose(steal ? 'crouch' : 'cheer', 800); visitBusy = true
  const wait = Math.max(0, 1100 - (Date.now() - lastSend)); if (wait) await new Promise((r) => setTimeout(r, wait))
  lastSend = Date.now()
  try {
    const j = await api('/api/manor/visit/' + visit.id, { rev: visit.rev, myRev: home.rev, operation: uuid(), actions: acts })
    if (j.state) { visit.state = j.state; visit.rev = j.rev }
    if (j.me) { home.state = j.me; home.rev = j.myRev; home.coins = j.coins }
    if (j.status === 409) toast(j.error)
    for (const o of j.out || []) {
      if (o.caught) { dogAlert = performance.now() + 1500; shake = 6; toast(o.msg); pop(fish.x, fish.y - 52, '被逮住了！', '#ffb4a8'); pose('slam', 600); continue }
      if (!o.ok) { toast(o.msg); continue }
      if (o.got) for (const [id, n] of o.got) { pop(fish.x, fish.y - 52, `+${n}${id === 'energy' ? 'g 能量' : ' ' + name(id)}`, id === 'energy' ? '#b9ffb0' : '#ffe9a8'); burst(fish.x, fish.y - 30, '#ffd75e', 8) }
      else pop(fish.x, fish.y - 52, { fix: '帮忙了', water: '浇好了', bug: '虫子走开', weed: '草拔了', clean: '扫干净了', feed: '喂饱了', waterTree: '浇树了' }[o.a] || '好人一个', '#cfe9ff')
      if (o.earn) pop(fish.x, fish.y - 66, `+${o.earn} D币`, '#ffd75e')
    }
    hud()
  } catch (e) { toast(e.message) }
  visitBusy = false
}

// ---------- 顶栏 ----------
function hud() {
  if (!home) return
  const s = home.state, lv = R.levelOf(s.xp), lo = R.LEVELS[lv - 1] ?? 0, hi = R.LEVELS[lv] ?? lo
  $('#mh-lv').textContent = 'Lv' + lv
  $('#mh-xp').style.width = (hi > lo ? Math.min(100, ((s.xp - lo) / (hi - lo)) * 100) : 100) + '%'
  $('#mh-coins').textContent = fmt(home.coins)
  $('#mh-energy').textContent = fmt(s.energy) + 'g'
  if (!visit) $('#mh-title').textContent = (home.name || '我') + ' 的庄园'
  const unseen = s.logs.filter((l) => l[0] > s.seen).length
  const b = $('#logs-badge'); b.hidden = !unseen; b.textContent = unseen > 99 ? '99+' : unseen
}
function bumpPill(sel) { const p = $(sel); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump') }
let toastT = 0
function toast(msg) { if (!msg) return; const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200) }

// ---------- 弹层 ----------
function openSheet(title, html, bind) { $('#sheet-title').textContent = title; $('#sheet-body').innerHTML = html; $('#sheet-wrap').hidden = false; bind?.($('#sheet-body')) }
function closeSheet() { $('#sheet-wrap').hidden = true }
$('#sheet-x').onclick = closeSheet
$('#sheet-wrap').addEventListener('click', (e) => { if (e.target.id === 'sheet-wrap') closeSheet() })
const icon = (id) => `<img alt="" src="${A.iconUrl(id, 88)}">`
const lvNow = () => R.levelOf(home.state.xp)

function openPlant(i) {
  const s = home.state, empties = s.plots.map((p, k) => (p ? -1 : k)).filter((k) => k >= 0)
  const rows = R.M_CROPS.map((c) => {
    const own = s.inv['seed:' + c.id] || 0, lock = c.lv > lvNow(), profit = c.n * c.price - c.seed
    const btns = lock ? `<button class="btn" disabled>${c.lv} 级解锁</button>` : `<button class="btn ${empties.length > 1 ? 'ghost' : ''}" data-c="${c.id}">${own ? '种这块' : fmt(c.seed)}</button>${empties.length > 1 ? `<button class="btn" data-all="${c.id}">种满 ${empties.length} 块</button>` : ''}`
    return `<div class="row ${lock ? 'locked' : ''}">${icon(c.id)}<div class="t"><b>${c.name}${own ? `<span class="tag soon">有 ${own} 包种子</span>` : ''}</b><small>${dur(c.grow * 60)} · 收 ${c.n} 份 · 每块约赚 ${fmt(profit)}${own ? '' : ` · 种子 ${fmt(c.seed)}`}</small></div><div class="btns">${btns}</div></div>`
  }).join('')
  openSheet('种点什么？', `<div class="note">成熟前会缺水、长虫、长草，记得处理（别人也能来帮你）。熟了别人能偷走最多 30%。</div><div class="list">${rows}</div>`, (b) => {
    b.querySelectorAll('[data-c]').forEach((btn) => btn.onclick = () => { closeSheet(); doOwn([{ a: 'plant', i, c: btn.dataset.c }], 'crouch') })
    b.querySelectorAll('[data-all]').forEach((btn) => btn.onclick = () => { closeSheet(); doOwn(empties.map((k) => ({ a: 'plant', i: k, c: btn.dataset.all })), 'crouch') })
  })
}
function openPen(i) {
  const pen = home.state.pens[i], v = R.penView(pen, now()), d = v.d
  openSheet(d.name, `<div class="row">${icon(d.id)}<div class="t"><b>${d.name}</b><small>${v.hungry ? '饿了，喂一下才会继续产' : `吃饱还剩 ${dur(v.fedLeft)}`} · ${v.n >= v.cap ? '窝满了' : `${dur(v.next)} 后产 1 个${d.productName}`}${v.mess ? ` · 有 ${v.mess} 坨粪便（窝变小了）` : ''}</small></div><span></span></div>
    <div class="btns" style="margin-top:10px"><button class="btn ghost" data-a="feed" ${v.feedable ? '' : 'disabled'}>喂食</button><button class="btn ghost" data-a="clean" ${v.mess ? '' : 'disabled'}>打扫</button><button class="btn red" data-a="sellAnimal">卖掉（${fmt(d.price * 0.4)} D币）</button></div>`, (b) => {
    b.querySelectorAll('[data-a]').forEach((btn) => btn.onclick = () => { if (btn.dataset.a === 'sellAnimal' && !confirm(`确定卖掉这只${d.name}？`)) return; closeSheet(); doOwn([{ a: btn.dataset.a, i }], 'crouch') })
  })
}
function openBag() {
  const s = home.state, items = Object.entries(s.inv).filter(([, n]) => n > 0)
  const sellable = items.filter(([id]) => Object.hasOwn(R.M_PRICE, id)), seeds = items.filter(([id]) => id.startsWith('seed:'))
  const total = sellable.reduce((a, [id, n]) => a + n * R.mPrice(id, s.day), 0)
  const rows = sellable.map(([id, n]) => `<div class="row">${icon(id)}<div class="t"><b>${name(id)} × ${n}</b><small>今天 ${fmt(R.mPrice(id, s.day))} D币 / 个${id === 'wood' ? ' · 扩建和狗窝要用木材' : ''}</small></div><div class="btns"><button class="btn ghost" data-sell="${id}" data-n="1">卖 1</button><button class="btn" data-sell="${id}" data-n="${n}">全卖</button></div></div>`).join('')
  const seedRows = seeds.map(([id, n]) => `<div class="row">${icon(id)}<div class="t"><b>${name(id)} × ${n}</b><small>点空地播种时自动先用</small></div><span></span></div>`).join('')
  openSheet('仓库', `<div class="sum"><span>今天已卖 ${fmt(s.earn)} / ${fmt(R.MANOR.dailyEarn)} D币</span>${sellable.length ? `<button class="btn gold" id="sell-all">全部卖掉 ≈ ${fmt(total)}</button>` : ''}</div>
    <div class="list">${rows || '<div class="empty">仓库空空的，去收菜或者串门「拿」点吧</div>'}${seedRows}</div>`, (b) => {
    b.querySelectorAll('[data-sell]').forEach((btn) => btn.onclick = () => { doOwn([{ a: 'sell', id: btn.dataset.sell, n: Number(btn.dataset.n) }]); openBag() })
    const all = b.querySelector('#sell-all'); if (all) all.onclick = () => { doOwn(sellable.filter(([id]) => id !== 'wood').map(([id, n]) => ({ a: 'sell', id, n }))); openBag() }
  })
}
function openShop(tab = 'seed') {
  const s = home.state, lv = lvNow()
  const tabs = [['seed', '种子'], ['animal', '动物'], ['tree', '种树'], ['expand', '扩建']]
  let body = ''
  if (tab === 'seed') body = R.M_CROPS.map((c) => { const lock = c.lv > lv; return `<div class="row ${lock ? 'locked' : ''}">${icon('seed:' + c.id)}<div class="t"><b>${c.name}种子</b><small>${fmt(c.seed)} D币 · ${dur(c.grow * 60)} · 收 ${c.n} 份，每份约 ${fmt(c.price)}</small></div><div class="btns">${lock ? `<button class="btn" disabled>${c.lv} 级</button>` : `<button class="btn ghost" data-buy="${c.id}" data-n="1">买 1</button><button class="btn" data-buy="${c.id}" data-n="6">买 6</button>`}</div></div>` }).join('')
  if (tab === 'animal') body = `<div class="note">栏位 ${s.pens.length} / ${s.penN}。动物每天要喂一次，粪便会占窝里的位置；别人可以顺走产物，也可以帮你喂、帮你扫。</div>` + R.M_ANIMALS.map((d) => { const lock = d.lv > lv; return `<div class="row ${lock ? 'locked' : ''}">${icon(d.id)}<div class="t"><b>${d.name}</b><small>${dur(d.every * 60)} 产 1 个${d.productName}（约 ${fmt(d.productPrice)}）· 窝里最多 ${d.cap} 个</small></div><button class="btn" data-animal="${d.id}" ${lock || s.pens.length >= s.penN ? 'disabled' : ''}>${lock ? d.lv + ' 级' : fmt(d.price) + ' D币'}</button></div>` }).join('')
  if (tab === 'tree') body = `<div class="note">能量球每 3 小时长一颗，去能量树下收；攒够能量就能种树，树会定时长出木材。别人能偷你的能量（每颗最多被偷 2 次），也能帮你给树浇水（你 +${R.MANOR.treeWater}g）。</div><div class="sum"><span>现在有 <b>${fmt(s.energy)}g</b> 能量 · 树 ${s.trees.length} / ${R.MANOR.treesMax}</span></div>` + R.M_TREES.map((d) => { const lock = d.lv > lv; return `<div class="row ${lock ? 'locked' : ''}">${icon(d.id)}<div class="t"><b>${d.name}</b><small>需要 ${d.energy}g 能量 · ${dur(d.every * 60)} 出 1 块木材，最多攒 ${d.cap} 块</small></div><button class="btn" data-tree="${d.id}" ${lock || s.energy < d.energy || s.trees.length >= R.MANOR.treesMax ? 'disabled' : ''}>${lock ? d.lv + ' 级' : '种下'}</button></div>` }).join('')
  if (tab === 'expand') {
    const wood = s.inv.wood || 0, np = s.plotN + 1, nn = s.penN + 1
    const pc = np <= R.MANOR.plotsMax ? R.MANOR.plotCost(np) : null, nc = nn <= R.MANOR.pensMax ? R.MANOR.penCost(nn) : null
    body = `<div class="note">扩建要用木材（种树得来，也可以去别人家拿）。仓库里有 ${wood} 块木材。</div>
      <div class="row">${icon('bokchoy')}<div class="t"><b>扩一块地（${s.plotN} / ${R.MANOR.plotsMax}）</b><small>${pc ? `${fmt(pc.coins)} D币 + ${pc.wood} 木材` : '已经最大'}</small></div><button class="btn" data-expand="plot" ${pc && wood >= pc.wood ? '' : 'disabled'}>扩建</button></div>
      <div class="row">${icon('chick')}<div class="t"><b>扩一个栏位（${s.penN} / ${R.MANOR.pensMax}）</b><small>${nc ? `${fmt(nc.coins)} D币 + ${nc.wood} 木材` : '已经最大'}</small></div><button class="btn" data-expand="pen" ${nc && wood >= nc.wood ? '' : 'disabled'}>扩建</button></div>
      <div class="row"><div class="av">🐕</div><div class="t"><b>看门狗 ${s.dog ? '（已经有了）' : ''}</b><small>${R.MANOR.dog.lv} 级以上 · ${fmt(R.MANOR.dog.coins)} D币 + ${R.MANOR.dog.wood} 木材。来偷的人有 ${R.MANOR.dogCatch * 100}% 概率被逮住，赔你 ${R.MANOR.dogFine} D币</small></div><button class="btn" data-dog ${s.dog || lv < R.MANOR.dog.lv || wood < R.MANOR.dog.wood ? 'disabled' : ''}>${s.dog ? '已养' : '养狗'}</button></div>`
  }
  openSheet('商店', `<div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div><div class="list">${body}</div>`, (b) => {
    b.querySelectorAll('[data-tab]').forEach((x) => x.onclick = () => openShop(x.dataset.tab))
    b.querySelectorAll('[data-buy]').forEach((x) => x.onclick = () => { doOwn([{ a: 'buySeed', c: x.dataset.buy, n: Number(x.dataset.n) }]); openShop('seed') })
    b.querySelectorAll('[data-animal]').forEach((x) => x.onclick = () => { closeSheet(); doOwn([{ a: 'buyAnimal', k: x.dataset.animal }], 'cheer') })
    b.querySelectorAll('[data-tree]').forEach((x) => x.onclick = () => { closeSheet(); doOwn([{ a: 'plantTree', k: x.dataset.tree }], 'cheer'); walkTo(A.treeSpot(home.state.trees.length - 1).x, A.treeSpot(0).y + 12) })
    b.querySelectorAll('[data-expand]').forEach((x) => x.onclick = () => { doOwn([{ a: 'expand', what: x.dataset.expand }], 'cheer'); openShop('expand') })
    b.querySelectorAll('[data-dog]').forEach((x) => x.onclick = () => { closeSheet(); doOwn([{ a: 'dog' }], 'cheer'); dogAlert = performance.now() + 1500 })
  })
}
async function openNeighbors() {
  openSheet('去谁家串门？', '<div class="empty">正在找邻居…</div>')
  try {
    const j = await api('/api/manor/neighbors')
    const rows = j.list.map((n) => `<div class="row"><div class="av">${n.avatar ? `<img alt="" src="${esc(n.avatar)}" style="width:44px;height:44px;border-radius:50%">` : esc((n.name || '?').slice(0, 1))}</div>
      <div class="t"><b>${esc(n.name)} <small style="display:inline;color:#7a8a6a">Lv${n.lv}</small></b><small>${n.ripe ? '<span class="tag ripe">有东西可拿</span>' : n.ripeIn ? `<span class="tag soon">${dur(n.ripeIn)}后有得拿</span>` : ''}${n.help ? '<span class="tag help">需要帮忙</span>' : ''}${!n.ripe && !n.ripeIn && !n.help ? '最近来过' : ''}</small></div>
      <button class="btn" data-go="${n.id}">去看看</button></div>`).join('')
    openSheet('去谁家串门？', `<div class="note">每天最多偷 ${R.MANOR.dailySteal} 次；帮忙（浇水、除虫、除草、喂食、打扫、浇树）前 ${R.MANOR.dailyHelpPaid} 次每次 +${R.MANOR.helpCoins} D币。今天已偷 ${home.state.cnt.steal || 0} 次，帮忙 ${home.state.cnt.helpPaid || 0} 次。</div><div class="list">${rows || '<div class="empty">还没有邻居，叫朋友来开庄园吧</div>'}</div>`, (b) => {
      b.querySelectorAll('[data-go]').forEach((x) => x.onclick = () => goVisit(Number(x.dataset.go)))
    })
  } catch (e) { openSheet('去谁家串门？', `<div class="empty">${esc(e.message)}</div>`) }
}
function openLogs() {
  const s = home.state
  const verb = { steal: '偷走了', caught: '来偷东西，被看门狗逮住，赔了', water: '帮你浇了', bug: '帮你除了虫', weed: '帮你拔了草', feed: '帮你喂了', clean: '帮你打扫了', waterTree: '帮你给树浇了水' }
  const rows = s.logs.map((l) => { const [t, , who, kind, item, n] = l; const what = kind === 'steal' ? `${n}${item === 'energy' ? 'g 能量' : ' 个' + name(item)}` : kind === 'caught' ? `${n} D币` : (R.M_NAME[item] || { chick: '小鸡', rabbit: '兔子', sheep: '绵羊', cow: '奶牛', seabuck: '沙棘', pine: '樟子松', poplar: '胡杨' }[item] || ''); return `<div class="row" style="${t > s.seen ? 'border-color:#f2c46b;background:#fffaf0' : ''}"><div class="av" style="background:${kind === 'steal' ? 'linear-gradient(135deg,#f59e7a,#d4493b)' : kind === 'caught' ? 'linear-gradient(135deg,#f5c242,#c88a12)' : ''}">${kind === 'steal' ? '偷' : kind === 'caught' ? '汪' : '帮'}</div><div class="t"><b>${esc(who)} ${verb[kind] || kind} ${esc(what)}</b><small>${ago(t)}</small></div><button class="btn ghost" data-go="${l[1]}">回访</button></div>` }).join('')
  openSheet('庄园动态', `<div class="list">${rows || '<div class="empty">还没人来过。去别人家串串门，他们也会来的</div>'}</div>`, (b) => b.querySelectorAll('[data-go]').forEach((x) => x.onclick = () => goVisit(Number(x.dataset.go))))
  if (s.logs.some((l) => l[0] > s.seen)) { s.seen = now(); queue.push({ a: 'seen' }); schedule(); hud() }
}
function openHelp() {
  openSheet('怎么玩', `<div class="help">
    <h3>🌱 自己的庄园</h3><ul><li>点空地播种；成熟前会<b>缺水 💧、长虫 🐛、长草 🌿</b>，点一下处理，没处理的成熟时减产。</li><li>熟了点一下收菜，去「仓库」卖成 D币（每天最多卖 ${fmt(R.MANOR.dailyEarn)}）。</li><li>牧场的动物每天喂一次，会产蛋、兔毛、羊毛、牛奶；粪便要打扫。</li><li>能量树每 3 小时长一颗能量球，收起来攒够了就能种树，树会长木材，木材用来扩建、搭狗窝。</li></ul>
    <h3>🏃 去串门</h3><ul><li>点「串门」看谁家有东西可拿。<b>✋</b> 表示能偷：成熟的作物（每块地最多被偷 30%）、动物产物、能量球、木材。</li><li>也可以做好人：帮别人浇水、除虫、除草、喂食、打扫、给树浇水，每天前 ${R.MANOR.dailyHelpPaid} 次各得 ${R.MANOR.helpCoins} D币。</li><li>有看门狗的人家，每次偷有 ${R.MANOR.dogCatch * 100}% 概率被逮，赔主人 ${R.MANOR.dogFine} D币。</li></ul>
    <h3>📜 动态</h3><p>谁来偷了、谁来帮了，都记在「动态」里，可以直接回访（报仇或者道谢）。</p></div>`)
}
document.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => {
  if (!home) return
  const k = b.dataset.open
  if (k === 'visit') return openNeighbors()
  if (visit && k !== 'help') { toast('先回家再说'); return }
  if (k === 'bag') openBag(); if (k === 'shop') openShop(); if (k === 'logs') openLogs(); if (k === 'help') openHelp()
})

// ---------- 启动 ----------
window.addEventListener('resize', resize)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && home && !visit && !queue.length && !sending) loadHome().catch(() => {}) })
window.addEventListener('pagehide', () => { if (queue.length) navigator.sendBeacon?.('/api/manor/act', new Blob([JSON.stringify({ rev: home.rev, operation: uuid(), actions: queue.splice(0) })], { type: 'application/json' })) })
resize()
requestAnimationFrame(frame)
loadHome().then(() => {
  $('#loading').classList.add('off')
  const id = Number(new URLSearchParams(location.search).get('visit'))
  const first = !id && !home.state.logs.length && !home.state.plots.some(Boolean) && home.state.xp === 0
  if (first) { setTimeout(() => { say('点空地种小白菜吧！', 3000); toast('欢迎来到肥鱼庄园：先种菜，再去「串门」逛逛') }, 600) }
  if (id && id !== home.me) goVisit(id)
}).catch((e) => { $('#loading').textContent = e.message })
