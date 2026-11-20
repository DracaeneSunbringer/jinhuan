const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value)
    else if (key === 'value') node.value = value
    else if (key === 'checked') node.checked = !!value
    else if (key === 'disabled') node.disabled = !!value
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of children.flat(Infinity)) if (child != null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  return node
}

export async function mountValley(root, opts) {
  const { user, api, onLeave, navigate, toast } = opts
  if (!user) {
    root.replaceChildren(el('section', { class: 'pets-login' }, el('h1', { text: '鱼鱼谷' }), el('p', { text: '登录后就能在小岛上种菜、养动物、钓鱼、挖矿，用 D币 经营自己的岛。' }), el('a', { class: 'btn btn-primary', href: '/login?next=%2Fvalley' }, '登录并进入')))
    return { destroy() {} }
  }
  if (!document.getElementById('pet-isle-styles')) document.head.append(el('link', { id: 'pet-isle-styles', rel: 'stylesheet', href: '/pet-isle.css' }))
  const host = el('section', { class: 'pets-hub' })
  root.replaceChildren(host)
  // 小岛是整屏游戏：在 /pets 期间锁住页面滚动（否则滚轮会把页面往下卷，顶部状态栏被站点头部盖住、底部露出空白），离开时还原
  const htmlEl = document.documentElement, prevOverflow = [htmlEl.style.overflow, document.body.style.overflow]
  htmlEl.style.overflow = 'hidden'; document.body.style.overflow = 'hidden'; scrollTo(0, 0)
  const unlockScroll = () => { htmlEl.style.overflow = prevOverflow[0]; document.body.style.overflow = prevOverflow[1] }
  // 小岛铺满站点头部以下的整屏
  const fit = () => {
    // 横向贴满视口（不依赖 100vw，避免算进滚动条宽度留下一条缝）
    const ml = parseFloat(host.style.marginLeft) || parseFloat(getComputedStyle(host).marginLeft) || 0
    const probe = document.body.appendChild(el('div', { style: 'position:fixed;left:0;right:0;top:0;height:0;visibility:hidden' })), vw = probe.getBoundingClientRect().width; probe.remove() // 实际可见宽度（扣掉保留的滚动条槽）
    host.style.width = vw + 'px'; host.style.marginRight = '0'; host.style.marginLeft = (ml - host.getBoundingClientRect().left) + 'px'
    host.style.setProperty('--isle-top', Math.max(0, Math.round(host.getBoundingClientRect().top + scrollY)) + 'px')
    // 手机底部导航是 fixed 的：找出压在屏幕底部的固定元素，留出它的高度
    let bottom = 0
    for (const n of document.elementsFromPoint(innerWidth / 2, innerHeight - 2)) { if (host.contains(n)) continue; let e = n; while (e && e !== document.body) { const cs = getComputedStyle(e); if (cs.position === 'fixed' || cs.position === 'sticky') { const r = e.getBoundingClientRect(); if (r.width >= innerWidth * 0.6) bottom = Math.max(bottom, innerHeight - r.top); break } /* 只算横跨屏幕的底部导航，不算悬浮按钮 */ e = e.parentElement } }
    host.style.setProperty('--isle-bottom', Math.min(160, Math.round(bottom)) + 'px')
  }
  fit(); addEventListener('resize', fit)
  let isle = null, left = false
  const leave = () => { if (!left) { left = true; unlockScroll(); removeEventListener('resize', fit); void isle?.destroy?.() } }
  onLeave(leave)
  const [isleMod, ui] = await Promise.all([import('/pet-isle.js'), import('/pet-isle-ui.js')]), { mountIsle } = isleMod
  if (left) return { destroy: leave }
  const openArena = () => import('/pet-battle.js').then(({ openBattle }) => openBattle({ api, toast, user })).catch((e) => toast?.(e.message || '擂台加载失败', 'err'))
  const onOpen = (what) => {
    if (what === 'social') return import('/pet-isle-social.js').then(({openSocial})=>openSocial(host,isle,{user,toast})).catch(e=>toast?.(e.message,'err'))
    if (what === 'market') return ui.openMarket(host, isle)
    if (what === 'guide') return ui.openGuide(host)
    if (what === 'battle') return openArena()
    if (what === 'bag') return ui.openBag(host, isle, () => ui.openMarket(host, isle))
    if (what === 'auto') return ui.openAuto(host, isle, toast)
    if (what === 'menu') {
      const tile = (icon, label, sub, fn) => el('button', { class: 'isle-menu-tile', type: 'button', onclick: () => { sh.close(); fn() } }, el('span', { class: 'isle-menu-ic', text: icon }), el('b', { text: label }), el('small', { text: sub }))
      let sfxOn = true; try { sfxOn = localStorage.getItem('isleSfx') !== '0' } catch {}
      const sfxToggle = el('input', { type: 'checkbox', checked: sfxOn, onchange: () => isleMod.setSfx(sfxToggle.checked) })
      const sh = ui.sheet(host, '菜单', el('div', { class: 'isle-menu' },
        el('div', { class: 'isle-menu-grid' },
          tile('🎒', '背包', '看看攒了什么', () => onOpen('bag')),
          tile('🏡', '串门', '拜访 · 守护兽', () => onOpen('social')),
          tile('📚', '杂货铺', '卖货 · 行情 · 杂货', () => onOpen('market')),
          tile('⚔', '擂台', '和别人的大肥鱼对战', () => onOpen('battle')),
          tile('🤖', '挂机管家', '配置策略，离线也干活', () => onOpen('auto')),
          tile('📜', '说明', '玩法和数值表', () => onOpen('guide')),
          tile('🖼', '回图廊', '离开小岛', () => navigate('/'))),
        el('label', { class: 'isle-menu-float' }, sfxToggle, el('span', { text: '小岛音效' }))))
    }
  }
  try { isle = await mountIsle(host, { toast, user, onOpen }) } catch (error) { unlockScroll(); removeEventListener('resize', fit); throw error }
  if (left) { void isle.destroy?.(); return { destroy: leave } }
  if (location.hash === '#battle') queueMicrotask(openArena)
  if (location.hash === '#social') queueMicrotask(()=>onOpen('social'))
  return { destroy: leave }
}
