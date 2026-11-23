import {mountFullscreen} from '/pet-fullscreen.js?v=472f7fbf'
import { CARE, petLevels, DAILY_XP_CAP, initPetStore, petStore, petState, subscribePet, carePet, petInteract, rememberAction, reloadPet, flushPet, floatPrefs, setFloatPrefs, petSrc, currentPet, setActivePet, petCatalog, unlocked, unlockLevel, hasPerk, petName, renamePet, xpToNext } from '/pet-store.js?v=472f7fbf'
import { createPlayerFor } from '/pet-player.js?v=472f7fbf'

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else if (key === 'html') node.innerHTML = value
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value)
    else if (key === 'value') node.value = value
    else if (key === 'checked') node.checked = !!value
    else if (key === 'disabled') node.disabled = !!value
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of children.flat(Infinity)) if (child != null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  return node
}

const groupLabels = {
  idle: '待机', turn: '转向', drag: '拖拽', click: '点击回应', move: '移动', sleep: '睡眠',
  balance: '余额', whisper: '碎碎念', work: '工作状态', text: '文字', small: '小动作', play: '玩耍', food: '吃什么', season: '时节', other: '其他',
}
const bjDate = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)

// 原来的站宠屋页面（养成、动作目录、换宠），现在作为小岛菜单里的「宠物屋」打开。
export async function mountPetRoom(root, { user, api, onLeave, navigate, toast, embedded = false }) {
  if (!user) {
    root.replaceChildren(el('section', { class: 'pets-login' }, el('h1', { text: '站宠屋' }), el('p', { text: '登录后才能保存自己的宠物进度。' }), el('a', { class: 'btn btn-primary', href: '/login?next=%2Fpets' }, '登录并进入')))
    return { destroy() {} }
  }

  try {
    await initPetStore({ user, api })
  } catch (error) {
    root.replaceChildren(el('section', { class: 'pets-login' }, el('h1', { text: '站宠屋暂时无法打开' }), el('p', { text: error.message }), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload() }, '重新加载')))
    throw error
  }
  const store = petStore()
  let def = currentPet(), actions = def.actions
  const role = (key) => actions.find((a) => a.name === def.roles[key]) || null
  let selectedGroup = 'all'
  let selectedAction = null

  const page = el('section', { class: 'pets-page' })
  const sync = el('span', { class: 'pets-sync', role: 'status' })
  const floatToggle = el('input', { type: 'checkbox', checked: !floatPrefs().hidden, onchange: () => {
    setFloatPrefs({ hidden: !floatToggle.checked, collapsed: false })
    toast?.(floatToggle.checked ? '站宠会在其他页面陪着你' : '已关闭全站悬浮，可随时在这里打开')
  } })
  const header = el('header', { class: 'pets-head' },
    el('div', { class: 'pets-head-copy' }, el('p', { class: 'eyebrow' }, '站内陪伴'), el('h1', { text: '站宠屋' }), el('p', { class: 'muted', text: '每天来摸摸它、喂喂它，它会慢慢长大，解锁更多动作和本事。' })),
    el('div', { class: 'pets-head-actions' }, sync, el('label', { class: 'pets-float-toggle' }, floatToggle, el('span', { text: '全站悬浮陪伴' })), el('button', { class: 'btn', type: 'button', onclick: () => openArena() }, '⚔ 擂台'), el('button', { class: 'btn ghost', type: 'button', onclick: () => petsDialog.showModal() }, '换一只'), el('button', { class: 'btn ghost', type: 'button', onclick: () => navigate('/') }, '回到图廊')))

  // ---------- 舞台 ----------
  const stage = el('section', { class: 'pet-stage', 'aria-label': '当前站宠' })
  const fallbackTitle = el('strong'), fallbackText = el('span')
  const stageFallback = el('div', { class: 'pet-video-fallback', hidden: true }, fallbackTitle, fallbackText)
  const showFallback = (blocked) => {
    fallbackTitle.textContent = blocked ? '动画被浏览器暂停了' : '当前浏览器暂不支持透明动画'
    fallbackText.textContent = blocked ? '点一下这里继续播放。' : '养成和动作目录仍可正常使用。'
    stageFallback.dataset.blocked = blocked ? '1' : ''
    stageFallback.hidden = false
  }
  const holder = el('div', { class: 'pet-player', title: '点一下摸摸它', role: 'button', tabindex: '0', 'aria-label': '摸摸站宠' })
  let player = null
  const makePlayer = () => {
    player?.destroy?.()
    holder.replaceChildren()
    holder.dataset.kind = def.kind
    holder.style.aspectRatio = def.aspect.toFixed(4)
    player = createPlayerFor(def, holder, {
      className: 'pet-video', srcOf: petSrc,
      onEnded: (item) => { if (item?.group === 'idle') return; const base = role('idle') || actions.find((a) => a.group === 'idle'); if (base) setAction(base, false, true) },
      onBlocked: () => showFallback(true),
      onBroken: () => showFallback(false),
    })
  }
  makePlayer()
  stageFallback.addEventListener('click', () => { if (stageFallback.dataset.blocked) { stageFallback.hidden = true; void player.resume() } })
  const nameEl = el('strong', { class: 'pet-stage-name' })
  const actionName = el('span', { class: 'pet-stage-action', text: '准备中…' })
  const stageCaption = el('div', { class: 'pet-stage-caption' }, nameEl, actionName)
  const stageTip = el('p', { class: 'pet-stage-tip', text: '点它摸摸头；点动作卡片播放。' })
  const creditLine = el('p', { class: 'pet-credit' })
  const drawCredit = () => {
    creditLine.replaceChildren(def.credit?.text || '')
    const link = def.credit?.links?.[0]
    if (link) creditLine.append(' ', el('a', { href: link, target: '_blank', rel: 'noopener' }, '出处'))
    creditLine.hidden = !def.credit
  }
  stage.append(holder, stageFallback, stageCaption, stageTip)
  const poke = () => {
    const before = petState().level
    const result = petInteract()
    status.textContent = result.say
    if (petState().level > before) return
    const picks = (def.roles.click || []).map((n) => actions.find((a) => a.name === n)).filter((a) => a && unlocked(a))
    const pool = picks.length ? picks : actions.filter((a) => a.group === 'click' && unlocked(a))
    setAction(pool[Math.floor(Math.random() * pool.length)], false)
  }
  holder.addEventListener('click', poke)
  holder.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke() } })

  // ---------- 状态 ----------
  const meterEls = new Map()
  const meter = (key, label) => {
    const value = el('strong', { class: 'pet-meter-value' })
    const fill = el('span', { class: 'pet-meter-fill' })
    const row = el('div', { class: 'pet-meter' }, el('div', { class: 'pet-meter-label' }, el('span', { text: label }), value), el('div', { class: 'pet-meter-track' }, fill))
    meterEls.set(key, { value, fill })
    return row
  }
  const levelValue = el('strong', { class: 'pet-level-value' })
  const xpFill = el('span', { class: 'pet-meter-fill' })
  const xpLabel = el('span', { class: 'pet-xp-label' })
  const stats = el('section', { class: 'pet-stats' },
    el('div', { class: 'pet-level' }, el('span', { class: 'pet-level-mark', text: 'LV' }), levelValue, el('div', { class: 'pet-xp' }, xpLabel, el('div', { class: 'pet-meter-track' }, xpFill))),
    meter('hunger', '饱食'), meter('energy', '精力'), meter('cleanliness', '清洁'), meter('affection', '亲密'))

  const status = el('div', { class: 'pet-inline-status', role: 'status' })
  const actionButtons = el('div', { class: 'pet-care-actions' })
  for (const [kind, care] of Object.entries(CARE)) {
    actionButtons.append(el('button', { class: 'pet-care-btn', type: 'button', onclick: () => {
      const before = petState().level
      const result = carePet(kind)
      status.textContent = result.say
      if (petState().level === before) setAction(result.action, false)
    } }, el('span', { class: `pet-care-icon pet-care-${kind}`, text: care.icon }), el('span', { class: 'pet-care-copy' }, el('strong', { text: care.label }), el('small', { text: care.detail }))))
  }

  function setAction(item, persist = true, loop = false) {
    if (!item) return
    selectedAction = item
    actionName.textContent = item.name
    stage.dataset.group = item.group
    stageFallback.hidden = true
    player.play(item, { loop })
    if (persist) rememberAction(item.name)
    renderState()
  }

  // ---------- 成长之路 ----------
  const growthList = el('ol', { class: 'pet-growth-list' })
  const nameInput = el('input', { class: 'pet-name-input', maxlength: '8', placeholder: '给它起个名字', 'aria-label': '站宠名字' })
  const nameRow = el('form', { class: 'pet-name-row', onsubmit: (e) => {
    e.preventDefault()
    if (renamePet(nameInput.value)) { toast?.('改好啦，以后它就叫「' + petName() + '」'); renderState() }
  } }, nameInput, el('button', { class: 'btn btn-small', type: 'submit' }, '改名'))
  const growth = el('section', { class: 'pet-growth' },
    el('div', { class: 'pet-growth-head' }, el('h2', { text: '成长之路' }), el('span', { class: 'pet-growth-today' })),
    el('p', { class: 'muted pet-growth-how', text: `每天第一次摸摸 +20 经验，之后每次摸摸 +2（20 秒一次），喂食 +8、玩耍 +12、休息和清洁 +4，悬浮陪伴每 2 分钟 +1。每天最多 ${DAILY_XP_CAP} 经验。` }),
    nameRow, growthList)

  // ---------- 图鉴 ----------
  const libraryCount = el('span', { class: 'pet-library-count' })
  const libraryNote = el('p', { class: 'muted' })
  const drawNote = () => { libraryNote.textContent = def.kind === 'spine' ? `${actions.length} 个骨骼动作，按需加载模型。` : `${actions.length} 段动画，升级逐步解锁；只有播放时才加载。` }
  const libraryGrid = el('div', { class: 'pet-library-grid' })
  const groupBar = el('div', { class: 'pet-group-bar', role: 'tablist', 'aria-label': '动作分类' })
  const groupIcon = (item) => item.group === 'food' ? '🍚' : item.group === 'play' ? '✦' : item.group === 'season' ? '❋' : item.group === 'sleep' ? '☾' : '·'
  const renderLibrary = () => {
    const state = petState()
    const visible = selectedGroup === 'all' ? actions : actions.filter((item) => item.group === selectedGroup)
    const open = visible.filter((item) => unlocked(item, state)).length
    libraryCount.textContent = `已解锁 ${open} / ${visible.length}`
    libraryGrid.replaceChildren(...visible.map((item) => {
      const ok = unlocked(item, state)
      return el('button', { class: `pet-action-card${selectedAction?.id === item.id ? ' on' : ''}${ok ? '' : ' locked'}`, type: 'button', disabled: !ok, 'data-id': item.id, onclick: () => setAction(item), title: ok ? `播放${item.name}` : `Lv${unlockLevel(item)} 解锁` },
        el('span', { class: 'pet-action-card-icon', text: ok ? groupIcon(item) : '🔒' }), el('span', { class: 'pet-action-card-name', text: item.name }), el('span', { class: 'pet-action-card-group', text: ok ? item.groupLabel : `Lv${unlockLevel(item)} 解锁` }))
    }))
    groupBar.querySelectorAll('button').forEach((button) => { button.classList.toggle('on', button.dataset.group === selectedGroup); button.setAttribute('aria-selected', String(button.dataset.group === selectedGroup)) })
  }
  const drawGroups = () => {
  const groups = [{ id: 'all', label: '全部' }, ...Object.keys(groupLabels).filter((id) => actions.some((item) => item.group === id)).map((id) => ({ id, label: groupLabels[id] }))]
  groupBar.replaceChildren(...groups.map((group) => el('button', { class: 'pet-group-tab', type: 'button', role: 'tab', 'aria-selected': String(group.id === 'all'), 'data-group': group.id, onclick: () => { selectedGroup = group.id; renderLibrary() } }, group.label)))
  }
  drawGroups()

  let shownLevel = 0
  function renderState() {
    const state = petState()
    nameEl.textContent = petName(state)
    levelValue.textContent = String(state.level)
    const need = xpToNext(state)
    xpFill.style.width = `${need ? Math.min(100, Math.round(state.xp / need * 100)) : 100}%`
    xpLabel.textContent = need ? `成长经验 ${state.xp} / ${need}` : '已满级'
    for (const [key, nodes] of meterEls) { nodes.value.textContent = `${state[key]}%`; nodes.fill.style.width = `${state[key]}%` }
    sync.textContent = store.status.text
    sync.dataset.kind = store.status.kind
    retry.hidden = store.status.kind !== 'error'
    const todayXp = state.daily?.day === bjDate() ? state.daily.xp : 0
    growth.querySelector('.pet-growth-today').textContent = `今日经验 ${todayXp} / ${DAILY_XP_CAP}`
    nameRow.hidden = !hasPerk(8, state)
    if (document.activeElement !== nameInput) nameInput.value = state.nickname || ''
    if (shownLevel !== state.level) {
      shownLevel = state.level
      const levels = petLevels(def), nextLevel = levels.find((x) => x.level > state.level)
      growthList.replaceChildren(...levels.map((l) => el('li', { class: 'pet-growth-step' + (state.level >= l.level ? ' done' : '') + (nextLevel === l ? ' next' : '') },
        el('span', { class: 'pet-growth-lv', text: 'Lv' + l.level }),
        el('div', null, el('strong', { text: l.title }), el('ul', null, l.perks.map((p) => el('li', { text: p })))))))
      renderLibrary()
    }
    libraryGrid.querySelectorAll('.pet-action-card').forEach((button) => button.classList.toggle('on', button.dataset.id === selectedAction?.id))
  }

  // ---------- 换一只 ----------
  // 加载中再点别的也照常切换，pet-store 只采用最后一次选择。
  async function switchTo(id) {
    if (id === def.id) return petsDialog.close() // 点的就是当前这只：关掉对话框即可
    try { const got = await setActivePet(id); if (got?.id === id) toast?.('换成' + got.name + '啦') }
    catch (error) { toast?.(error.message || '换宠物失败', 'err') }
  }
  // 换宠物统一走这里：悬浮宠物换、这个页面换，两边都会收到 petchange。
  function adoptPet(next) {
    def = next
    actions = def.actions
    selectedGroup = 'all'
    selectedAction = null
    petsDialog.close()
    makePlayer()
    drawCredit()
    drawGroups()
    drawNote()
    shownLevel = null // 成长之路按新宠物的动作重画
    const first = role('idle') || actions[0]
    setAction(first, false, !!first?.loop || first?.group === 'idle')
    renderLibrary()
    renderState()
  }
  // 大肥鱼擂台：按需加载，不影响站宠屋首屏。
  const openArena = () => import('/pet-battle.js?v=472f7fbf').then(({ openBattle }) => openBattle({ api, toast, user })).catch((e) => toast?.(e.message || '擂台加载失败', 'err'))
  if (location.hash === '#battle' && !embedded) queueMicrotask(openArena)
  const petsDialog = el('dialog', { class: 'pet-pick-dialog', onclick: (e) => { if (e.target === petsDialog) petsDialog.close() } })
  const pickSearch = el('input', { type: 'search', class: 'pet-pick-search', placeholder: '搜索站宠名字', 'aria-label': '搜索站宠' })
  const pickList = el('div', { class: 'pet-pick-list' })
  const pickCredit = el('p', { class: 'pet-credit' })
  petsDialog.append(el('form', { method: 'dialog', class: 'pet-pick-inner' },
    el('header', { class: 'pet-pick-head' }, el('h2', { text: '选择站宠' }), el('button', { class: 'btn-icon', type: 'submit', 'aria-label': '关闭' }, '×')),
    pickSearch, pickList, pickCredit))
  let catalog = null
  // 每个分组先显示一页，按钮继续加载；搜索时回到第一页。
  const PICK_PAGE = 200
  const pickLimit = new Map()
  const drawPick = () => {
    if (!catalog) return
    const q = pickSearch.value.trim()
    const groups = [{ name: '站宠', pets: catalog.pets.map((p) => ({ ...p, sub: p.blurb || '' })) },
      ...catalog.series.map((s) => ({ name: s.name, credit: s.credit, pets: s.pets.map((p) => ({ ...p, sub: p.rarity ? '★'.repeat(p.rarity) : '', credit: s.credit })) }))]
    pickList.replaceChildren(...groups.flatMap((g) => {
      const shown = g.pets.filter((p) => !q || p.name.includes(q) || (p.sub || '').includes(q))
      if (!shown.length) return []
      const limit = pickLimit.get(g.name) || PICK_PAGE, more = shown.length - limit
      return [el('h3', { class: 'pet-pick-group' }, g.name, el('small', null, `${shown.length} 只`)),
        el('div', { class: 'pet-pick-grid' }, shown.slice(0, limit).map((p) => el('button', {
          class: 'pet-pick-item' + (p.id === def.id ? ' on' : ''), type: 'button',
          onclick: () => switchTo(p.id), onmouseenter: () => { pickCredit.textContent = (p.credit || g.credit)?.text || '' },
        }, el('strong', { text: p.name }), p.sub && el('small', { text: p.sub })))),
        more > 0 && el('button', { class: 'pet-pick-more', type: 'button', text: `显示更多（还有 ${more} 只）`,
          onclick: () => { pickLimit.set(g.name, limit + PICK_PAGE); drawPick() } })].filter(Boolean)
    }))
    if (!pickList.children.length) pickList.replaceChildren(el('p', { class: 'muted', text: '没有找到' }))
  }
  pickSearch.addEventListener('input', () => { pickLimit.clear(); drawPick() })
  petsDialog.addEventListener('close', () => { pickSearch.value = '' })
  petsDialog.addEventListener('cancel', () => {})
  const loadCatalog = () => petCatalog().then((c) => { catalog = c; drawPick() }, () => { pickList.replaceChildren(el('p', { class: 'muted', text: '站宠列表读取失败' })) })
  queueMicrotask(loadCatalog)
  const onPetChange = ({ detail }) => { if (detail.id !== def.id) adoptPet(detail) }
  addEventListener('petchange', onPetChange)

  const retry = el('button', { class: 'btn btn-small', type: 'button', hidden: true, onclick: () => reloadPet().then(() => { status.textContent = '云端进度已恢复' }, (error) => { status.textContent = error.message }) }, '重新读取云档')
  status.append(retry)
  const library = el('section', { class: 'pet-library' }, el('div', { class: 'pet-library-head' }, el('div', null, el('h2', { text: '动作图鉴' }), libraryNote), libraryCount), groupBar, libraryGrid)
  const info = el('section', { class: 'pet-info' }, el('div', { class: 'pet-info-main' }, stats, actionButtons), el('div', { class: 'pet-care-note' }, el('strong', { text: '养成提示' }), el('span', { text: '每小时会自然消耗少量饱食、精力和清洁度，等级越高消耗越慢。吃饱了、玩累了它会拒绝。' }), status))
  page.append(header, el('div', { class: 'pets-layout' }, el('div', { class: 'pets-left' }, stage, creditLine, info, growth), library), petsDialog)
  root.replaceChildren(page)

  const state = petState()
  const first = actions.find((item) => item.name === state.currentAction && unlocked(item, state)) || actions.find((item) => item.group === 'idle') || actions[0]
  setAction(first, false, first.group === 'idle' || !!first.loop)
  drawCredit()
  drawNote()
  renderState()


  const offStore = subscribePet(renderState)
  const offPrefs = (() => { const fn = ({ detail }) => { floatToggle.checked = !detail.hidden }; addEventListener('petfloatprefs', fn); return () => removeEventListener('petfloatprefs', fn) })()
  const onLevel = ({ detail }) => {
    const perk = detail.perk
    toast?.(`${petName()} 升到 Lv${detail.level}` + (perk ? `「${perk.title}」：${perk.perks.join('，')}` : ''), 'ok')
    const party = [role('celebrate'), role('wave'), role('idle')].find((a) => a && unlocked(a))
    setAction(party, false)
  }
  addEventListener('petlevelup', onLevel)
  const onVisible = () => { if (document.hidden) player.pause(); else void player.resume() }
  document.addEventListener('visibilitychange', onVisible)
  let left = false
  const leave = () => {
    if (left) return
    left = true
    offStore(); offPrefs()
    removeEventListener('petlevelup', onLevel)
    removeEventListener('petchange', onPetChange)
    document.removeEventListener('visibilitychange', onVisible)
    player.destroy()
    void flushPet()
  }
  onLeave(leave)
  return { destroy: leave }
}

// /pets 入口：大肥鱼的小岛（整屏像素场景）。菜单里可以进集市、背包、擂台、宠物屋、说明。

// ---------- 11-11 b15 摸鱼小窗 ----------
let b22OnOpen = null
const b22Open = (what) => b22OnOpen?.(what)
const b15Mini = (() => {
  let st = null
  const pref = () => { try { return localStorage.getItem('b15IsleMini') !== '0' } catch { return true } }
  const setPref = (on) => { try { localStorage.setItem('b15IsleMini', on ? '1' : '0') } catch {} }
  const savePos = () => { if (!st) return; const r = st.wrap.getBoundingClientRect(); try { localStorage.setItem('b15IsleMiniPos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })) } catch {} }
  const loadPos = (wrap) => {
    let p = null; try { p = JSON.parse(localStorage.getItem('b15IsleMiniPos') || 'null') } catch {}
    if (!p || !(p.w > 0)) return
    const w = Math.min(Math.max(220, p.w), innerWidth - 16), h = Math.min(Math.max(170, p.h), innerHeight - 16)
    Object.assign(wrap.style, { width: w + 'px', height: h + 'px', left: Math.min(Math.max(8, p.x), innerWidth - w - 8) + 'px', top: Math.min(Math.max(8, p.y), innerHeight - h - 8) + 'px', right: 'auto', bottom: 'auto' })
  }
  const close = () => { if (!st) return; const s = st; st = null; savePos(); s.ro?.disconnect(); s.wrap.remove(); s.pill.remove(); document.body.classList.remove('b15-mini-on'); void s.isle?.destroy?.() }
  const hide = (on) => { if (!st) return; st.wrap.hidden = on; st.pill.hidden = !on }
  function keep(host, isle, { navigate }) {
    if (!pref() || !isle || !host?.isConnected) return false
    host.classList.add('b15-mini-host'); host.style.width = ''; host.style.marginLeft = ''; host.style.marginRight = ''
    const btn = (t, label, fn) => el('button', { type: 'button', class: 'b15-mini-btn', title: label, 'aria-label': label, onclick: (e) => { e.stopPropagation(); fn() } }, t)
    const bar = el('div', { class: 'b15-mini-bar' }, el('b', { text: '星🐟谷' }), btn('⤢', '回到大屏', () => navigate('/pets')), btn('—', '收起（连按两次 Esc 也会隐藏）', () => hide(true)), btn('✕', '关闭小窗（离线时管家照常补算）', close))
    const wrap = el('div', { class: 'b15-mini', role: 'dialog', 'aria-label': '星🐟谷摸鱼小窗' }, bar)
    const pill = el('button', { type: 'button', class: 'b15-mini-pill', hidden: true, title: '展开星🐟谷小窗', 'aria-label': '展开星🐟谷小窗', onclick: () => hide(false) }, '🐟')
    wrap.append(host); document.body.append(wrap, pill); document.body.classList.add('b15-mini-on'); loadPos(wrap)
    // 拖动标题栏移动；桌面端右下角可拉伸（CSS resize），尺寸与位置记在本机。
    let drag = null
    bar.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; const r = wrap.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; bar.setPointerCapture(e.pointerId) })
    bar.addEventListener('pointermove', (e) => { if (!drag) return; const r = wrap.getBoundingClientRect(); Object.assign(wrap.style, { left: Math.min(Math.max(0, e.clientX - drag.dx), innerWidth - r.width) + 'px', top: Math.min(Math.max(0, e.clientY - drag.dy), innerHeight - r.height) + 'px', right: 'auto', bottom: 'auto' }) })
    bar.addEventListener('pointerup', () => { if (drag) { drag = null; savePos() } })
    const ro = new ResizeObserver(() => savePos()); ro.observe(wrap)
    st = { host, isle, wrap, pill, ro }
    return true
  }
  function take() {
    if (!st) return null
    const s = st; st = null; savePos(); s.ro?.disconnect(); s.pill.remove(); s.wrap.remove()
    s.host.classList.remove('b15-mini-host'); document.body.classList.remove('b15-mini-on')
    return { host: s.host, isle: s.isle }
  }
  return { keep, take, close, pref, setPref }
})()

export async function mountPets(root, opts) {
  const { user, api, onLeave, navigate, toast } = opts
  if (!user) {
    root.replaceChildren(el('section', { class: 'pets-login' }, el('h1', { text: '大肥鱼的小岛' }), el('p', { text: '登录后就能在小岛上种菜、养动物、钓鱼、挖矿，用 D币 经营自己的岛。' }), el('a', { class: 'btn btn-primary', href: '/login?next=%2Fpets' }, '登录并进入')))
    return { destroy() {} }
  }
  if (!document.getElementById('pet-isle-styles')) document.head.append(el('link', { id: 'pet-isle-styles', rel: 'stylesheet', href: '/pet-isle.css?v=472f7fbf' }))
  if(!document.getElementById('b13-island-layout'))document.head.append(el('link',{id:'b13-island-layout',rel:'stylesheet',href:'/b13-island-layout.css?v=472f7fbf'}));
  const docked = b15Mini.take()
  const host = docked?.host || el('section', { class: 'pets-hub b13-island-layout' })
  root.replaceChildren(host)
  // 2026-11-04 降价后的一键回收（仅当天）：顶部横幅
  import('/pet-refund.js?v=472f7fbf').then((m) => m.refundBanner({ onLeave, onDone: () => location.reload() })).catch(() => {})
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
  let isle = null, room = null, left = false, xian = null, switching = false
  const [isleMod, ui] = await Promise.all([import('/pet-isle.js?v=472f7fbf'), import('/pet-isle-ui.js?v=472f7fbf')]), { mountIsle } = isleMod
  if (left) return { destroy() {} }
  const openArena = () => import('/pet-battle.js?v=472f7fbf').then(({ openBattle }) => openBattle({ api, toast, user })).catch((e) => toast?.(e.message || '擂台加载失败', 'err'))
  const openRoom = async () => {
    const box = el('div', { class: 'pets-room-body' })
    const layer = el('div', { class: 'pets-room' }, el('header', {}, el('button', { class: 'isle-btn ghost', type: 'button', onclick: () => closeRoom() }, '← 回小岛'), el('b', { text: '宠物屋' })), box)
    const closeRoom = () => { room?.destroy?.(); room = null; layer.remove(); isle?.refresh() }
    host.append(layer)
    room = await mountPetRoom(box, { ...opts, embedded: true, onLeave: () => {} })
  }
  const switchXian=async(enter)=>{
    if(switching||left)return;switching=true;
    try{
      if(enter){
        await isle?.flush?.();for(let i=0;i<60&&isle?.busy?.();i++)await new Promise(r=>setTimeout(r,100));
        if(isle?.busy?.())throw Error('小岛操作还在保存，请稍后再进大肥鱼修仙记');
        const mod=await import('/xs/entry.js?v=20b20a0e');if(left)return;
        host.querySelector('.isle-sheet-wrap')?.dispatchEvent(new Event('isleclose'));
        await isle?.destroy?.();isle=null;
        xian=await mod.mountXian(host,{toast,onReturn:()=>switchXian(false)});
        if(left){await xian.destroy();xian=null}
      }else{await xian?.destroy?.();xian=null;if(left)return;isle=await mountIsle(host,{toast,user,onOpen:b22Open})}
      fit();
    }catch(e){toast?.(e.message||'场景切换失败','err');if(!left&&!isle&&!xian)isle=await mountIsle(host,{toast,user,onOpen:b22Open})}
    finally{switching=false}
  }
  const onOpen = (what) => {
    if (what === 'xian') return toast?.('大肥鱼修仙记已下线，存档已保留', 'ok')
    if (what === 'market') return ui.openMarket(host, isle)
    if (what === 'guide') return ui.openGuide(host)
    if (what === 'battle') return openArena()
    if (what === 'bag') return ui.openBag(host, isle, () => ui.openMarket(host, isle))
    if (what === 'room') return openRoom()
    if (what === 'auto') return ui.openAuto(host, isle, toast)
    if (what === 'fun' || what === 'lotto') return import('/pet-isle-fun.js?v=472f7fbf').then((m) => (what === 'fun' ? m.openFun : m.openLotto)(host, isle, { toast })).catch((e) => toast?.(e.message || '加载失败', 'err'))
    if (what === 'arcade') return import('/isle-arcade.js?v=472f7fbf').then((m) => m.openArcade(host, isle, { toast })).catch((e) => toast?.(e.message || '游乐馆加载失败', 'err'))
    if (what === 'warehouse') return import('/isle-warehouse.js?v=472f7fbf').then((m) => m.openWarehouseHall(host, isle, { toast })).catch((e) => toast?.(e.message || '仓库加载失败', 'err'))
    if (what === 'visit') return import('/pet-isle-visit.js?v=472f7fbf').then((m) => m.openVisit(host, isle, { toast, user })).catch((e) => toast?.(e.message || '串门加载失败', 'err'))
    if (what === 'menu') {
      const prefs = floatPrefs()
      const tile = (icon, label, sub, fn) => el('button', { class: 'isle-menu-tile', type: 'button', onclick: () => { sh.close(); fn() } }, el('span', { class: 'isle-menu-ic', text: icon }), el('b', { text: label }), el('small', { text: sub }))
      let sfxOn = true; try { sfxOn = localStorage.getItem('isleSfx') !== '0' } catch {}
      const sfxToggle = el('input', { type: 'checkbox', checked: sfxOn, onchange: () => isleMod.setSfx(sfxToggle.checked) })
      const miniToggle = el('input', { type: 'checkbox', checked: b15Mini.pref(), onchange: () => { b15Mini.setPref(miniToggle.checked); toast?.(miniToggle.checked ? '离开小岛时会缩成右下角小窗' : '离开小岛时直接关闭', 'ok') } })
      const toggle = el('input', { type: 'checkbox', checked: !prefs.hidden, onchange: () => { setFloatPrefs({ hidden: !toggle.checked, collapsed: false }); toast?.(toggle.checked ? '大肥鱼会在其他页面陪着你' : '已关闭全站悬浮', 'ok') } })
      const sh = ui.sheet(host, '菜单', el('div', { class: 'isle-menu' },
        el('div', { class: 'isle-menu-grid' },
          tile('🎒', '背包', '看看攒了什么', () => onOpen('bag')),
          tile('🐱', '集市', '卖货 · 行情 · 杂货', () => onOpen('market')),
          tile('⚔', '擂台', '和别人的大肥鱼对战', () => onOpen('battle')),
          tile('🚤', '串门', '去别人的岛偷菜，小心大肥鱼看门', () => onOpen('visit')),
          tile('🤖', '挂机管家', '配置策略，离线也干活', () => onOpen('auto')),
          tile('🐋', '宠物屋', '养成 · 动作 · 换宠', () => onOpen('room')),
          tile('📜', '说明', '玩法和数值表', () => onOpen('guide')),
          tile('🖼', '回图廊', '离开小岛', () => navigate('/'))),
        el('label', { class: 'isle-menu-float' }, toggle, el('span', { text: '在其他页面显示悬浮大肥鱼' })),
        el('label', { class: 'isle-menu-float' }, sfxToggle, el('span', { text: '小岛音效' })),
        el('label', { class: 'isle-menu-float' }, miniToggle, el('span', { text: '离开小岛时缩成摸鱼小窗（连按两次 Esc 隐藏）' })),
        el('button', { class: 'isle-btn b15-mini-go', type: 'button', onclick: () => { sh.close(); b15Mini.setPref(true); miniToggle.checked = true; if (history.length > 1 && document.referrer.startsWith(location.origin)) history.back(); else navigate('/') } }, '⧉ 缩成小窗，继续逛站')))
    }
  }
  b22OnOpen = onOpen
  try { await initPetStore({ user, api }) } catch {}
  isle = docked?.isle || await mountIsle(host, { toast, user, onOpen: b22Open })
  const offFullscreen=mountFullscreen(host,{notify:toast});
  if (docked) { fit(); isle.refresh?.() }
  if (location.hash === '#battle') queueMicrotask(openArena)
  const leave = () => { if (left) return; left = true; offFullscreen(); unlockScroll(); removeEventListener('resize', fit); room?.destroy?.(); if (xian) { void xian.destroy(); xian = null } if (isle && b15Mini.keep(host, isle, { navigate })) return; void isle?.destroy?.() }
  onLeave(leave)
  return { destroy: leave }
}
