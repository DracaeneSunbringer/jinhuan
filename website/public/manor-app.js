// 肥鱼庄园（站内版）：嵌在网站页面里，按功能分标签——菜地 / 牧场 / 林子 / 串门 / 仓库 / 商店 / 动态。
// 第一人称卡片风：每个标签是「大肥鱼眼前看到的东西」，一张卡片一块地 / 一只动物 / 一棵树，点卡片就做最合适的事；顶部有一键操作。
// 只在打开页面、切到串门、点按钮时请求接口；不轮询（倒计时在本地走）。
import * as R from '/manor-rules.js'
import * as A from '/manor-art.js'

const fmt = (n) => Math.round(n).toLocaleString('zh-CN')
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
export const dur = (s) => { s = Math.max(0, Math.round(s)); if (s < 60) return s + '秒'; const m = Math.round(s / 60); if (m < 60) return m + '分钟'; const h = Math.floor(m / 60); return h + '小时' + (m % 60 ? (m % 60) + '分' : '') }
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16) })
export const itemName = (id) => R.M_NAME[id] || (id === 'energy' ? '能量' : { chick: '小鸡', rabbit: '兔子', sheep: '山羊', cow: '奶牛', seabuck: '沙棘', pine: '樟子松', poplar: '胡杨' }[id] || id)

// ---------- 接口 ----------
let skew = 0
export const now = () => Math.floor(Date.now() / 1000 + skew)
export async function manorApi(path, body) {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (r.status === 401) throw Object.assign(new Error('请先登录'), { status: 401 })
  if (!r.ok && !j.state) throw new Error(j.error || '网络开小差了')
  if (j.now) skew = j.now - Date.now() / 1000
  return { status: r.status, ...j }
}

// 自己庄园里「现在能做的事」全部列出来（一键全收 / 悬浮小窗共用）
export function chores(s, uid, t) {
  const harvest = [], fix = [], pens = [], wood = []
  s.plots.forEach((p, i) => { if (!p) return; const v = R.plotView(p, i, t); if (v.ripe) harvest.push({ a: 'harvest', i }); else v.open.forEach((bit) => fix.push({ a: 'fix', i, bit })) })
  s.pens.forEach((pen, i) => { const v = R.penView(pen, t); if (v.n) pens.push({ a: 'collect', i }); if (v.mess) pens.push({ a: 'clean', i }); if (v.feedable) pens.push({ a: 'feed', i }) })
  s.trees.forEach((tr, i) => { if (R.treeView(tr, t).n) wood.push({ a: 'wood', i }) })
  const balls = R.ballsView(s, uid, t).filter((b) => b.ripe)
  const ballG = balls.reduce((a, b) => a + b.have, 0)
  const all = [...harvest, ...fix, ...pens, ...wood, ...(balls.length ? [{ a: 'balls' }] : [])]
  return { harvest, fix, pens, wood, balls, ballG, all, empty: s.plots.filter((p) => !p).length }
}
// 在别人庄园里能偷 / 能帮的
export function visitChores(s, ownerId, me, t) {
  const steal = [], help = []
  s.plots.forEach((p, i) => { if (!p) return; const v = R.plotView(p, i, t); if (v.ripe) { if (v.stealLeft > 0 && !p.by.includes(me)) steal.push({ a: 'steal', i }) } else v.open.forEach((bit) => help.push({ a: 'fix', i, bit })) })
  s.pens.forEach((pen, i) => { const v = R.penView(pen, t); if (v.stealLeft > 0 && !pen.by.includes(me)) steal.push({ a: 'stealPen', i }); if (v.mess) help.push({ a: 'clean', i }); if (v.feedable) help.push({ a: 'feed', i }) })
  R.ballsView(s, ownerId, t).forEach((b) => { if (b.stealable && !b.by.includes(me)) steal.push({ a: 'stealBall', k: b.k }) })
  s.trees.forEach((tr, i) => { const v = R.treeView(tr, t); if (v.stealLeft && !tr.by.includes(me)) steal.push({ a: 'stealWood', i }); else if (tr.wd !== s.day) help.push({ a: 'waterTree', i }) })
  return { steal, help }
}

// ---------- 素材（Kenney CC0：Nature Kit / Food Kit / Animal Pack Remastered，见 /manor/NOTICE.txt） ----------
const IMG = { bokchoy: 'bokchoy', carrot: 'carrot', corn: 'corn', strawberry: 'strawberry', watermelon: 'watermelon', pumpkin: 'pumpkin', egg: 'egg', milk: 'milk', wood: 'wood', seabuck: 'seabuck', pine: 'pine', poplar: 'poplar', chick: 'a-chick', rabbit: 'a-rabbit', sheep: 'a-sheep', cow: 'a-cow', dog: 'a-dog', seedbag: 'seedbag', sprout: 'sprout', leafy: 'leafy', cornGrow: 'cornGrow' }
const V = '?v=1'
export const imgSrc = (id) => (IMG[id] ? `/manor/${IMG[id]}.webp${V}` : A.iconUrl(id, 96))
const im = (id, cls = '', style = '') => `<img alt="" class="${cls}" style="${style}" src="${imgSrc(id)}" loading="lazy" decoding="async">`
const issueUrl = (() => { const c = {}; return (bit) => c[bit] ||= (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 40; const g = cv.getContext('2d'); g.scale(2, 2); A.issueIcon(g, 10, 10, bit, 0); return cv.toDataURL() })() })()
const poopUrl = (() => { let u; return () => u ||= (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d'); g.scale(3, 3); A.poop(g, 5.3, 8); return cv.toDataURL() })() })()
// 卡片里的小场景（HTML 叠图，不用画布）
function plotScene(p, v, locked) {
  if (locked) return '<div class="mn-scene lock"><i class="mn-soil"></i><b class="mn-plus">＋</b></div>'
  if (!p) return '<div class="mn-scene"><i class="mn-soil"></i></div>'
  const pos = [[22, 0], [50, 6], [78, 0]]
  let plants = ''
  if (v.ripe) plants = pos.map(([x, y], k) => im(p.c, 'mn-plant ripe', `left:${x}%;bottom:${18 + y}px;--d:${k * 0.2}s`)).join('')
  else { const id = v.stage === 0 ? 'sprout' : p.c === 'corn' && v.stage === 2 ? 'cornGrow' : 'leafy', h = v.stage === 0 ? 22 : v.stage === 1 ? 34 : 50; plants = pos.map(([x, y]) => im(id, 'mn-plant', `left:${x}%;bottom:${16 + y}px;height:${id === 'cornGrow' ? h + 14 : h}px`)).join('') }
  const issues = v.ripe ? '' : v.open.map((bit, k) => `<img alt="" class="mn-issue" style="right:${6 + k * 22}px" src="${issueUrl(bit)}">`).join('')
  return `<div class="mn-scene ${v.ripe ? 'ripe' : ''}"><i class="mn-soil${!v.ripe && !v.open.includes(1) ? ' wet' : ''}"></i>${plants}${issues}</div>`
}
function penScene(pen, v) {
  const items = Array.from({ length: Math.min(v.n, 5) }, (_, k) => im(v.d.product, 'mn-prod', `left:${54 + k * 9}%`)).join('')
  const poop = Array.from({ length: v.mess }, (_, k) => `<img alt="" class="mn-poop" style="left:${10 + k * 12}%" src="${poopUrl()}">`).join('')
  return `<div class="mn-scene ranch">${im(pen.k, 'mn-animal' + (v.hungry ? ' sleepy' : ''))}${v.hungry ? '<b class="mn-zzz">z<small>z</small></b>' : ''}<i class="mn-nest"></i>${items}${poop}</div>`
}
function treeScene(k, wood) { return `<div class="mn-scene forest">${k ? im(k, 'mn-tree') : '<b class="mn-plus">＋</b>'}${Array.from({ length: Math.min(wood, 4) }, (_, n) => im('wood', 'mn-log', `left:${8 + n * 13}%`)).join('')}</div>` }

// ---------- 小画布（卡片插图） ----------
function art(w, h, draw) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), cv = document.createElement('canvas')
  cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.className = 'mn-art'
  const g = cv.getContext('2d'); g.scale(dpr, dpr); draw(g); return cv
}
const sky = (g, w, h, top = '#cdeccf', bottom = '#9fd27a') => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, w, h) }
const icon = (id, size = 28) => id.startsWith('seed:') ? `<span class="mn-ic seed" style="width:${size}px;height:${size}px"><img alt="" src="${imgSrc('seedbag')}"><img alt="" src="${imgSrc(id.slice(5))}"></span>` : `<img class="mn-ic" alt="" width="${size}" height="${size}" src="${imgSrc(id)}">`

// ---------- 大肥鱼（角落里的小人：做动作 + 说话） ----------
const whale = { img: null, meta: null, loading: null }
function loadWhale() {
  if (whale.loading) return whale.loading
  whale.img = new Image(); whale.img.src = '/pets/dsh/isle/whale.webp?v=1'
  whale.loading = Promise.all([new Promise((ok) => { whale.img.onload = ok; whale.img.onerror = ok }), fetch('/pets/dsh/isle/whale.json?v=1').then((r) => r.json()).then((m) => { whale.meta = m }).catch(() => {})])
  return whale.loading
}
function fishWidget(size = 64) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), cv = document.createElement('canvas')
  cv.width = size * dpr; cv.height = size * dpr; cv.style.width = cv.style.height = size + 'px'; cv.className = 'mn-fish'
  const g = cv.getContext('2d'); let clip = 'idle', t0 = performance.now(), raf = 0, alive = true
  const frame = (tm) => {
    if (!alive) return
    const M = whale.meta
    if (M && whale.img.naturalWidth) {
      const c = M.clips[clip] || M.clips.idle, k = (tm - t0) / 1000
      let idx = Math.floor(k * c.fps)
      if (clip !== 'idle') { if (idx >= c.n) { clip = 'idle'; t0 = tm; idx = 0 } } else idx %= c.n
      const cc = M.clips[clip], fi = cc.start + Math.min(cc.n - 1, idx), sx = (fi % M.cols) * M.w, sy = Math.floor(fi / M.cols) * M.h
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, size, size)
      const dh = size * 1.02, dw = (dh * M.w) / M.h
      g.drawImage(whale.img, sx, sy, M.w, M.h, size / 2 - (M.cx / M.w) * dw, size - (M.foot / M.h) * dh, dw, dh)
    }
    // 空闲时降帧：每 250ms 画一次就够了
    raf = clip === 'idle' ? setTimeout(() => requestAnimationFrame(frame), 250) : requestAnimationFrame(frame)
  }
  loadWhale().then(() => requestAnimationFrame(frame))
  return { el: cv, play(c) { clip = c; t0 = performance.now() }, stop() { alive = false; clearTimeout(raf) } }
}

// ---------- 页面 ----------
const TABS = [['farm', '菜地', '🥕'], ['ranch', '牧场', '🐔'], ['forest', '林子', '🌳'], ['visit', '串门', '🏃'], ['bag', '仓库', '🧺'], ['shop', '商店', '🏪'], ['logs', '动态', '📜']]
export async function mountManor(root, { onLeave, toast: siteToast } = {}) {
  root.innerHTML = '<div class="mn"><div class="mn-load">大肥鱼正在去庄园的路上…</div></div>'
  const box = root.querySelector('.mn')
  let home, visit = null, tab = new URLSearchParams(location.search).get('tab') || 'farm', alive = true
  let queue = [], sending = false, lastSend = 0, flushT = 0, tickT = 0, busy = false
  const fish = fishWidget(68)
  const toast = (m) => { if (!m) return; if (siteToast) siteToast(m); else { const el = box.querySelector('.mn-say'); if (el) el.textContent = m } }
  const say = (m) => { const el = box.querySelector('.mn-say'); if (el && m) { el.textContent = m; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop') } }
  onLeave?.(() => { alive = false; fish.stop(); clearInterval(tickT); clearTimeout(flushT); if (queue.length) flush(true) })

  try {
    const j = await manorApi('/api/manor')
    home = { me: j.me, name: j.name, rev: j.rev, state: j.state, coins: j.coins }
  } catch (e) {
    box.innerHTML = `<div class="mn-empty"><b>庄园打不开</b><p>${esc(e.message)}</p>${e.status === 401 ? '<a class="mn-btn" href="/login?next=%2Fmanor">去登录</a>' : ''}</div>`; return
  }
  if (!alive) return
  const vid = Number(new URLSearchParams(location.search).get('visit'))
  box.innerHTML = `
    <section class="mn-head">
      <div class="mn-fishbox"></div>
      <div class="mn-who"><div class="mn-title"><b class="mn-name"></b><span class="mn-lv"></span></div><div class="mn-xp"><i></i></div></div>
      <div class="mn-stats"><span class="mn-pill coin" title="D币"><span class="mn-coin"></span><b class="mn-coins"></b></span><span class="mn-pill energy" title="能量（种树用）"><i></i><b class="mn-energy"></b></span><button type="button" class="mn-minitoggle" hidden>打开右下角小窗</button></div>
      <div class="mn-say" aria-live="polite"></div>
    </section>
    <div class="mn-visitbar" hidden><span></span><button type="button" class="mn-btn sm" data-home>回家</button></div>
    <nav class="mn-tabs" role="tablist"></nav>
    <div class="mn-tools"></div>
    <div class="mn-body"></div>`
  box.querySelector('.mn-fishbox').append(fish.el)
  try { if (localStorage.getItem('manorMiniHidden') === '1') { const b = box.querySelector('.mn-minitoggle'); b.hidden = false; b.onclick = () => import('/manor-mini.js').then((m) => { m.setMiniHidden(false); b.hidden = true; say('右下角的小窗回来了') }) } } catch {}
  box.querySelector('[data-home]').onclick = () => goHome()
  const $ = (s) => box.querySelector(s)

  function setTab(t) {
    tab = t
    const u = new URL(location.href); u.searchParams.set('tab', t); if (visit) u.searchParams.set('visit', visit.id); else u.searchParams.delete('visit'); history.replaceState(history.state, '', u)
    render()
  }
  function head() {
    const s = home.state, lv = R.levelOf(s.xp), lo = R.LEVELS[lv - 1] ?? 0, hi = R.LEVELS[lv] ?? lo
    $('.mn-name').textContent = visit ? `${visit.name} 的庄园` : `${home.name || '我'} 的庄园`
    $('.mn-lv').textContent = `我 Lv${lv}`
    $('.mn-xp i').style.width = (hi > lo ? Math.min(100, ((s.xp - lo) / (hi - lo)) * 100) : 100) + '%'
    $('.mn-coins').textContent = fmt(home.coins); $('.mn-energy').textContent = fmt(s.energy) + 'g'
    $('.mn-visitbar').hidden = !visit
    if (visit) $('.mn-visitbar span').textContent = `正在 ${visit.name} 家串门 · 今天偷了 ${s.cnt.steal || 0}/${R.MANOR.dailySteal} 次，帮忙 ${s.cnt.helpPaid || 0}/${R.MANOR.dailyHelpPaid} 次`
    const unseen = s.logs.filter((l) => l[0] > s.seen).length
    const tabs = visit ? TABS.filter(([k]) => ['farm', 'ranch', 'forest', 'visit'].includes(k)) : TABS
    if (visit && !['farm', 'ranch', 'forest', 'visit'].includes(tab)) tab = 'farm'
    $('.mn-tabs').innerHTML = tabs.map(([k, n, e]) => `<button type="button" role="tab" data-tab="${k}" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}"><span>${e}</span>${n}${k === 'logs' && unseen ? `<b class="mn-badge">${unseen > 99 ? '99+' : unseen}</b>` : ''}</button>`).join('')
    box.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => setTab(b.dataset.tab))
  }
  const cur = () => (visit ? visit.state : home.state)
  const curUid = () => (visit ? visit.id : home.me)

  function render() {
    if (!alive) return
    head()
    const t = now(), tools = $('.mn-tools'), body = $('.mn-body')
    tools.innerHTML = ''; body.innerHTML = ''
    if (tab === 'farm') renderFarm(tools, body, t)
    else if (tab === 'ranch') renderRanch(tools, body, t)
    else if (tab === 'forest') renderForest(tools, body, t)
    else if (tab === 'visit') renderVisitList(tools, body)
    else if (tab === 'bag') renderBag(tools, body)
    else if (tab === 'shop') renderShop(tools, body, 'seed')
    else if (tab === 'logs') renderLogs(tools, body)
  }
  // 一键按钮
  function quick(tools, label, n, fn, cls = '') { const b = document.createElement('button'); b.type = 'button'; b.className = 'mn-btn ' + cls; b.innerHTML = `${label}${n ? ` <b>${n}</b>` : ''}`; b.disabled = !n; b.onclick = fn; tools.append(b); return b }
  function hint(tools, text) { const p = document.createElement('p'); p.className = 'mn-hint'; p.textContent = text; tools.append(p) }
  function card(body, { cls = '', canvas, title, sub, badge, btn, btnCls = '', onClick, extra }) {
    const c = document.createElement('div'); c.className = 'mn-card ' + cls; c.tabIndex = 0; c.setAttribute('role', 'button')
    if (typeof canvas === 'string') c.insertAdjacentHTML('beforeend', canvas); else if (canvas) c.append(canvas)
    c.insertAdjacentHTML('beforeend', `<div class="mn-ct"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>${badge ? `<span class="mn-cbadge">${badge}</span>` : ''}${btn ? `<span class="mn-cbtn ${btnCls}">${btn}</span>` : ''}${extra || ''}`)
    if (onClick) { c.onclick = onClick; c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } } else c.classList.add('still')
    body.append(c); return c
  }
  const grid = (body, cls = '') => { const g = document.createElement('div'); g.className = 'mn-grid ' + cls; body.append(g); return g }

  // ----- 菜地 -----
  function renderFarm(tools, body, t) {
    const s = cur(), g = grid(body)
    if (!visit) {
      const c = chores(s, home.me, t)
      quick(tools, '一键收菜', c.harvest.length, () => own(c.harvest, 'crouch'), 'gold')
      quick(tools, '一键浇水除虫', c.fix.length, () => own(c.fix, 'crouch'))
      quick(tools, '一键种满', c.empty, () => plantSheet(-1), 'ghost')
    } else { const v = visitChores(s, visit.id, home.me, t); quick(tools, '✋ 一键偷菜', v.steal.filter((a) => a.a === 'steal').length, () => vis(v.steal.filter((a) => a.a === 'steal')), 'red'); quick(tools, '💧 一键帮忙', v.help.filter((a) => a.a === 'fix').length, () => vis(v.help.filter((a) => a.a === 'fix'))) }
    for (let i = 0; i < Math.min(R.MANOR.plotsMax, s.plotN + (visit ? 0 : 1)); i++) {
      if (i >= s.plotN) { const cost = R.MANOR.plotCost(s.plotN + 1); card(g, { cls: 'lock', canvas: plotScene(null, null, true), title: '扩一块地', sub: `${fmt(cost.coins)} D币 + ${cost.wood} 木材`, btn: '扩建', onClick: () => renderShopAt('expand') }); continue }
      const p = s.plots[i], v = p ? R.plotView(p, i, t) : null
      const cv = plotScene(p, v)
      if (!p) { card(g, { canvas: cv, title: '空地', sub: visit ? '没种东西' : '点一下播种', btn: visit ? '' : '播种', onClick: visit ? null : () => plantSheet(i) }); continue }
      const issues = v.open.map((b) => R.ISSUES.find((x) => x.bit === b).name)
      if (v.ripe) {
        if (visit) { const mine = p.by.includes(home.me), can = v.stealLeft > 0 && !mine; card(g, { cls: 'ripe', canvas: cv, title: `${v.c.name} 熟了`, sub: mine ? '这块你偷过了' : can ? `还能偷 ${v.stealLeft} 份` : '被偷光了，给主人留点', btn: can ? '✋ 偷' : '', btnCls: 'red', onClick: can ? () => vis([{ a: 'steal', i }]) : null }) }
        else card(g, { cls: 'ripe', canvas: cv, title: `${v.c.name} 熟了`, sub: `能收 ${v.have} 份${p.s ? `（被偷了 ${p.s}）` : ''}${v.yieldN < v.c.n ? ` · 减产 ${v.c.n - v.yieldN}` : ''}`, btn: '收获', btnCls: 'gold', onClick: () => own([{ a: 'harvest', i }], 'crouch') })
      } else {
        const fix = v.open.map((bit) => ({ a: 'fix', i, bit }))
        card(g, { cls: issues.length ? 'warn' : '', canvas: cv, title: v.c.name, sub: `<span data-left="${v.ripeAt}">${dur(v.left)}</span> 后成熟${issues.length ? ` · <em>${issues.join('、')}</em>` : ''}`, btn: issues.length ? (visit ? '帮忙' : '处理') : '', onClick: issues.length ? () => (visit ? vis(fix) : own(fix, 'crouch')) : null, extra: `<i class="mn-prog" style="--k:${(1 - v.left / (v.c.grow * 60)).toFixed(3)}"></i>` })
      }
    }
    if (!visit) hint(tools, '成熟前会缺水、长虫、长草，没处理的成熟时减产；熟了别人能偷走最多 30%。')
  }
  // ----- 牧场 -----
  function renderRanch(tools, body, t) {
    const s = cur(), g = grid(body)
    if (!visit) { const c = chores(s, home.me, t); quick(tools, '一键收喂扫', c.pens.length, () => own(c.pens, 'crouch'), 'gold'); quick(tools, '买动物', s.pens.length < s.penN ? 1 : 0, () => renderShopAt('animal'), 'ghost') }
    else { const v = visitChores(s, visit.id, home.me, t); quick(tools, '✋ 一键顺走', v.steal.filter((a) => a.a === 'stealPen').length, () => vis(v.steal.filter((a) => a.a === 'stealPen')), 'red'); quick(tools, '🧹 一键帮忙', v.help.filter((a) => a.a === 'clean' || a.a === 'feed').length, () => vis(v.help.filter((a) => a.a === 'clean' || a.a === 'feed'))) }
    s.pens.forEach((pen, i) => {
      const v = R.penView(pen, t), d = v.d
      const cv = penScene(pen, v)
      const status = [v.hungry ? '饿了' : `吃饱还剩 ${dur(v.fedLeft)}`, v.n ? `窝里 ${v.n} 个${d.productName}` : `${dur(v.next)}后产 1 个`, v.mess ? `${v.mess} 坨粪便` : ''].filter(Boolean).join(' · ')
      if (visit) {
        const acts = []; if (v.stealLeft > 0 && !pen.by.includes(home.me)) acts.push({ a: 'stealPen', i }); if (v.mess) acts.push({ a: 'clean', i }); if (v.feedable) acts.push({ a: 'feed', i })
        card(g, { cls: acts.some((a) => a.a === 'stealPen') ? 'ripe' : v.mess || v.hungry ? 'warn' : '', canvas: cv, title: d.name, sub: status, btn: acts.length ? (acts[0].a === 'stealPen' ? '✋ 顺走' : '帮忙') : '', btnCls: acts[0]?.a === 'stealPen' ? 'red' : '', onClick: acts.length ? () => vis(acts) : null })
      } else {
        const acts = []; if (v.n) acts.push({ a: 'collect', i }); if (v.mess) acts.push({ a: 'clean', i }); if (v.feedable) acts.push({ a: 'feed', i })
        card(g, { cls: v.n ? 'ripe' : v.hungry || v.mess ? 'warn' : '', canvas: cv, title: d.name, sub: status, btn: acts.length ? (v.n ? '收' : v.feedable ? '喂' : '扫') : '更多', btnCls: v.n ? 'gold' : '', onClick: () => (acts.length ? own(acts, 'crouch') : penSheet(i)) })
      }
    })
    if (!visit) for (let i = s.pens.length; i < Math.min(R.MANOR.pensMax, s.penN + 1); i++) {
      const locked = i >= s.penN, cost = R.MANOR.penCost(s.penN + 1)
      card(g, { cls: 'lock', canvas: '<div class="mn-scene ranch lock"><i class="mn-nest"></i><b class="mn-plus">＋</b></div>', title: locked ? '扩一个栏位' : '空栏位', sub: locked ? `${fmt(cost.coins)} D币 + ${cost.wood} 木材` : '买只动物', btn: locked ? '扩建' : '买', onClick: () => renderShopAt(locked ? 'expand' : 'animal') })
    }
    if (!s.pens.length && visit) body.insertAdjacentHTML('beforeend', '<div class="mn-empty">这家还没养动物</div>')
  }
  // ----- 林子（能量球 + 树） -----
  function renderForest(tools, body, t) {
    const s = cur(), uid = curUid(), balls = R.ballsView(s, uid, t)
    if (!visit) { const ripe = balls.filter((b) => b.ripe); quick(tools, `收能量${ripe.length ? ' ' + ripe.reduce((a, b) => a + b.have, 0) + 'g' : ''}`, ripe.length, () => own([{ a: 'balls' }], 'cheer'), 'gold'); const c = chores(s, home.me, t); quick(tools, '一键收木材', c.wood.length, () => own(c.wood, 'slam')); quick(tools, '种树', s.trees.length < R.MANOR.treesMax ? 1 : 0, () => renderShopAt('tree'), 'ghost') }
    else { const v = visitChores(s, visit.id, home.me, t); quick(tools, '✋ 一键偷能量木材', v.steal.filter((a) => a.a === 'stealBall' || a.a === 'stealWood').length, () => vis(v.steal.filter((a) => a.a === 'stealBall' || a.a === 'stealWood')), 'red'); quick(tools, '💧 给树浇水', v.help.filter((a) => a.a === 'waterTree').length, () => vis(v.help.filter((a) => a.a === 'waterTree'))) }
    // 能量球：一排会发光的小球
    const strip = document.createElement('div'); strip.className = 'mn-balls'; body.append(strip)
    strip.insertAdjacentHTML('beforeend', `<div class="mn-dream">${im('seabuck', 'mn-tree')}<small>能量树</small></div>`)
    const list = document.createElement('div'); list.className = 'mn-ball-list'; strip.append(list)
    if (!balls.length) list.innerHTML = '<span class="mn-hint">能量球每 3 小时长一颗，下一颗正在长…</span>'
    for (const b of balls) {
      const can = visit ? b.stealable && !b.by.includes(home.me) : b.ripe
      const el = document.createElement('button'); el.type = 'button'; el.className = 'mn-ball' + (b.ripe ? ' ripe' : '') + (can ? '' : ' dim')
      el.innerHTML = `<i></i><b>${visit ? (b.stealable ? '偷' + b.stealable : b.have) : b.have}g</b><small>${b.ripe ? (visit ? (b.by.includes(home.me) ? '收过了' : b.stealable ? '可以收' : '被收两次了') : '成熟了') : `<span data-left="${t + b.left}">${dur(b.left)}</span>`}</small>`
      el.disabled = !can; el.onclick = () => (visit ? vis([{ a: 'stealBall', k: b.k }]) : own([{ a: 'balls' }], 'cheer'))
      list.append(el)
    }
    const g = grid(body)
    s.trees.forEach((tr, i) => {
      const v = R.treeView(tr, t)
      const cv = treeScene(tr.k, v.n)
      if (visit) { const can = v.stealLeft && !tr.by.includes(home.me), water = tr.wd !== s.day; card(g, { cls: can ? 'ripe' : '', canvas: cv, title: v.d.name, sub: `木材 ${v.n} 块${water ? ' · 今天还没人浇水' : ' · 今天浇过了'}`, btn: can ? '✋ 拿木材' : water ? '浇水' : '', btnCls: can ? 'red' : '', onClick: can ? () => vis([{ a: 'stealWood', i }]) : water ? () => vis([{ a: 'waterTree', i }]) : null }) }
      else card(g, { cls: v.n ? 'ripe' : '', canvas: cv, title: v.d.name, sub: v.n ? `有 ${v.n} 块木材` : `<span data-left="${t + v.next}">${dur(v.next)}</span>后出木材`, btn: v.n ? '收木材' : '', btnCls: 'gold', onClick: v.n ? () => own([{ a: 'wood', i }], 'slam') : null })
    })
    if (!visit && s.trees.length < R.MANOR.treesMax) card(g, { cls: 'lock', canvas: treeScene(null, 0), title: '空树位', sub: `现在有 ${fmt(s.energy)}g 能量`, btn: '种树', onClick: () => renderShopAt('tree') })
    if (visit && !s.trees.length) body.insertAdjacentHTML('beforeend', '<div class="mn-empty">这家还没种树</div>')
  }
  // ----- 串门列表 -----
  async function renderVisitList(tools, body) {
    if (visit) quick(tools, '回自己家', 1, () => goHome(), 'ghost')
    body.innerHTML = '<div class="mn-empty">正在找邻居…</div>'
    try {
      const j = await manorApi('/api/manor/neighbors')
      if (!alive || tab !== 'visit') return
      const s = home.state
      body.innerHTML = `<p class="mn-hint">每天最多偷 ${R.MANOR.dailySteal} 次（今天 ${s.cnt.steal || 0} 次）；帮忙前 ${R.MANOR.dailyHelpPaid} 次每次 +${R.MANOR.helpCoins} D币（今天 ${s.cnt.helpPaid || 0} 次）。有看门狗的人家偷东西可能被逮住。</p>` +
        (j.list.length ? `<div class="mn-rows">${j.list.map((n) => `<button type="button" class="mn-row" data-go="${n.id}"><span class="mn-av">${n.avatar ? `<img alt="" src="${esc(n.avatar)}">` : esc((n.name || '?').slice(0, 1))}</span><span class="mn-rt"><b>${esc(n.name)} <small>Lv${n.lv}</small></b><small>${n.ripe ? '<em class="t-ripe">有东西可拿</em>' : n.ripeIn ? `<em class="t-soon">${dur(n.ripeIn)}后有得拿</em>` : ''}${n.help ? '<em class="t-help">需要帮忙</em>' : ''}${!n.ripe && !n.ripeIn && !n.help ? '最近来过' : ''}</small></span><span class="mn-cbtn">去看看</span></button>`).join('')}</div>` : '<div class="mn-empty">还没有邻居，叫朋友来开庄园吧</div>')
      body.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => goVisit(Number(b.dataset.go)))
    } catch (e) { body.innerHTML = `<div class="mn-empty">${esc(e.message)}</div>` }
  }
  // ----- 仓库 -----
  function renderBag(tools, body) {
    const s = home.state, items = Object.entries(s.inv).filter(([, n]) => n > 0)
    const sellable = items.filter(([id]) => Object.hasOwn(R.M_PRICE, id)), seeds = items.filter(([id]) => id.startsWith('seed:'))
    const total = sellable.filter(([id]) => id !== 'wood').reduce((a, [id, n]) => a + n * R.mPrice(id, s.day), 0)
    quick(tools, `全部卖掉（木材除外）≈ ${fmt(total)}`, sellable.filter(([id]) => id !== 'wood').length, () => own(sellable.filter(([id]) => id !== 'wood').map(([id, n]) => ({ a: 'sell', id, n }))), 'gold')
    hint(tools, `今天已卖 ${fmt(s.earn)} / ${fmt(R.MANOR.dailyEarn)} D币；价格每天小幅浮动。木材留着扩建、搭狗窝。`)
    const rows = [...sellable.map(([id, n]) => `<div class="mn-row still">${icon(id, 36)}<span class="mn-rt"><b>${itemName(id)} × ${n}</b><small>今天 ${fmt(R.mPrice(id, s.day))} D币 / 个</small></span><span class="mn-btns"><button type="button" class="mn-btn sm ghost" data-sell="${id}" data-n="1">卖 1</button><button type="button" class="mn-btn sm" data-sell="${id}" data-n="${n}">全卖</button></span></div>`),
      ...seeds.map(([id, n]) => `<div class="mn-row still">${icon(id, 36)}<span class="mn-rt"><b>${itemName(id)} × ${n}</b><small>播种时先用种子</small></span></div>`)]
    body.innerHTML = rows.length ? `<div class="mn-rows">${rows.join('')}</div>` : '<div class="mn-empty">仓库空空的，去收菜或者串门「拿」点吧</div>'
    body.querySelectorAll('[data-sell]').forEach((b) => b.onclick = () => own([{ a: 'sell', id: b.dataset.sell, n: Number(b.dataset.n) }]))
  }
  // ----- 商店 -----
  function renderShopAt(sub) { tab = 'shop'; head(); const tools = $('.mn-tools'), body = $('.mn-body'); tools.innerHTML = ''; body.innerHTML = ''; renderShop(tools, body, sub) }
  function renderShop(tools, body, sub) {
    if (visit) return goHome()
    const s = home.state, lv = R.levelOf(s.xp), wood = s.inv.wood || 0
    const subs = [['seed', '种子'], ['animal', '动物'], ['tree', '种树'], ['expand', '扩建 / 看门狗']]
    tools.innerHTML = `<div class="mn-sub">${subs.map(([k, n]) => `<button type="button" data-sub="${k}" class="${k === sub ? 'on' : ''}">${n}</button>`).join('')}</div>`
    tools.querySelectorAll('[data-sub]').forEach((b) => b.onclick = () => renderShopAt(b.dataset.sub))
    const row = (ic, title, sm, btns, lock) => `<div class="mn-row still ${lock ? 'lock' : ''}">${ic}<span class="mn-rt"><b>${title}</b><small>${sm}</small></span><span class="mn-btns">${btns}</span></div>`
    let html = ''
    if (sub === 'seed') html = R.M_CROPS.map((c) => { const lock = c.lv > lv; return row(icon('seed:' + c.id, 36), `${c.name}种子${s.inv['seed:' + c.id] ? ` <small>有 ${s.inv['seed:' + c.id]} 包</small>` : ''}`, `${fmt(c.seed)} D币 · ${dur(c.grow * 60)} · 收 ${c.n} 份 × 约 ${fmt(c.price)}`, lock ? `<button class="mn-btn sm" disabled>${c.lv} 级</button>` : `<button type="button" class="mn-btn sm ghost" data-buy="${c.id}" data-n="1">买 1</button><button type="button" class="mn-btn sm" data-buy="${c.id}" data-n="6">买 6</button>`, lock) }).join('')
    if (sub === 'animal') html = `<p class="mn-hint">栏位 ${s.pens.length}/${s.penN}。动物每天喂一次；粪便会占窝里的位置。</p>` + R.M_ANIMALS.map((d) => { const lock = d.lv > lv; return row(icon(d.id, 36), d.name, `${dur(d.every * 60)} 产 1 个${d.productName}（约 ${fmt(d.productPrice)}）· 窝里最多 ${d.cap} 个`, `<button type="button" class="mn-btn sm" data-animal="${d.id}" ${lock || s.pens.length >= s.penN ? 'disabled' : ''}>${lock ? d.lv + ' 级' : fmt(d.price)}</button>`, lock) }).join('')
    if (sub === 'tree') html = `<p class="mn-hint">现在有 ${fmt(s.energy)}g 能量 · 树 ${s.trees.length}/${R.MANOR.treesMax}。能量球去「林子」收。</p>` + R.M_TREES.map((d) => { const lock = d.lv > lv; return row(icon(d.id, 36), d.name, `${d.energy}g 能量 · ${dur(d.every * 60)} 出 1 块木材，最多攒 ${d.cap} 块`, `<button type="button" class="mn-btn sm" data-tree="${d.id}" ${lock || s.energy < d.energy || s.trees.length >= R.MANOR.treesMax ? 'disabled' : ''}>${lock ? d.lv + ' 级' : '种下'}</button>`, lock) }).join('')
    if (sub === 'expand') { const pc = s.plotN < R.MANOR.plotsMax ? R.MANOR.plotCost(s.plotN + 1) : null, nc = s.penN < R.MANOR.pensMax ? R.MANOR.penCost(s.penN + 1) : null
      html = `<p class="mn-hint">仓库里有 ${wood} 块木材。</p>` + row(icon('carrot', 36), `扩一块地（${s.plotN}/${R.MANOR.plotsMax}）`, pc ? `${fmt(pc.coins)} D币 + ${pc.wood} 木材` : '已经最大', `<button type="button" class="mn-btn sm" data-expand="plot" ${pc && wood >= pc.wood ? '' : 'disabled'}>扩建</button>`) +
        row(icon('chick', 36), `扩一个栏位（${s.penN}/${R.MANOR.pensMax}）`, nc ? `${fmt(nc.coins)} D币 + ${nc.wood} 木材` : '已经最大', `<button type="button" class="mn-btn sm" data-expand="pen" ${nc && wood >= nc.wood ? '' : 'disabled'}>扩建</button>`) +
        row(icon('dog', 36), `看门狗${s.dog ? '（已经有了）' : ''}`, `${R.MANOR.dog.lv} 级 · ${fmt(R.MANOR.dog.coins)} D币 + ${R.MANOR.dog.wood} 木材；来偷的人 ${R.MANOR.dogCatch * 100}% 被逮住，赔你 ${R.MANOR.dogFine} D币`, `<button type="button" class="mn-btn sm" data-dog ${s.dog || lv < R.MANOR.dog.lv || wood < R.MANOR.dog.wood ? 'disabled' : ''}>${s.dog ? '已养' : '养狗'}</button>`) }
    body.innerHTML = `<div class="mn-rows">${html}</div>`
    body.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => own([{ a: 'buySeed', c: b.dataset.buy, n: Number(b.dataset.n) }]))
    body.querySelectorAll('[data-animal]').forEach((b) => b.onclick = () => own([{ a: 'buyAnimal', k: b.dataset.animal }], 'cheer'))
    body.querySelectorAll('[data-tree]').forEach((b) => b.onclick = () => own([{ a: 'plantTree', k: b.dataset.tree }], 'cheer'))
    body.querySelectorAll('[data-expand]').forEach((b) => b.onclick = () => own([{ a: 'expand', what: b.dataset.expand }], 'cheer'))
    body.querySelectorAll('[data-dog]').forEach((b) => b.onclick = () => own([{ a: 'dog' }], 'cheer'))
    tab = 'shop'; shopSub = sub
  }
  let shopSub = 'seed'
  // ----- 动态 -----
  function renderLogs(tools, body) {
    const s = home.state
    const verb = { steal: '偷走了', caught: '来偷东西，被看门狗逮住，赔了', water: '帮你浇了', bug: '帮你除了虫', weed: '帮你拔了草', feed: '帮你喂了', clean: '帮你打扫了', waterTree: '帮你给树浇了水' }
    const rows = s.logs.map((l) => { const [t, id, who, kind, item, n] = l; const what = kind === 'steal' ? `${n}${item === 'energy' ? 'g 能量' : ' 个' + itemName(item)}` : kind === 'caught' ? `${n} D币` : itemName(item)
      return `<div class="mn-row still ${t > s.seen ? 'new' : ''}"><span class="mn-av ${kind === 'steal' ? 'bad' : kind === 'caught' ? 'gold' : 'good'}">${kind === 'steal' ? '偷' : kind === 'caught' ? '汪' : '帮'}</span><span class="mn-rt"><b>${esc(who)} ${verb[kind] || kind} ${esc(what)}</b><small>${ago(t)}</small></span><span class="mn-btns"><button type="button" class="mn-btn sm ghost" data-go="${id}">${kind === 'steal' ? '去报仇' : '回访'}</button></span></div>` }).join('')
    body.innerHTML = rows ? `<div class="mn-rows">${rows}</div>` : '<div class="mn-empty">还没人来过。去别人家串串门，他们也会来的</div>'
    body.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => goVisit(Number(b.dataset.go)))
    if (s.logs.some((l) => l[0] > s.seen)) { s.seen = now(); queue.push({ a: 'seen' }); schedule() }
  }
  const ago = (t) => { const d = now() - t; if (d < 60) return '刚刚'; if (d < 3600) return Math.floor(d / 60) + ' 分钟前'; if (d < 86400) return Math.floor(d / 3600) + ' 小时前'; return Math.floor(d / 86400) + ' 天前' }

  // ----- 弹出的小选择框（播种、动物更多操作） -----
  function sheet(title, html, bind) {
    const wrap = document.createElement('div'); wrap.className = 'mn-sheet'; wrap.innerHTML = `<section role="dialog" aria-modal="true"><header><b>${title}</b><button type="button" class="mn-x" aria-label="关闭">×</button></header><div class="mn-sheet-body">${html}</div></section>`
    const close = () => wrap.remove(); wrap.querySelector('.mn-x').onclick = close; wrap.onclick = (e) => { if (e.target === wrap) close() }
    box.append(wrap); bind?.(wrap, close)
  }
  function plantSheet(i) {
    const s = home.state, lv = R.levelOf(s.xp), empties = s.plots.map((p, k) => (p ? -1 : k)).filter((k) => k >= 0)
    const targets = i < 0 ? empties : [i]
    sheet(i < 0 ? `一键种满 ${empties.length} 块空地` : '种点什么？', `<div class="mn-rows">${R.M_CROPS.map((c) => { const own = s.inv['seed:' + c.id] || 0, lock = c.lv > lv; return `<div class="mn-row still ${lock ? 'lock' : ''}">${icon(c.id, 36)}<span class="mn-rt"><b>${c.name}${own ? ` <small>有 ${own} 包种子</small>` : ''}</b><small>${dur(c.grow * 60)} · 每块约赚 ${fmt(c.n * c.price - c.seed)}${own ? '' : ' · 种子 ' + fmt(c.seed)}</small></span><span class="mn-btns"><button type="button" class="mn-btn sm" data-c="${c.id}" ${lock ? 'disabled' : ''}>${lock ? c.lv + ' 级' : '种'}</button></span></div>` }).join('')}</div>`, (w, close) => {
      w.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { close(); own(targets.map((k) => ({ a: 'plant', i: k, c: b.dataset.c })), 'crouch') })
    })
  }
  function penSheet(i) {
    const pen = home.state.pens[i], d = R.penView(pen, now()).d
    sheet(d.name, `<p class="mn-hint">没什么要做的。也可以把它卖掉，拿回 ${fmt(d.price * 0.4)} D币。</p><div class="mn-btns"><button type="button" class="mn-btn red" data-sell>卖掉${d.name}</button></div>`, (w, close) => {
      w.querySelector('[data-sell]').onclick = () => { if (!confirm(`确定卖掉这只${d.name}？`)) return; close(); own([{ a: 'sellAnimal', i }]) }
    })
  }

  // ----- 动作 -----
  function own(actions, anim) {
    if (!actions.length) return
    if (anim) fish.play(anim)
    const lv0 = R.levelOf(home.state.xp)
    const r = R.applyOwn(home.state, actions, { t: now(), uid: home.me, rand: Math.random, coins: home.coins })
    home.coins += r.earn - r.spend
    report(r.out)
    if (R.levelOf(home.state.xp) > lv0) { say(`升到 ${R.levelOf(home.state.xp)} 级啦！有新东西解锁`); fish.play('cheer') }
    if (r.out.some((o) => o.ok)) { queue.push(...actions); schedule() }
    tab === 'shop' ? renderShopAt(shopSub) : render()
  }
  function report(out) {
    const got = {}, bad = out.find((o) => !o.ok); let earn = 0, spend = 0, fixed = 0
    for (const o of out) { if (!o.ok) continue; for (const [id, n] of o.got || []) got[id] = (got[id] || 0) + n; earn += o.earn || 0; spend += o.spend || 0; if (o.a === 'fix' || o.a === 'clean' || o.a === 'feed') fixed++ }
    const parts = Object.entries(got).map(([id, n]) => `${itemName(id)} +${n}${id === 'energy' ? 'g' : ''}`)
    if (earn) parts.push(`D币 +${fmt(earn)}`); if (spend) parts.push(`D币 -${fmt(spend)}`); if (fixed) parts.push(`搞定 ${fixed} 件事`)
    if (parts.length) say('大肥鱼：' + parts.join('，')); else if (bad) say('大肥鱼：' + bad.msg)
  }
  function schedule() { clearTimeout(flushT); flushT = setTimeout(flush, Math.max(300, 1100 - (Date.now() - lastSend))) }
  async function flush(beacon) {
    if (!queue.length) return
    if (beacon) { navigator.sendBeacon?.('/api/manor/act', new Blob([JSON.stringify({ rev: home.rev, operation: uuid(), actions: queue.splice(0) })], { type: 'application/json' })); return }
    if (sending) return
    sending = true; const batch = queue.splice(0, R.MANOR.maxActions); lastSend = Date.now()
    try {
      const j = await manorApi('/api/manor/act', { rev: home.rev, operation: uuid(), actions: batch })
      if (j.state) { home.state = j.state; home.rev = j.rev; home.coins = j.coins }
      if (j.status === 409) toast(j.error); else { const bad = (j.out || []).find((o) => !o.ok && o.a !== 'seen'); if (bad) toast(bad.msg) }
    } catch (e) { toast(e.message) }
    sending = false
    if (alive && !visit && !document.querySelector('.mn-sheet')) tab === 'shop' ? renderShopAt(shopSub) : render()
    if (queue.length) schedule()
  }
  async function vis(actions) {
    if (!actions.length || busy) return
    busy = true; fish.play(actions.some((a) => a.a.startsWith('steal')) ? 'crouch' : 'cheer')
    const wait = Math.max(0, 1100 - (Date.now() - lastSend)); if (wait) await new Promise((r) => setTimeout(r, wait))
    lastSend = Date.now()
    try {
      const j = await manorApi('/api/manor/visit/' + visit.id, { rev: visit.rev, myRev: home.rev, operation: uuid(), actions: actions.slice(0, R.MANOR.visitActions) })
      if (j.state && visit) { visit.state = j.state; visit.rev = j.rev }
      if (j.me) { home.state = j.me; home.rev = j.myRev; home.coins = j.coins }
      const caught = (j.out || []).find((o) => o.caught)
      if (caught) { fish.play('slam'); say('汪汪！' + caught.msg) } else if (j.status === 409) say(j.error); else report(j.out || [])
      if (actions.length > R.MANOR.visitActions) say('一次最多 ' + R.MANOR.visitActions + ' 件，剩下的再点一次')
    } catch (e) { say(e.message) }
    busy = false; render()
  }
  async function goVisit(id) {
    if (!id || id === home.me) return
    try {
      const j = await manorApi('/api/manor/visit/' + id)
      visit = { id: j.id, name: j.name, rev: j.rev, state: j.state }
      tab = 'farm'; setTab('farm'); say(j.state.dog ? '大肥鱼：这家养了狗，小心点…' : '大肥鱼：嘿嘿，悄悄地…')
    } catch (e) { say(e.message) }
  }
  function goHome() { visit = null; setTab('farm'); say('大肥鱼：到家啦'); manorApi('/api/manor').then((j) => { home.state = j.state; home.rev = j.rev; home.coins = j.coins; if (!visit) render() }).catch(() => {}) }

  // 倒计时本地走；到点（有东西熟了）就重画一次，不请求接口
  tickT = setInterval(() => {
    if (!alive || document.hidden) return
    const t = now(); let due = false
    box.querySelectorAll('[data-left]').forEach((el) => { const left = Number(el.dataset.left) - t; if (left <= 0) due = true; else el.textContent = dur(left) })
    if (due && !document.querySelector('.mn-sheet')) tab === 'shop' ? null : render()
  }, 1000)

  render()
  const c0 = chores(home.state, home.me, now()), unseen = home.state.logs.filter((l) => l[0] > home.state.seen).length
  say(home.state.xp === 0 && !home.state.plots.some(Boolean) ? '大肥鱼：先在「菜地」种点小白菜吧（送了 6 包种子）' : `大肥鱼：${[c0.harvest.length && `${c0.harvest.length} 块地熟了`, c0.fix.length && `${c0.fix.length} 件农活`, c0.ballG && `${c0.ballG}g 能量能收`, unseen && `${unseen} 条新动态`].filter(Boolean).join('，') || '庄园一切正常'}`)
  if (vid && vid !== home.me) goVisit(vid)
}
