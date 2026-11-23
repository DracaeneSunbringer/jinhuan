import { CARE, petLevels, DAILY_XP_CAP, initPetStore, petStore, petState, subscribePet, carePet, petInteract, companionTick, flushPet, floatPrefs, setFloatPrefs, petSrc, currentPet, setActivePet, petCatalog, unlocked, hasPerk, petName, xpToNext } from '/pet-store.js?v=472f7fbf'
import { createPlayerFor } from '/pet-player.js?v=472f7fbf'

// 全站悬浮站宠：把 dsh-pet 桌宠搬进网页。只悬浮宠物本身（透明视频），透明区域不挡页面，只有身体能点。
// 左键 = 互动（摸摸），右键 / 手机长按 = 菜单。可以放在屏幕任何地方；没手动放过时每次随机出现。
// 画布与命中框常量来自上游 src/shared/constants.ts（素材 640×360，身体在中间一块）。
const DRAG_THRESHOLD = 5
const LONG_PRESS_MS = 450
// 上游 animationWeights：idle 10 / turn 5 / move 5，其余 80 按分类权重分。
const ROLL = { idle: 10, turn: 5, move: 5 }
const CATEGORIES = [
  { group: 'small', weight: 20 }, { group: 'play', weight: 20 }, { group: 'food', weight: 16 },
  { group: 'season', weight: 14 }, { group: 'text', weight: 10, noMirror: true },
  { group: 'work', weight: 6 }, { group: 'balance', weight: 4 },
]
// 两种放置方式（菜单里切换）：
// · 自由放置（默认）：甩出去在空中滑行，没有重力，按空气阻力减速、碰边反弹，停在哪就待在哪；
// · 贴底：有重力，松手会掉回屏幕底部（手机是底栏上面），落地弹几下停住。
const FLING = { drag: 2.2, bounce: 0.6, maxSpeed: 2400, deadZone: 450, stopSpeed: 25 }
const FALL = { gravity: 1400, floorBounce: 0.55, restSpeed: 120, groundFriction: 2.5 }
const grounded = () => floatPrefs().placement === 'ground'
const SIZES = { small: [160, 220], normal: [200, 300], large: [240, 380] }
const TEXTS = {
  sleepRefuse: ['我在睡觉，别烦我……', '唔……让我再睡一会儿。', '呼……呼……（装作没听见）'],
  sleepStart: ['好困……我先睡一会儿。', '那我去睡啦，晚安。'],
  sleepEnd: ['唔……我醒了。', '睡饱啦！'],
  greet: ['我来陪你摸鱼啦', '嗨～摸摸我，右键有菜单哦', '今天也要开心'],
  annoyed: ['别戳啦！', '再戳要生气了！', '哼！'],
}
// 节日当天（北京时间）优先表演的时节动作，农历节日按 2026–2027 年的公历日期写死。
const FESTIVALS = {
  '01-01': ['放烟花'], '10-31': ['讨糖南瓜灯', '萌化小幽灵'], '12-24': ['装点圣诞树'], '12-25': ['装点圣诞树', '拆礼物'],
  '2026-12-22': ['吃饺子', '堆雪人'], '2027-01-15': ['吃腊八粥'], '2027-02-05': ['吃饺子', '放烟花'],
  '2027-02-06': ['写福字', '舞狮头', '收红包', '吃年糕', '放烟花'], '2027-02-07': ['收红包', '舞狮头'],
  '2027-02-20': ['吃汤圆', '放孔明灯'], '2027-04-05': ['吃青团'], '2027-06-09': ['吃粽子'], '2027-08-08': ['穿针乞巧'],
  '2027-08-16': ['放河灯'], '2027-09-15': ['中秋赏月吃月饼'], '2027-10-08': ['插茱萸赏菊', '吃重阳糕'],
}
const SEASONAL = { 10: ['被落叶淹没'], 11: ['被落叶淹没'], 12: ['堆雪人'], 1: ['堆雪人'], 2: ['堆雪人'], 7: ['吃西瓜', '摇扇纳凉'], 8: ['吃西瓜', '摇扇纳凉'] }
const POS_KEY = 'jinhuan.pet-float-pos'
const pick = (list, exclude) => { const pool = exclude ? list.filter((x) => x !== exclude) : list; const src = pool.length ? pool : list; return src[Math.floor(Math.random() * src.length)] }
const between = (min, max) => min + Math.random() * (max - min)
// 站宠和气泡动画一样，不受浏览器 / 系统「减弱动画」影响：它是可选的，不想看可以收起或关闭。
const saveData = () => !!navigator.connection?.saveData
const bjDate = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)

function whisperLine(state) {
  const hour = new Date().getHours()
  const lines = []
  if (state.hunger < 30) lines.push('肚子咕咕叫了……', '想吃好吃的')
  if (state.energy < 20) lines.push('好困啊……', '眼皮在打架')
  if (state.cleanliness < 30) lines.push('想洗香香', '身上有点脏了')
  if (hour >= 6 && hour < 10) lines.push('早呀，今天也摸鱼吗？')
  else if (hour >= 11 && hour < 14) lines.push('午饭吃什么好呢')
  else if (hour >= 14 && hour < 18) lines.push('下午好容易犯困')
  else if (hour >= 18 && hour < 23) lines.push('下班啦？辛苦啦')
  else lines.push('这么晚了还不睡吗……')
  lines.push('今天的梗图好好笑', '戳我一下嘛', '我在这儿陪你～', '要不要去群里水一水')
  return pick(lines)
}

let mounted = null

export async function mountPetFloat({ user, api, navigate, toast }) {
  if (mounted || !user) return mounted
  await initPetStore({ user, api })
  const store = petStore()
  let def = currentPet(), actions = def.actions, byName = new Map(actions.map((item) => [item.name, item]))
  const role = (key) => byName.get(def.roles[key]) || null
  const roleList = (key) => (def.roles[key] || []).map((n) => byName.get(n)).filter(Boolean)
  const open = (list) => list.filter((item) => item && unlocked(item))
  const inGroup = (group) => open(actions.filter((item) => item.group === group))
  const clicks = () => open(roleList('click')).length ? open(roleList('click')) : inGroup('click')
  const named = (names) => open(names.map((n) => byName.get(n)))
  if (!document.getElementById('pet-float-styles')) document.head.append(Object.assign(document.createElement('link'), { id: 'pet-float-styles', rel: 'stylesheet', href: '/pet-float.css?v=472f7fbf' }))

  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e }
  const root = node('div', 'pf-root')
  root.setAttribute('aria-live', 'polite')
  const stage = node('div', 'pf-stage')
  const hit = node('div', 'pf-hit')
  Object.assign(hit, { tabIndex: 0, title: '左键摸摸它，右键（手机长按）打开菜单，按住可以拖动' })
  hit.setAttribute('role', 'button')
  const bubble = node('div', 'pf-bubble')
  bubble.hidden = true
  root.append(stage, bubble, hit)
  const tab = node('button', 'pf-tab')
  tab.type = 'button'
  tab.append(node('span', '', '🐾'))
  document.body.append(root, tab)
  const labelPet = () => {
    const name = petName()
    hit.setAttribute('aria-label', name + '：回车摸摸，菜单键打开菜单')
    tab.title = '叫' + name + '出来'
    tab.setAttribute('aria-label', tab.title)
  }
  labelPet()

  let facing = def.baseFacing
  let mode = 'auto' // auto | walk | drag | fly | sleep
  let sleepPhase = null
  let awakeUntil = 0
  let dwellTimer = 0, whisperTimer = 0, bubbleTimer = 0, frame = 0
  const clearTimers = () => { clearTimeout(dwellTimer); dwellTimer = 0; cancelAnimationFrame(frame); frame = 0 }

  let player = null
  const makePlayer = () => {
    player?.destroy?.()
    stage.replaceChildren()
    root.dataset.kind = def.kind
    player = createPlayerFor(def, stage, {
      className: 'pf-video',
      srcOf: petSrc,
      onEnded: (item) => ended(item),
      // 自动播放被拦（iOS 低电量等）：用户在页面上随便点一下就继续。
      onBlocked: () => document.addEventListener('pointerdown', () => player.resume(), { once: true, capture: true }),
      onBroken: () => say('这只站宠暂时加载不出来，右键换一只试试', 6000),
    })
  }
  makePlayer()
  // 朝向：def.baseFacing 是素材原本面朝的方向，朝另一边时镜像；带字的动作不镜像。
  const play = (item, opts = {}) => item && player.play(item, { ...opts, mirror: def.mirror && facing !== def.baseFacing && item.group !== 'text' })
  const current = () => player.current()

  // ---------- 几何：pos 是宠物盒左上角；身体（命中框）必须留在视口里 ----------
  const geo = { w: 0, h: 0, floor: 0, top: 0 }
  const pos = { x: 0, y: 0 }
  const measure = () => {
    const [mobile, desktop] = SIZES[hasPerk(10) ? floatPrefs().size || 'normal' : 'normal'] || SIZES.normal
    geo.w = innerWidth <= 760 ? mobile : desktop
    geo.h = geo.w / def.aspect
    root.style.width = geo.w + 'px'
    root.style.height = geo.h + 'px'
    // 手机底栏挡着的地方不去；顶栏可以停，挡住了拖开就行。
    const nav = document.querySelector('.mobile-nav')
    const navTop = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().top : 0
    geo.floor = (navTop > 0 ? navTop : visualViewport?.height || innerHeight) - 2
    geo.top = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0
  }
  const bounds = () => ({
    minX: -geo.w * def.hit.x0 + 4, maxX: innerWidth - geo.w * def.hit.x1 - 4,
    minY: -geo.h * def.hit.y0 + 4, maxY: geo.floor - geo.h * def.hit.y1,
  })
  const place = () => {
    const b = bounds()
    pos.x = Math.min(b.maxX, Math.max(b.minX, pos.x))
    pos.y = Math.min(b.maxY, Math.max(b.minY, pos.y))
    if (grounded() && mode !== 'drag' && mode !== 'fly') pos.y = b.maxY
    root.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
    // 头顶空间不够时气泡放到脚下。
    bubble.classList.toggle('below', pos.y + geo.h * def.hit.y0 < 70)
  }
  const randomSpot = () => {
    const b = bounds()
    pos.x = between(b.minX + 20, b.maxX - 20)
    pos.y = grounded() ? b.maxY : between(Math.max(b.minY, geo.top - geo.h * def.hit.y0 + 10), b.maxY)
  }
  // 手动放过的位置记住（按比例存，换窗口大小也大致在原处）；没放过就每次随机出现。
  const savePos = () => { try { localStorage.setItem(POS_KEY, JSON.stringify({ rx: (pos.x + geo.w / 2) / innerWidth, ry: (pos.y + geo.h / 2) / innerHeight })) } catch {} }
  measure()
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null')
    if (Number.isFinite(saved?.rx) && Number.isFinite(saved?.ry)) { pos.x = saved.rx * innerWidth - geo.w / 2; pos.y = saved.ry * innerHeight - geo.h / 2 }
    else randomSpot()
  } catch { randomSpot() }
  place()

  const idle = () => role('idle') || actions.find((item) => item.group === 'idle') || actions[0]
  // 网页不像桌面那样一直盯着看：每段动作之间先待机一会儿，既不吵也省流量（视频按需下载）。
  const dwell = (min = 6, max = 15) => {
    clearTimeout(dwellTimer)
    if (current() !== idle()) play(idle(), { loop: true })
    dwellTimer = setTimeout(roll, between(min, max) * 1000 * (saveData() ? 4 : 1))
  }
  const visible = () => !root.hidden && !document.hidden

  // 没有转身动作的宠物直接翻面。
  function playTurn() {
    const turn = open(roleList('turn'))
    if (turn.length) return play(pick(turn))
    facing = facing === 'left' ? 'right' : 'left'
    play(current() || idle())
  }

  function seasonalPick() {
    if (!hasPerk(5)) return null
    const day = bjDate(), list = FESTIVALS[day] || FESTIVALS[day.slice(5)]
    if (list && Math.random() < 0.4) return pick(named(list))
    const month = Number(day.slice(5, 7))
    if (SEASONAL[month] && Math.random() < 0.08) return pick(named(SEASONAL[month]))
    return null
  }

  function roll() {
    dwellTimer = 0
    if (!visible() || mode !== 'auto') return
    const hour = new Date().getHours()
    if (hour >= 1 && hour < 6 && Date.now() > awakeUntil) return startSleep(false)
    const festive = seasonalPick()
    if (festive) return play(festive)
    const r = Math.random() * 100
    if (r < ROLL.idle) return dwell()
    if (r < ROLL.idle + ROLL.turn) return playTurn()
    if (r < ROLL.idle + ROLL.turn + ROLL.move && tryWalk()) return
    // 朝右时镜像会把「文字」类动作里的字也翻过来，上游同样跳过 noMirror 分类。
    const cats = CATEGORIES.filter((c) => !(c.noMirror && facing === 'right') && inGroup(c.group).length)
    // 动作少的干员（如只有 4 段动画）在低等级可能一个分类都没有：继续待机。
    if (!cats.length) return dwell()
    let t = Math.random() * cats.reduce((sum, c) => sum + c.weight, 0)
    const cat = cats.find((c) => (t -= c.weight) <= 0) || cats.at(-1)
    play(pick(inGroup(cat.group), current()))
  }

  // ---------- 走位 ----------
  function tryWalk() {
    const moves = def.roles.moves || {}
    const name = pick(Object.keys(moves).filter((n) => byName.has(n) && (!moves[n].dir || moves[n].dir === facing)))
    if (!name) return false
    const item = byName.get(name), cfg = { minDist: 60, maxDist: 220, lead: 0, tail: 0, ...moves[name] }
    const k = geo.w / def.refWidth
    // 有速度的走路（VPet / 明日方舟）：按速度和随机时长算距离；大肥鱼按上游的最短 / 最长距离。
    const b = bounds(), dist = cfg.speed ? cfg.speed * k * between(2.5, 5) : between(cfg.minDist, cfg.maxDist) * k
    const dir = facing === 'right' ? 1 : -1
    const tx = pos.x + dir * dist
    // 前面没路就先转身，下次再走。
    if (tx < b.minX || tx > b.maxX) { playTurn(); return true }
    const ty = cfg.float && !grounded() ? Math.min(b.maxY, Math.max(b.minY, pos.y + between(-0.6, 0.6) * dist)) : pos.y
    mode = 'walk'
    play(item)
    const from = { x: pos.x, y: pos.y }
    const step = () => {
      if (mode !== 'walk') { frame = 0; return }
      // 新动作还在后台缓冲里加载时先原地等。
      if (player.current() !== item) { frame = requestAnimationFrame(step); return }
      const { t, duration: d } = player.time()
      const duration = d > 0 ? d : cfg.speed ? dist / (cfg.speed * k) : 10.09
      const travel = Math.max(0.1, duration - cfg.lead - cfg.tail)
      const p = t <= cfg.lead ? 0 : t >= duration - cfg.tail ? 1 : (t - cfg.lead) / travel
      pos.x = from.x + (tx - from.x) * p
      pos.y = from.y + (ty - from.y) * p
      place()
      frame = p < 1 ? requestAnimationFrame(step) : 0
    }
    frame = requestAnimationFrame(step)
    return true
  }

  // ---------- 睡觉 ----------
  function startSleep(withText = true) {
    clearTimers()
    mode = 'sleep'
    sleepPhase = 'start'
    if (withText) say(pick(TEXTS.sleepStart))
    const sl = def.roles.sleep || {}
    if (byName.get(sl.start)) play(byName.get(sl.start))
    else { sleepPhase = 'loop'; play(byName.get(sl.loop) || idle(), { loop: true }) }
  }
  function wake(text = true) {
    if (mode !== 'sleep') return
    awakeUntil = Date.now() + 10 * 60 * 1000
    sleepPhase = 'end'
    if (text) say(pick(TEXTS.sleepEnd))
    const end = byName.get(def.roles.sleep?.end)
    if (end) return play(end)
    sleepPhase = null; mode = 'auto'; dwell()
  }

  function ended(item) {
    if (!item) return
    if (mode === 'sleep') {
      if (sleepPhase === 'start') { sleepPhase = 'loop'; play(byName.get(def.roles.sleep?.loop) || idle(), { loop: true }) }
      else if (sleepPhase === 'end') { sleepPhase = null; mode = 'auto'; dwell() }
      return
    }
    if (mode === 'walk') { mode = 'auto'; savePosIfPinned(); return dwell() }
    if (mode !== 'auto') return
    if (item.group === 'turn') { facing = facing === 'left' ? 'right' : 'left'; return roll() }
    dwell()
  }
  // 自己走动不算「手动放置」：只有用户拖过（已存位置）才跟着更新。
  const savePosIfPinned = () => { try { if (localStorage.getItem(POS_KEY)) savePos() } catch {} }

  // ---------- 气泡 ----------
  function say(text, ms = 3600, onclick = null) {
    bubble.textContent = text
    bubble.hidden = false
    bubble.onclick = onclick
    bubble.classList.toggle('link', !!onclick)
    bubble.classList.remove('in')
    void bubble.offsetWidth
    bubble.classList.add('in')
    clearTimeout(bubbleTimer)
    bubbleTimer = setTimeout(() => { bubble.hidden = true; bubble.onclick = null }, ms)
  }
  const scheduleWhisper = () => {
    clearTimeout(whisperTimer)
    whisperTimer = setTimeout(() => {
      if (hasPerk(3) && visible() && mode === 'auto' && !menu) {
        clearTimers()
        say(whisperLine(petState()), 5000)
        play(pick(inGroup('whisper')) || idle())
      }
      scheduleWhisper()
    }, between(4, 8) * 60 * 1000)
  }

  // ---------- 左键互动 ----------
  const pokes = []
  // 点在头上（有 head 命中框的宠物，如 VPet）播放摸头；朝向镜像时命中框也跟着翻。
  const onHead = (pt) => {
    const h = def.head
    if (!h || !pt || !geo.w) return false
    let fx = (pt.x - pos.x) / geo.w
    const fy = (pt.y - pos.y) / geo.h
    if (def.mirror && facing !== def.baseFacing) fx = 1 - fx
    return fx >= h.x0 && fx <= h.x1 && fy >= h.y0 && fy <= h.y1
  }
  function interact(pt = null) {
    if (mode === 'sleep') return say(pick(TEXTS.sleepRefuse))
    if (mode === 'fly' || mode === 'drag') return
    const t = Date.now()
    pokes.push(t)
    while (pokes.length && t - pokes[0] > 8000) pokes.shift()
    clearTimers()
    mode = 'auto'
    // 连戳会生气。
    if (pokes.length >= 6) { pokes.length = 0; say(pick(TEXTS.annoyed)); return play(role('angry') || pick(clicks())) }
    const before = petState().level
    const result = petInteract()
    if (petState().level > before) return
    say(result.say)
    const headAction = onHead(pt) && role('clickHead')
    play(headAction || pick(clicks(), current()) || idle())
  }

  // ---------- 按下：短按 = 互动，长按 = 菜单，拖动 = 搬走 / 甩出去 ----------
  let press = null
  hit.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    hit.setPointerCapture(e.pointerId)
    if (mode === 'fly' || mode === 'walk') { mode = 'auto'; cancelAnimationFrame(frame); frame = 0 }
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: e.clientX - pos.x, dy: e.clientY - pos.y, dragging: false, long: false, samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }] }
    // 手机没有右键：长按不动打开菜单。
    press.timer = setTimeout(() => { if (press && !press.dragging) { press.long = true; navigator.vibrate?.(8); toggleMenu(true) } }, LONG_PRESS_MS)
  })
  hit.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id || press.long) return
    if (!press.dragging) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD) return
      clearTimeout(press.timer)
      press.dragging = true
      closeMenu()
      if (mode === 'sleep') { sleepPhase = null; awakeUntil = Date.now() + 10 * 60 * 1000 }
      clearTimers()
      mode = 'drag'
      root.classList.add('dragging')
      play(role('drag') || pick(inGroup('drag')) || idle(), { loop: true })
    }
    pos.x = e.clientX - press.dx
    pos.y = e.clientY - press.dy
    place()
    const now = performance.now()
    press.samples.push({ t: now, x: e.clientX, y: e.clientY })
    while (press.samples.length > 2 && now - press.samples[0].t > 100) press.samples.shift()
  })
  const release = (e) => {
    if (!press || e.pointerId !== press.id) return
    const p = press
    press = null
    clearTimeout(p.timer)
    root.classList.remove('dragging')
    if (p.long) return
    if (!p.dragging) return e.type === 'pointerup' ? interact({ x: e.clientX, y: e.clientY }) : undefined
    const last = p.samples.at(-1), first = p.samples[0], dt = Math.max(16, last.t - first.t) / 1000
    let vx = (last.x - first.x) / dt, vy = (last.y - first.y) / dt
    const speed = Math.hypot(vx, vy)
    // 慢慢松手 = 放在这里；甩得快才飞出去（上游死区 500px/s）。
    if (performance.now() - last.t > 150 || speed < FLING.deadZone) return grounded() ? fly(0, 0) : settle()
    if (speed > FLING.maxSpeed) { vx *= FLING.maxSpeed / speed; vy *= FLING.maxSpeed / speed }
    fly(vx, vy)
  }
  hit.addEventListener('pointerup', release)
  hit.addEventListener('pointercancel', release)
  hit.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!press?.long) toggleMenu(true) })
  hit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); interact() }
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); toggleMenu(true) }
  })

  function settle() {
    mode = 'auto'
    savePos()
    play(role('drop') || role('shy') || idle())
  }

  function fly(vx, vy) {
    mode = 'fly'
    let last = performance.now()
    const step = (now) => {
      if (mode !== 'fly') { frame = 0; return }
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const fall = grounded()
      if (fall) vy += FALL.gravity * dt
      else { const k = Math.exp(-FLING.drag * dt); vx *= k; vy *= k }
      pos.x += vx * dt
      pos.y += vy * dt
      const b = bounds()
      if (pos.x < b.minX) { pos.x = b.minX; vx = Math.abs(vx) * FLING.bounce }
      if (pos.x > b.maxX) { pos.x = b.maxX; vx = -Math.abs(vx) * FLING.bounce }
      if (pos.y < b.minY) { pos.y = b.minY; vy = Math.abs(vy) * FLING.bounce }
      let onFloor = false
      if (pos.y >= b.maxY) {
        pos.y = b.maxY
        if (fall) {
          vy = Math.abs(vy) < FALL.restSpeed ? 0 : -Math.abs(vy) * FALL.floorBounce
          onFloor = vy === 0
          vx *= onFloor ? Math.max(0, 1 - FALL.groundFriction * dt) : 0.9
        } else vy = -Math.abs(vy) * FLING.bounce
      }
      place()
      if (fall ? onFloor && Math.abs(vx) < FLING.stopSpeed : Math.hypot(vx, vy) < FLING.stopSpeed) {
        frame = 0
        if (Math.abs(vx) > 1) facing = vx > 0 ? 'right' : 'left'
        mode = 'auto'
        savePos()
        play(role('drop') || role('scared') || idle())
        return
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  }

  // ---------- 右键菜单 ----------
  let menu = null
  let offMenuStore = null
  function closeMenu() {
    if (!menu) return
    menu.remove()
    menu = null
    offMenuStore?.()
    offMenuStore = null
    document.removeEventListener('pointerdown', outside, true)
    document.removeEventListener('keydown', onEsc)
  }
  const outside = (e) => { if (menu && !menu.contains(e.target) && !hit.contains(e.target)) closeMenu() }
  const onEsc = (e) => { if (e.key === 'Escape') { closeMenu(); hit.focus() } }
  function toggleMenu(force) {
    if (menu && !force) return closeMenu()
    closeMenu()
    menu = node('div', 'pf-menu')
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', petName() + '菜单')
    menu.addEventListener('contextmenu', (e) => e.preventDefault())
    const nameEl = node('span', 'pf-name'), levelEl = node('strong', 'pf-level')
    const head = node('div', 'pf-menu-head')
    head.append(nameEl, levelEl)
    const xpFill = node('i', 'pf-meter-fill'), xpText = node('small', 'pf-xp-text'), xpTrack = node('span', 'pf-meter-track')
    xpTrack.append(xpFill)
    const xpRow = node('div', 'pf-xp')
    xpRow.append(xpTrack, xpText)
    const meters = node('div', 'pf-meters')
    const bars = [['hunger', '饱食'], ['energy', '精力'], ['cleanliness', '清洁'], ['affection', '亲密']].map(([key, label]) => {
      const fill = node('i', 'pf-meter-fill'), value = node('b', '')
      const track = node('span', 'pf-meter-track')
      track.append(fill)
      const row = node('div', 'pf-meter')
      row.append(node('span', '', label), track, value)
      meters.append(row)
      return { key, fill, value }
    })
    const render = () => {
      const s = petState(), need = xpToNext(s), next = petLevels().find((l) => l.level > s.level)
      nameEl.textContent = petName(s)
      levelEl.textContent = 'LV ' + s.level
      xpFill.style.width = (need ? Math.min(100, s.xp / need * 100) : 100) + '%'
      const capped = s.daily?.day === bjDate() && s.daily.xp >= DAILY_XP_CAP
      xpText.textContent = capped ? '今天的经验满了，明天再来' : next ? `Lv${next.level} ` + (next.perks[0].startsWith('解锁') ? next.perks[0] : '解锁：' + next.perks[0]) : `经验 ${s.xp} / ${need}`
      for (const b of bars) { b.fill.style.width = s[b.key] + '%'; b.value.textContent = s[b.key] }
    }
    const item = (icon, label, fn, cls = '') => {
      const b = node('button', 'pf-menu-item ' + cls)
      b.type = 'button'
      b.setAttribute('role', 'menuitem')
      b.append(node('span', 'pf-menu-icon', icon), node('span', '', label))
      b.addEventListener('click', fn)
      return b
    }
    const care = node('div', 'pf-menu-care')
    for (const [kind, c] of Object.entries(CARE)) care.append(item(c.icon, c.label, () => doCare(kind)))
    const size = floatPrefs().size || 'normal'
    const more = node('div', 'pf-menu-more')
    more.append(...[
      item('🎲', '来个动作', () => { closeMenu(); if (mode === 'sleep') wake(false); clearTimers(); mode = 'auto'; roll() }),
      mode === 'sleep' ? item('☀', '叫醒', () => { closeMenu(); wake() }) : item('💤', '去睡觉', () => { closeMenu(); startSleep() }),
      hasPerk(10) && item('⇲', '大小：' + { small: '小', normal: '中', large: '大' }[size], () => {
        setFloatPrefs({ size: { small: 'normal', normal: 'large', large: 'small' }[size] }); closeMenu(); measure(); place()
      }),
      item('📌', grounded() ? '放置：贴底（点击改为自由）' : '放置：自由（点击改为贴底）', () => {
        closeMenu()
        const toGround = !grounded()
        setFloatPrefs({ placement: toGround ? 'ground' : 'free' })
        say(toGround ? '我下去站着啦' : '现在想放哪都行～')
        if (toGround) { clearTimers(); fly(0, 0) }
      }),
      item('🔁', '换一只', () => { closeMenu(); petPicker() }),
      item('⚔', '大肥鱼擂台', () => {
        closeMenu()
        // 已经在站宠屋就直接打开；在别的页面先进站宠屋（#battle 会自动打开擂台）。
        if (location.pathname === '/pets') import('/pet-battle.js?v=472f7fbf').then(({ openBattle }) => openBattle({ api, toast, user })).catch((e) => toast?.(e.message || '擂台加载失败', 'err'))
        else navigate('/pets#battle')
      }),
      item('🏠', '站宠屋', () => { closeMenu(); navigate('/pets') }),
      item('⤓', '收起', () => { closeMenu(); setFloatPrefs({ collapsed: true }) }),
      item('✕', '关闭悬浮', () => { closeMenu(); setFloatPrefs({ hidden: true }); toast?.('已关闭站宠悬浮，可在站宠屋重新打开') }, 'pf-menu-danger'),
    ].filter(Boolean))
    const credit = node('p', 'pf-menu-credit', def.credit?.text || '')
    const link = def.credit?.links?.[0]
    if (link) { const el = node('a', '', ' 出处'); el.href = link; el.target = '_blank'; el.rel = 'noopener'; credit.append(el) }
    menu.append(head, xpRow, meters, care, more, ...(def.credit ? [credit] : []))
    document.body.append(menu)
    render()
    offMenuStore = subscribePet(render)
    // 菜单放在宠物头顶，放不下就放下面，始终留在视口里。
    const box = hit.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight
    let left = box.left + box.width / 2 - mw / 2
    let top = box.top - mh - 10
    if (top < 8) top = box.bottom + 10
    if (top + mh > innerHeight - 8) top = Math.max(8, innerHeight - mh - 8)
    left = Math.max(8, Math.min(innerWidth - mw - 8, left))
    menu.style.left = left + 'px'
    menu.style.top = top + 'px'
    setTimeout(() => document.addEventListener('pointerdown', outside, true))
    document.addEventListener('keydown', onEsc)
    menu.querySelector('button')?.focus({ preventScroll: true })
  }

  function doCare(kind) {
    const before = petState().level
    const result = carePet(kind)
    // 这一下升级了：升级庆祝（petlevelup 里已经播了）优先，不再被普通台词盖掉。
    if (petState().level > before) return closeMenu()
    say(result.say)
    if (result.refused) return play(result.action)
    if (kind === 'rest') { closeMenu(); return startSleep(false) }
    clearTimers()
    if (mode === 'sleep') sleepPhase = null
    mode = 'auto'
    play(result.action)
  }

  // ---------- 换宠物 ----------
  // 加载中再点别的也照常切换，pet-store 只采用最后一次选择。
  async function switchTo(id) {
    if (id === def.id) return
    try { await setActivePet(id) } catch (error) { toast?.(error.message || '换宠物失败', 'err') }
  }
  // 换宠物统一走这里：站宠屋页面换、这里换，两边都会收到 petchange。
  function adoptPet(next) {
    def = next
    actions = def.actions
    byName = new Map(actions.map((item) => [item.name, item]))
    facing = def.baseFacing
    clearTimers()
    if (mode !== 'sleep') mode = 'auto'
    sleepPhase = mode === 'sleep' ? 'loop' : null
    makePlayer()
    labelPet()
    measure()
    place()
    if (mode === 'sleep') play(byName.get(def.roles.sleep?.loop) || idle(), { loop: true })
    else { play(role('wave') || pick(clicks()) || idle()); say('我是' + def.name + '，请多关照！') }
  }
  addEventListener('petchange', ({ detail }) => { if (detail.id !== def.id) adoptPet(detail) })

  async function petPicker() {
    closePicker()
    const panel = node('div', 'pf-picker')
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', '选择站宠')
    const close = node('button', 'pf-picker-close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', '关闭')
    close.addEventListener('click', closePicker)
    const head = node('div', 'pf-picker-head')
    head.append(node('strong', '', '换一只站宠'), close)
    const search = node('input', 'pf-picker-search')
    Object.assign(search, { type: 'search', placeholder: '搜索名字' })
    const list = node('div', 'pf-picker-list')
    const credit = node('p', 'pf-picker-credit')
    panel.append(head, search, list, credit)
    document.body.append(panel)
    picker = panel
    list.append(node('p', 'pf-picker-empty', '正在读取…'))
    const cat = await petCatalog()
    if (picker !== panel) return
    const entries = [
      ...cat.pets.map((p) => ({ id: p.id, name: p.name, sub: p.blurb || '', credit: p.credit })),
      ...cat.series.flatMap((s) => s.pets.map((p) => ({ id: p.id, name: p.name, sub: s.name + (p.rarity ? ' · ' + '★'.repeat(p.rarity) : ''), credit: s.credit }))),
    ]
    // 不一次画 400 多个按钮：先显示一页，「显示更多」继续往下翻；搜索时从第一页重新开始。
    const PAGE = 120
    let limit = PAGE
    const draw = () => {
      const q = search.value.trim()
      const matched = entries.filter((e) => !q || e.name.includes(q) || e.sub.includes(q))
      const shown = matched.slice(0, limit)
      const more = matched.length - shown.length
      list.replaceChildren(...(shown.length ? shown.map((e) => {
        const b = node('button', 'pf-picker-item' + (e.id === def.id ? ' on' : ''))
        b.type = 'button'
        b.append(node('strong', '', e.name), node('small', '', e.sub))
        b.addEventListener('click', () => { closePicker(); void switchTo(e.id) })
        b.addEventListener('mouseenter', () => { credit.textContent = e.credit?.text || '' })
        return b
      }) : [node('p', 'pf-picker-empty', '没有找到')]))
      if (more > 0) {
        const b = node('button', 'pf-picker-more', `显示更多（还有 ${more} 只）`)
        b.type = 'button'
        b.addEventListener('click', () => { limit += PAGE; draw() })
        list.append(b)
      }
    }
    search.addEventListener('input', () => { limit = PAGE; draw() })
    credit.textContent = def.credit?.text || ''
    draw()
    const box = hit.getBoundingClientRect()
    panel.style.left = Math.max(8, Math.min(innerWidth - panel.offsetWidth - 8, box.left + box.width / 2 - panel.offsetWidth / 2)) + 'px'
    panel.style.top = Math.max(8, Math.min(innerHeight - panel.offsetHeight - 8, box.top - panel.offsetHeight - 10)) + 'px'
    setTimeout(() => document.addEventListener('pointerdown', pickerOutside, true))
    search.focus({ preventScroll: true })
  }
  let picker = null
  const pickerOutside = (e) => { if (picker && !picker.contains(e.target)) closePicker() }
  function closePicker() {
    picker?.remove()
    picker = null
    document.removeEventListener('pointerdown', pickerOutside, true)
  }

  // ---------- 等级效果 ----------
  addEventListener('petlevelup', ({ detail }) => {
    labelPet()
    if (root.hidden) return
    clearTimers()
    mode = 'auto'
    play(role('celebrate') || pick(clicks()) || idle())
    const perk = detail.perk
    say(perk ? `升到 Lv${detail.level}「${perk.title}」！${perk.perks[0]}` : `升到 Lv${detail.level} 啦！`, 6000)
    toast?.(`${petName()} 升到 Lv${detail.level}` + (perk ? `：${perk.perks.join('，')}` : ''), 'ok')
  })
  // Lv4：群聊 / 私信有新消息时提醒（读顶栏未读角标，不额外请求接口）。
  let lastUnread = null
  const unreadNow = () => { const el = document.querySelector('[data-chat-badge]'); return el && !el.hidden ? parseInt(el.textContent, 10) || 0 : 0 }
  setInterval(() => {
    const n = unreadNow()
    const grew = lastUnread !== null && n > lastUnread
    lastUnread = n
    if (!grew || !hasPerk(4) || !visible() || mode === 'sleep' || mode === 'drag' || location.pathname.startsWith('/chat') || location.pathname.startsWith('/dm')) return
    clearTimers()
    mode = 'auto'
    play(role('wave') || idle())
    say(`有 ${n > 99 ? '99+' : n} 条新消息，点我去看看`, 8000, () => { bubble.hidden = true; navigate('/chat') })
  }, 15_000)
  // 陪伴经验：宠物在屏幕上、页面在前台时每 2 分钟 +1。
  setInterval(() => { if (visible()) companionTick() }, 120_000)

  // ---------- 显示条件 ----------
  // 伪装（飞书 / LINUX DO）、老板键、站宠屋页面（页面里已有大宠物）时不出现。
  const blocked = () => !!document.documentElement.dataset.skin || document.documentElement.classList.contains('bossing') || location.pathname === '/pets'
  function sync() {
    const prefs = floatPrefs()
    const show = !prefs.hidden && !prefs.collapsed && !blocked()
    tab.hidden = prefs.hidden || !prefs.collapsed || blocked()
    if (show === !root.hidden) return
    root.hidden = !show
    if (!show) {
      closeMenu()
      clearTimers()
      clearTimeout(whisperTimer)
      if (mode !== 'sleep') mode = 'auto'
      player.pause()
      return
    }
    measure()
    place()
    scheduleWhisper()
    if (mode === 'sleep') play(byName.get(def.roles.sleep?.loop) || idle(), { loop: true })
    else dwell(2, 5)
  }
  tab.addEventListener('click', () => setFloatPrefs({ collapsed: false }))
  addEventListener('petfloatprefs', sync)
  addEventListener('jh:route', () => setTimeout(sync))
  addEventListener('popstate', () => setTimeout(sync))
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin', 'class'] })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimers(); player.pause(); void flushPet() }
    else if (!root.hidden) { if (mode === 'sleep') void player.resume(); else if (mode !== 'drag') { mode = 'auto'; dwell(2, 5) } }
  })
  const keepInView = () => { if (mode === 'drag' || mode === 'fly') return; measure(); place() }
  addEventListener('resize', keepInView)
  // 页面切换时手机底栏会出现 / 消失，不一定触发 resize：可见时定期校准一次。
  setInterval(() => { if (visible()) keepInView() }, 2000)

  root.hidden = true
  sync()
  if (!root.hidden && !sessionStorage.getItem('jinhuan.pet-greeted')) {
    try { sessionStorage.setItem('jinhuan.pet-greeted', '1') } catch {}
    setTimeout(() => { if (!root.hidden && mode === 'auto') say(pick(TEXTS.greet)) }, 1200)
  }
  mounted = { sync, say }
  return mounted
}
