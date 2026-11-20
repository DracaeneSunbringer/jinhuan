// 站宠双缓冲播放器：两个 <video> 轮换。新动作先在后台那个里加载，第一帧真正画出来后再和前台互换，
// 切动作不会出现清空 src 带来的空白闪烁。后台那个保留上一段的 src，切回常用动作（如待机）时直接复用。
export function createVideoPlayer(host, { className, srcOf, onEnded, onBlocked, onBroken }) {
  const make = () => {
    const v = document.createElement('video')
    v.className = className
    Object.assign(v, { muted: true, defaultMuted: true, playsInline: true, preload: 'auto', disablePictureInPicture: true })
    v.setAttribute('muted', '')
    v.setAttribute('playsinline', '')
    v.setAttribute('aria-hidden', 'true')
    v.addEventListener('ended', () => { if (v === active) onEnded?.(v._item) })
    v.addEventListener('error', () => {
      if (!v.error || !v._item || !v.getAttribute('src')) return
      // Safari 的 .mov 缺失或解码失败时退回 webm，webm 也坏了才算真的放不了。
      if (v.getAttribute('src').endsWith('.mov')) { v.src = v._item.src; if (v === pendingEl) start(v, pendingToken); else void v.play().catch(() => {}) }
      else if (v === active || v === pendingEl) onBroken?.(v._item)
    })
    return v
  }
  const a = make(), b = make()
  b.classList.add('pp-back')
  host.append(a, b)
  let active = a, standby = b, token = 0, pendingEl = null, pendingToken = 0, fallbackTimer = 0, blocked = false

  const swap = (v) => {
    clearTimeout(fallbackTimer)
    pendingEl = null
    if (v === active) return
    const old = active
    v.classList.remove('pp-back')
    old.classList.add('pp-back')
    active = v
    standby = old
    old.pause()
  }
  // 等到新视频真的有一帧画面再换上前台。
  const whenPainted = (v, own, fn) => {
    const done = () => { if (own === token) fn() }
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(done)
    else if (v.readyState >= 2) requestAnimationFrame(done)
    else v.addEventListener('loadeddata', () => requestAnimationFrame(done), { once: true })
  }
  const start = (v, own) => {
    v.play().then(() => whenPainted(v, own, () => swap(v))).catch((error) => {
      if (own !== token || error?.name !== 'NotAllowedError') return
      // 自动播放被拦截（iOS 低电量等）：先换上第一帧静止画面，再交给调用方处理。
      blocked = true
      whenPainted(v, own, () => swap(v))
      onBlocked?.()
    })
  }

  return {
    play(item, { loop = false, mirror = false } = {}) {
      const own = ++token
      const src = srcOf(item)
      const transform = mirror ? 'scaleX(-1)' : ''
      // 同一段动作直接从头再来，不换元素；后台那个刚好是这段（比如待机）就直接复用，不用重新下载。
      const same = (el) => el._item?.id === item.id && !!el.getAttribute('src')
      if (same(active)) {
        pendingEl = null
        active.loop = loop
        active.style.transform = transform
        active.currentTime = 0
        start(active, own)
        return own
      }
      const v = standby
      v.loop = loop
      v.style.transform = transform
      if (same(v)) v.currentTime = 0
      else { v._item = item; v.src = src }
      pendingEl = v
      pendingToken = own
      start(v, own)
      // 网络很慢时最多等 2.5 秒，换上去至少能看到加载中的画面，不会一直停在上个动作。
      clearTimeout(fallbackTimer)
      fallbackTimer = setTimeout(() => { if (own === token && v.readyState >= 2) swap(v) }, 2500)
      return own
    },
    active: () => active,
    time: () => ({ t: active.currentTime || 0, duration: Number.isFinite(active.duration) && active.duration > 0 ? active.duration : 0 }),
    current: () => active._item,
    blocked: () => blocked,
    resume() { blocked = false; return active.play().catch(() => {}) },
    pause() { active.pause(); standby.pause() },
    destroy() { token++; clearTimeout(fallbackTimer); for (const v of [a, b]) { v.pause(); v.removeAttribute('src'); v.load(); v.remove() } },
  }
}

// ---------- 帧序列（VPet）：WebP 精灵图，每帧时长不同，画在 canvas 上 ----------
// 新动作的精灵图下载好之前一直画上一段的画面，所以切换不会空白。
const sheetCache = new Map()
function loadSheet(url) {
  if (!sheetCache.has(url)) {
    const p = new Promise((resolve, reject) => {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(img))
      img.onerror = () => reject(Error('动作图片加载失败'))
      img.src = url
    })
    sheetCache.set(url, p)
    p.catch(() => sheetCache.delete(url))
    if (sheetCache.size > 24) sheetCache.delete(sheetCache.keys().next().value)
  }
  return sheetCache.get(url)
}

function fitCanvas(canvas, host) {
  const dpr = Math.min(2, devicePixelRatio || 1)
  const w = Math.max(1, Math.round(host.clientWidth * dpr)), h = Math.max(1, Math.round(host.clientHeight * dpr))
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true }
  return false
}

export function createFramePlayer(host, { className, def, onEnded }) {
  const canvas = document.createElement('canvas')
  canvas.className = className
  canvas.setAttribute('aria-hidden', 'true')
  host.append(canvas)
  const ctx = canvas.getContext('2d')
  const { w: cw, h: ch } = def.frame
  let cur = null, img = null, idx = 0, acc = 0, elapsed = 0, total = 0, loop = false, mirror = false
  let playing = false, raf = 0, last = 0, token = 0, paused = false
  const draw = () => {
    fitCanvas(canvas, host)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!img || !cur) return
    const col = idx % cur.cols, row = Math.floor(idx / cur.cols)
    ctx.save()
    if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, col * cw, row * ch, cw, ch, 0, 0, canvas.width, canvas.height)
    ctx.restore()
  }
  const tick = (now) => {
    raf = 0
    if (paused || !cur) return
    const dt = Math.min(250, now - last)
    last = now
    if (playing) {
      acc += dt
      elapsed += dt
      let changed = false
      while (acc >= cur.frames[idx]) {
        acc -= cur.frames[idx]
        if (idx + 1 < cur.frames.length) { idx++; changed = true; continue }
        if (loop) { idx = 0; elapsed = acc; changed = true; continue }
        playing = false
        draw()
        onEnded?.(cur)
        break
      }
      if (changed && playing) draw()
    }
    if (playing && !paused) raf = requestAnimationFrame(tick)
  }
  const start = () => { if (!raf && !paused) { last = performance.now(); raf = requestAnimationFrame(tick) } }
  const ro = new ResizeObserver(() => draw())
  ro.observe(host)
  return {
    play(item, opts = {}) {
      const own = ++token
      loadSheet(item.sheet).then((sheet) => {
        if (own !== token) return
        cur = item; img = sheet; idx = 0; acc = 0; elapsed = 0
        total = item.frames.reduce((a, b) => a + b, 0)
        loop = opts.loop ?? !!item.loop
        mirror = !!opts.mirror
        playing = true
        draw()
        start()
      }, () => { if (own === token) onEnded?.(item) })
      return own
    },
    current: () => cur,
    time: () => ({ t: elapsed / 1000, duration: total / 1000 }),
    blocked: () => false,
    resume() { paused = false; start() },
    pause() { paused = true; cancelAnimationFrame(raf); raf = 0 },
    destroy() { token++; paused = true; cancelAnimationFrame(raf); ro.disconnect(); canvas.remove() },
  }
}

// ---------- Spine 骨骼动画（明日方舟）：运行时按需加载，只在用到时下载 ----------
let spineRuntime = null
const loadSpineRuntime = (url) => (spineRuntime ??= new Promise((resolve, reject) => {
  if (window.spine?.webgl) return resolve(window.spine)
  const s = document.createElement('script')
  s.src = url
  s.onload = () => (window.spine?.webgl ? resolve(window.spine) : reject(Error('Spine 运行时不可用')))
  s.onerror = () => { spineRuntime = null; reject(Error('Spine 运行时加载失败')) }
  document.head.append(s)
}))

export function createSpinePlayer(host, { className, def, onEnded, onReady, onBroken }) {
  const canvas = document.createElement('canvas')
  canvas.className = className
  canvas.setAttribute('aria-hidden', 'true')
  host.append(canvas)
  let spine, gl, renderer, skeleton, state, bounds = null, cur = null, pending = null, mirror = false
  let raf = 0, last = 0, paused = false, pausedAt = 0, startedAt = 0, holdFor = 0, token = 0, dead = false, ready = false, assets = null
  const frame = (now) => {
    raf = 0
    if (paused || dead || !ready) return
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    fitCanvas(canvas, host)
    state.update(dt)
    state.apply(skeleton)
    skeleton.scaleX = mirror ? -1 : 1
    skeleton.updateWorldTransform()
    // 镜头按骨骼包围盒摆：身体高度占命中框那么高，脚踩在 def.feet 处（和命中框一致）。
    const scale = Math.min((canvas.height * (def.hit.y1 - def.hit.y0)) / bounds.h, (canvas.width * 0.9) / bounds.w)
    const cam = renderer.camera
    cam.viewportWidth = canvas.width / scale
    cam.viewportHeight = canvas.height / scale
    cam.position.x = bounds.x + bounds.w / 2
    cam.position.y = bounds.y + cam.viewportHeight * (def.feet - 0.5)
    cam.update()
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    renderer.begin()
    renderer.drawSkeleton(skeleton, PMA)
    renderer.end()
    if (cur && holdFor && performance.now() - startedAt > holdFor * 1000) { const item = cur; holdFor = 0; onEnded?.(item) }
    raf = requestAnimationFrame(frame)
  }
  const start = () => { if (!raf && !paused && ready && !dead) { last = performance.now(); raf = requestAnimationFrame(frame) } }
  const apply = (item, opts) => {
    cur = item
    mirror = !!opts.mirror
    const loop = opts.loop ?? !!item.loop
    state.setAnimation(0, item.anim, loop)
    startedAt = performance.now()
    holdFor = loop && item.hold && opts.loop !== true ? item.hold[0] + Math.random() * (item.hold[1] - item.hold[0]) : 0
    start()
  }
  ;(async () => {
    try {
      spine = await loadSpineRuntime(def.spine.runtime)
      if (dead) return
      const ctx = new spine.webgl.ManagedWebGLRenderingContext(canvas, { alpha: true, premultipliedAlpha: true, antialias: false })
      gl = ctx.gl
      renderer = new spine.webgl.SceneRenderer(canvas, ctx, true)
      assets = new spine.webgl.AssetManager(ctx)
      assets.loadBinary(def.spine.skel)
      assets.loadTextureAtlas(def.spine.atlas)
      await new Promise((resolve, reject) => {
        const wait = () => { if (assets.isLoadingComplete()) return assets.hasErrors() ? reject(Error('模型加载失败')) : resolve(); setTimeout(wait, 50) }
        wait()
      })
      if (dead) return
      const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(assets.get(def.spine.atlas))).readSkeletonData(assets.get(def.spine.skel))
      skeleton = new spine.Skeleton(data)
      state = new spine.AnimationState(new spine.AnimationStateData(data))
      state.data.defaultMix = 0.2
      state.addListener({ complete: (entry) => { if (!entry.loop && cur && entry.animation.name === cur.anim) onEnded?.(cur) } })
      skeleton.setToSetupPose()
      skeleton.updateWorldTransform()
      if (def.spine.bounds?.w) bounds = def.spine.bounds
      else {
        const offset = new spine.Vector2(), size = new spine.Vector2()
        skeleton.getBounds(offset, size, [])
        bounds = { x: offset.x, y: offset.y, w: size.x, h: size.y }
      }
      ready = true
      onReady?.()
      if (pending) { apply(pending.item, pending.opts); pending = null }
    } catch (error) { console.warn(error); onBroken?.(error) }
  })()
  return {
    play(item, opts = {}) {
      const own = ++token
      if (!ready) pending = { item, opts }
      else apply(item, opts)
      return own
    },
    current: () => cur,
    time: () => ({ t: (performance.now() - startedAt) / 1000, duration: holdFor || (state?.getCurrent(0)?.animation?.duration ?? 0) }),
    blocked: () => false,
    // 暂停期间不计时：否则恢复后「播放一段时间」的循环动作和走路进度会直接跳到结尾。
    resume() { if (paused && pausedAt) startedAt += performance.now() - pausedAt; paused = false; pausedAt = 0; start() },
    pause() { if (!paused) pausedAt = performance.now(); paused = true; cancelAnimationFrame(raf); raf = 0 },
    // 换宠物时释放贴图和 WebGL 上下文，避免反复切换后浏览器上下文数量耗尽。
    destroy() {
      dead = true; token++; cancelAnimationFrame(raf)
      try { assets?.dispose() } catch {}
      try { renderer?.dispose() } catch {}
      try { gl?.getExtension('WEBGL_lose_context')?.loseContext() } catch {}
      canvas.remove()
    },
  }
}
// 明日方舟模型的贴图是预乘 alpha（Ark-Models 2025-03 起统一）。
const PMA = true

// 按宠物类型挑播放器。
export function createPlayerFor(def, host, opts) {
  if (def.kind === 'frames') return createFramePlayer(host, { ...opts, def })
  if (def.kind === 'spine') return createSpinePlayer(host, { ...opts, def })
  return createVideoPlayer(host, opts)
}
