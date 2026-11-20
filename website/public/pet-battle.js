// 大肥鱼擂台大厅：挑战 / 装备 / 加点 / 商店 / 每日。所有结算、扣费都在服务端；这里只展示和发请求。
import { applyServerProgress, ensurePetSaved } from '/pet-store.js'

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v) }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c)
  return n
}
// replaceChildren 会把 null 变成文字 "null"，统一过滤掉
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((x) => x != null && x !== false))
const RAR = ['', '普通', '稀有', '史诗', '传说']
const SLOT = { weapon: '武器', armor: '服装', charm: '伙伴' }
const STAT = { hp: '生命', atk: '力量', def: '防御', agi: '敏捷', spd: '速度' }
const PASSIVE = { lifesteal: (v) => `吸血 ${Math.round(v * 100)}%`, counter: (v) => `反击 ${Math.round(v * 100)}%`, thorns: (v) => `反伤 ${Math.round(v * 100)}%`, revive: (v) => `复活 ${Math.round(v * 100)}%`, first: () => '首回合先手', evade: (v) => `闪避 +${Math.round(v * 100)}%` }
const thumb = (id) => `/pets/dsh/thumbs/${id}.webp`
const fmt = (n) => Number(n).toLocaleString('zh-CN')
const uuid = () => crypto.randomUUID()

export async function openBattle({ api, toast, user }) {
  document.querySelector('.pb-dialog')?.remove()
  if (!document.getElementById('pet-battle-styles')) document.head.append(el('link', { id: 'pet-battle-styles', rel: 'stylesheet', href: '/pet-battle.css' }))
  const dialog = el('dialog', { class: 'pb-dialog', 'aria-label': '大肥鱼擂台' })
  const info = el('div', { class: 'pb-top-info' })
  const tabsEl = el('nav', { class: 'pb-tabs' })
  const body = el('div', { class: 'pb-body' })
  dialog.append(el('header', { class: 'pb-top' }, el('h2', { text: '⚔ 大肥鱼擂台' }), info, el('button', { class: 'pb-close', type: 'button', 'aria-label': '关闭', onclick: () => dialog.close() }, '×')), tabsEl, body)
  let arena = null
  dialog.addEventListener('close', () => { arena?.destroy(); dialog.remove(); if (location.hash === '#battle') history.replaceState(null, '', location.pathname + location.search) })
  document.body.append(dialog)
  dialog.showModal()
  if (location.hash !== '#battle') history.replaceState(null, '', location.pathname + location.search + '#battle')

  const say = (text) => { const t = el('div', { class: 'pb-toast', text }); dialog.append(t); setTimeout(() => t.remove(), 2200) }
  const call = async (path, opts) => { try { return await api(path, opts) } catch (e) { say(e.message || '操作失败'); throw e } }
  let home = null, gear = null, duel = null, tab = 'fight'
  const TABS = [['fight', '擂台'], ['gear', '装备'], ['points', '加点'], ['shop', '商店'], ['daily', '每日'], ['guide', '说明']]
  // 约战轮询：对话框开着时每 5 秒看一次邀请；自己发起的约战被接受后自动播放回放。
  const shownDuels = new Set()
  const pollDuel = async () => {
    try {
      const prev = duel?.incoming?.length || 0
      duel = await api('/pet/duel')
      if (duel.incoming.length > prev) say('收到新的约战邀请！')
      for (const d of duel.outgoing) if (d.status === 'done' && d.battle_id && !shownDuels.has(d.id) && d.created_at > openedAt - 600) { shownDuels.add(d.id); say(`${d.invitee.name} 接受了约战！`); if (!arena) replay(d.battle_id) }
      renderTop()
      if (tab === 'fight' && !arena) drawDuels()
    } catch {}
  }
  const openedAt = Math.floor(Date.now() / 1000)
  const poll = setInterval(pollDuel, 5000)
  dialog.addEventListener('close', () => clearInterval(poll))
  let drawDuels = () => {}

  async function refresh() {
    await ensurePetSaved().catch(() => {})
    ;[home, gear, duel] = await Promise.all([api('/pet/battle/home'), api('/pet/battle/gear'), api('/pet/duel').catch(() => null)])
    for (const d of duel?.outgoing || []) if (d.status === 'done') shownDuels.add(d.id)
    renderTop()
  }
  function renderTop() {
    if (!home?.adopted) return
    put(info, el('span', { class: 'pb-pill' }, 'Lv', el('b', { text: home.me.level })), el('span', { class: 'pb-pill' }, '今日 ', el('b', { text: `${home.today.used}/${home.today.limit}` })), el('span', { class: 'pb-pill' }, 'D币 ', el('b', { text: fmt(gear.coins) })))
    const chestReady = gear.daily.battles >= gear.daily.need && !gear.daily.chest
    put(tabsEl, ...TABS.map(([id, name]) => el('button', { class: 'pb-tab' + (tab === id ? ' on' : ''), type: 'button', onclick: () => { tab = id; render() } }, name,
      id === 'points' && gear.free > 0 ? el('i', { text: gear.free }) : null, id === 'daily' && chestReady ? el('i', { text: '!' }) : null, id === 'fight' && duel?.incoming?.length ? el('i', { text: duel.incoming.length }) : null)))
  }
  const itemCard = (it, own, opts = {}) => el('button', { class: `pb-item r${it.rarity}${opts.on ? ' on' : ''}${own ? '' : ' missing'}`, type: 'button', onclick: opts.onclick },
    own?.enh ? el('span', { class: 'pb-enh', text: '+' + own.enh }) : null,
    el('img', { src: thumb(it.id), alt: '', loading: 'lazy' }),
    el('span', null, el('strong', { text: it.name }), el('small', null, el('span', { class: `pb-rar r${it.rarity}`, text: RAR[it.rarity] }), ' · ' + SLOT[it.slot]), el('small', { text: opts.sub ?? it.desc })))
  const statLine = (it, enh = 0) => Object.entries(it.stats).map(([k, v]) => `${STAT[k]} +${Math.round(v * 0.3 * (1 + 0.04 * enh) * 10) / 10}`).join('  ') + (it.passive ? '  ' + PASSIVE[it.passive.kind](it.passive.value) : '')

  async function render() {
    arena?.destroy(); arena = null
    body.classList.remove('arena')
    renderTop()
    if (!home?.adopted) { put(body, el('p', { class: 'pb-muted', text: '先在站宠屋领养大肥鱼，才能上擂台。' })); return }
    if (tab === 'fight') return renderFight()
    if (tab === 'gear') return renderGear()
    if (tab === 'points') return renderPoints()
    if (tab === 'shop') return renderShop()
    if (tab === 'daily') return renderDaily()
    if (tab === 'guide') return renderGuide()
  }

  // ---------- 擂台 ----------
  function renderFight() {
    const me = home.me
    const stat = (k, v) => el('div', { class: 'pb-stat' }, el('span', { text: k }), el('b', { text: String(v) }))
    const card = el('section', { class: 'pb-card' },
      el('div', { class: 'pb-me-head' }, el('img', { src: gear.gear.weapon ? thumb(gear.gear.weapon.id) : thumb('maid'), alt: '' }), el('div', null, el('strong', { text: me.name + ' 的大肥鱼' }), el('div', null, el('span', { class: 'pb-lv', text: 'Lv' + me.level })))),
      el('div', { class: 'pb-stats' }, stat('生命', me.hp), stat('力量', me.atk), stat('防御', me.def ?? 0), stat('敏捷', me.agi), stat('速度', me.spd), stat('战绩', `${home.record.win}胜${home.record.lose}负`)),
      el('div', { class: 'pb-skills' }, me.skills.map((s) => el('span', { class: 'pb-skill', title: `Lv${s.level}`, text: s.name }))),
      el('p', { class: 'pb-muted', text: '主动挑战：胜 +15、平 +8、负 +5 经验，还可能掉装备。被挑战不扣任何东西。' }))
    const search = el('input', { type: 'search', class: 'pb-search', placeholder: '搜索对手名字', 'aria-label': '搜索对手' })
    const list = el('div', { class: 'pb-list' })
    const load = async () => {
      put(list, el('p', { class: 'pb-muted', text: '寻找对手…' }))
      try {
        const { opponents } = await api('/pet/battle/opponents' + (search.value.trim() ? '?q=' + encodeURIComponent(search.value.trim()) : ''))
        put(list, ...(opponents.length ? opponents.map((o) => el('div', { class: 'pb-row' },
          el('div', { class: 'pb-row-main' }, el('strong', { text: o.name }), el('small', { text: (o.level ? 'Lv' + o.level : '还没上过擂台') + (o.fought ? ` · 今天已打 ${o.fought} 次` : '') })),
          el('span', { style: 'display:flex;gap:6px' }, el('button', { class: 'pb-btn ghost', type: 'button', title: '押注 D币 的实时约战，对方同意才开打', onclick: () => inviteDuel(o) }, '约战'),
            el('button', { class: 'pb-btn', type: 'button', disabled: !o.left || home.today.used >= home.today.limit, onclick: (e) => challenge(o, e.currentTarget) }, o.left ? '挑战' : '明天')))) : [el('p', { class: 'pb-muted', text: '没有找到有站宠的对手' })]))
      } catch (e) { put(list, el('p', { class: 'pb-muted', text: e.message || '对手列表读取失败' })) }
    }
    let timer = 0
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300) })
    const hist = el('div', { class: 'pb-list' }, home.history.length ? home.history.map((h) => {
      const mine = h.attacker.id === user.id, foe = mine ? h.defender : h.attacker
      const r = h.winner === -1 ? '平' : (h.winner === 0) === mine ? '胜' : '负'
      return el('button', { class: 'pb-hist pb-' + (r === '胜' ? 'win' : r === '负' ? 'lose' : 'draw'), type: 'button', onclick: () => replay(h.id) },
        el('b', { text: r }), el('span', { text: (mine ? '挑战 ' : '被 ') + foe.name + (mine ? '' : ' 挑战') }), el('small', { text: new Date(h.created_at * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }))
    }) : [el('p', { class: 'pb-muted', text: '还没有对战记录' })])
    const duelBox = el('div')
    drawDuels = () => {
      if (!duel) return put(duelBox)
      const row = (d, mine) => el('div', { class: 'pb-row' }, el('div', { class: 'pb-row-main' }, el('strong', { text: (mine ? '约战 ' + d.invitee.name : d.inviter.name + ' 约你') }), el('small', { text: `押注 ${fmt(d.stake)} D币 · ${Math.max(0, Math.ceil((d.expires_at - Date.now() / 1000) / 60))} 分钟后过期` })),
        mine ? el('button', { class: 'pb-btn ghost', type: 'button', onclick: async () => { await call(`/pet/duel/${d.id}/cancel`, { method: 'POST', body: {} }); say('已取消，押注已退回'); await refresh(); render() } }, '取消')
          : el('span', { style: 'display:flex;gap:6px' }, el('button', { class: 'pb-btn ghost', type: 'button', onclick: async () => { await call(`/pet/duel/${d.id}/decline`, { method: 'POST', body: {} }); await pollDuel() } }, '拒绝'),
            el('button', { class: 'pb-btn', type: 'button', onclick: async (e) => { if (!confirm(`接受约战？双方各押 ${fmt(d.stake)} D币，赢家拿走 ${fmt(Math.floor(d.stake * 2 * 0.95))}（站点抽 5%），平局各自退回。`)) return; e.currentTarget.disabled = true; try { const r = await call(`/pet/duel/${d.id}/accept`, { method: 'POST', body: {} }); await show(r); refresh().catch(() => {}) } catch { e.currentTarget.disabled = false } } }, '接受')))
      const open = duel.outgoing.filter((d) => d.status === 'open')
      put(duelBox, (duel.incoming.length || open.length) ? el('section', { class: 'pb-card pb-duels' }, el('h3', null, '约战', el('small', { text: `今日已押 ${fmt(duel.staked)} / ${fmt(duel.rules.dailyStake)}` })),
        duel.incoming.map((d) => row(d, false)), open.map((d) => row(d, true))) : null)
    }
    drawDuels()
    put(body, duelBox, el('div', { class: 'pb-grid' }, card, el('section', { class: 'pb-card' }, el('h3', { text: '挑战对手' }), search, list), el('section', { class: 'pb-card' }, el('h3', { text: '最近战报' }), hist)))
    load()
  }
  async function challenge(o, button) {
    button.disabled = true
    try {
      const r = await call('/pet/battle', { method: 'POST', body: { opponent_id: o.id, operation: uuid() } })
      if (r.progress) applyServerProgress(r.progress)
      await show(r)
      refresh().catch(() => {})
    } catch { button.disabled = false }
  }
  async function inviteDuel(o) {
    if (!duel?.eligible?.ok) return say(duel?.eligible?.reason || '暂时不能约战')
    const r = duel.rules
    const v = prompt(`向 ${o.name} 发起约战，押注多少 D币？（${r.minStake}–${fmt(r.maxStake)}）\n双方各押同样金额，对方同意才开打；赢家拿走两份押注扣 5% 抽成，平局各自退回；10 分钟没人接自动退回。`, '1000')
    if (v == null) return
    const stake = Math.floor(Number(v))
    try { await call('/pet/duel', { method: 'POST', body: { opponent_id: o.id, stake, operation: uuid() } }); say('约战已发出，押注已冻结，等对方接受'); await refresh(); render() } catch {}
  }
  async function replay(id) { try { await show(await call('/pet/battle/' + id)) } catch {} }
  async function show(r) {
    const { createArena } = await import('/pet-arena.js')
    arena?.destroy()
    body.classList.add('arena')
    arena = await createArena(body, r, user.id, () => render())
  }

  // ---------- 装备 ----------
  let gearFilter = 'weapon', picked = null
  function renderGear() {
    const owned = new Map(gear.items.map((x) => [x.id, x]))
    const slots = el('div', { class: 'pb-slots' }, Object.entries(SLOT).map(([slot, name]) => {
      const g = gear.gear[slot], it = g && gear.catalog.find((x) => x.id === g.id)
      return el('div', { class: 'pb-slot' + (it ? ' filled r' + it.rarity : '') }, it ? el('img', { src: thumb(it.id), alt: '' }) : el('div', { style: 'height:72px;display:grid;place-items:center;font-size:28px;opacity:.4', text: '＋' }), el('strong', { text: it ? it.name + (g.enh ? ' +' + g.enh : '') : '未装备' }), el('small', { text: name }))
    }))
    const filter = el('div', { class: 'pb-filter' }, Object.entries(SLOT).map(([slot, name]) => el('button', { class: gearFilter === slot ? 'on' : '', type: 'button', onclick: () => { gearFilter = slot; picked = null; renderGear() } }, name)))
    const list = gear.catalog.filter((x) => x.slot === gearFilter).sort((a, b) => (owned.has(b.id) - owned.has(a.id)) || a.rarity - b.rarity)
    const grid = el('div', { class: 'pb-items' }, list.map((it) => itemCard(it, owned.get(it.id), { on: picked === it.id, sub: owned.has(it.id) ? (gear.gear[it.slot]?.id === it.id ? '已装备' : '已拥有') : '未获得', onclick: () => { picked = it.id; renderGear() } })))
    const it = picked && gear.catalog.find((x) => x.id === picked)
    let detail = null
    if (it) {
      const own = owned.get(it.id), equipped = gear.gear[it.slot]?.id === it.id
      const cost = own && own.enh < 10 ? Math.round(gear.prices.enhanceBase[own.enh] * gear.prices.enhanceRarity[it.rarity]) : 0
      detail = el('section', { class: `pb-card r${it.rarity}`, style: 'margin-bottom:12px' }, el('div', { class: 'pb-detail' }, el('img', { src: thumb(it.id), alt: '' }), el('div', null,
        el('h3', null, el('span', null, it.name, own?.enh ? ` +${own.enh}` : ''), el('span', { class: `pb-rar r${it.rarity}`, text: RAR[it.rarity] + ' · ' + SLOT[it.slot] })),
        el('p', { class: 'pb-muted', text: statLine(it, own?.enh || 0) }), it.skill ? el('p', { class: 'pb-muted', text: `武器技「${it.skill.name}」：${it.desc}` }) : el('p', { class: 'pb-muted', text: it.desc }),
        el('div', { class: 'pb-actions' },
          own ? el('button', { class: 'pb-btn', type: 'button', onclick: async () => { gear = await call('/pet/battle/equip', { method: 'POST', body: { slot: it.slot, item: equipped ? null : it.id } }); home = await api('/pet/battle/home'); renderGear(); renderTop() } }, equipped ? '卸下' : '装备') : null,
          own && own.enh < 10 ? el('button', { class: 'pb-btn ghost', type: 'button', disabled: gear.coins < cost, onclick: async () => { gear = await call('/pet/battle/enhance?item=' + it.id, { method: 'POST', body: { operation: uuid() } }); say(`强化成功 ${it.name} +${(own.enh || 0) + 1}`); home = await api('/pet/battle/home'); renderGear(); renderTop() } }, `强化 +${own.enh + 1}（${fmt(cost)} D币）`) : null,
          !own ? el('span', { class: 'pb-muted', text: it.rarity === 4 ? '传说装备：对战掉落或每日宝箱获得' : '可在商店购买，或对战掉落' }) : null))))
    }
    put(body, slots, detail, filter, grid)
  }

  // ---------- 加点 ----------
  function renderPoints() {
    const cur = { ...gear.points }, base = { ...gear.points }
    let free = gear.free
    const rows = el('div', { class: 'pb-points' })
    const desc = { str: ['力量', '每点攻击 +0.4'], agi: ['敏捷', '每点敏捷 +0.4（闪避、暴击）'], spd: ['速度', '每点速度 +0.4（先手）'], vit: ['体质', '每点生命 +4'] }
    const freeEl = el('strong'), save = el('button', { class: 'pb-btn', type: 'button' }, '保存加点')
    const draw = () => {
      freeEl.textContent = `可用点数 ${free}`
      put(rows, ...Object.entries(desc).map(([k, [n, d]]) => el('div', { class: 'pb-point' }, el('div', null, el('strong', { text: n }), el('br'), el('small', { text: d })), el('div', { class: 'pb-meter' }),
        el('div', { class: 'pb-step' }, el('button', { type: 'button', disabled: cur[k] <= base[k], onclick: () => { cur[k]--; free++; draw() } }, '−'), el('b', { text: cur[k] }), el('button', { type: 'button', disabled: free <= 0, onclick: () => { cur[k]++; free--; draw() } }, '+')))))
      save.disabled = JSON.stringify(cur) === JSON.stringify(base)
    }
    save.addEventListener('click', async () => { gear = await call('/pet/battle/points', { method: 'POST', body: { points: cur } }); home = await api('/pet/battle/home'); say('加点已保存'); renderPoints(); renderTop() })
    const respec = el('button', { class: 'pb-btn ghost', type: 'button', disabled: gear.coins < gear.prices.respec, onclick: async () => { if (!confirm(`花 ${fmt(gear.prices.respec)} D币 洗点？所有已加的点会退回。`)) return; gear = await call('/pet/battle/respec', { method: 'POST', body: { operation: uuid() } }); home = await api('/pet/battle/home'); say('洗点完成'); renderPoints(); renderTop() } }, `洗点（${fmt(gear.prices.respec)} D币）`)
    draw()
    const bd = gear.breakdown, NAMES = { hp: '生命', atk: '力量（攻击）', def: '防御', agi: '敏捷', spd: '速度' }
    const table = el('table', { class: 'pb-table' }, el('thead', null, el('tr', null, ['属性', '基础', '加点', '装备', '合计'].map((h) => el('th', { text: h })))),
      el('tbody', null, Object.entries(NAMES).map(([k, n]) => el('tr', null, el('td', { text: n }), el('td', { text: bd[k].base }), el('td', { text: bd[k].points ? '+' + bd[k].points : '—' }), el('td', { text: bd[k].gear ? '+' + bd[k].gear : '—' }), el('td', null, el('b', { text: bd[k].total }))))))
    const pas = Object.entries(gear.passive || {}).map(([k, v]) => PASSIVE[k]?.(v)).filter(Boolean)
    put(body, el('section', { class: 'pb-card' }, el('h3', null, freeEl, el('small', { text: '每升 1 级得 3 点；已加的点要洗点才能减' })), rows, el('div', { style: 'display:flex;gap:8px;margin-top:14px' }, save, respec)),
      el('section', { class: 'pb-card', style: 'margin-top:12px' }, el('h3', null, '当前属性', el('small', { text: '基础随等级成长，另有每个账号固定的 ±10% 天赋浮动' })), table,
        pas.length ? el('p', { class: 'pb-muted', style: 'margin-top:8px', text: '装备被动：' + pas.join('，') }) : null,
        el('p', { class: 'pb-muted', style: 'margin-top:8px', text: '每级基础成长：生命 +5、力量 +0.7、敏捷 +0.5、速度 +0.5。完整规则见「说明」。' })))
  }

  // ---------- 商店 ----------
  function renderShop() {
    const owned = new Map(gear.items.map((x) => [x.id, x]))
    const p = gear.prices
    const grid = el('div', { class: 'pb-items' }, gear.catalog.filter((x) => x.rarity < 4).sort((a, b) => a.rarity - b.rarity).map((it) => {
      const price = p.shop[it.rarity], own = owned.has(it.id)
      return el('div', { class: 'pb-item r' + it.rarity, style: 'cursor:default' }, el('img', { src: thumb(it.id), alt: '' }), el('span', null, el('strong', { text: it.name }), el('small', { text: statLine(it) }),
        el('button', { class: 'pb-btn' + (own ? ' ghost' : ''), type: 'button', style: 'margin-top:6px;padding:5px 10px', disabled: own || gear.coins < price, onclick: async () => { gear = await call('/pet/battle/buy?item=' + it.id, { method: 'POST', body: { operation: uuid() } }); say('购买成功：' + it.name); renderShop(); renderTop() } }, own ? '已拥有' : fmt(price) + ' D币')))
    }))
    const left = p.trainDaily - gear.daily.trained
    const trainCost = (done, xp) => { let c = 0; for (let i = done; i < done + xp; i++) c += (p.trainTiers.find(([upTo]) => i < upTo) || p.trainTiers.at(-1))[1]; return c }
    const tierText = p.trainTiers.map(([upTo, price], i) => `${i ? p.trainTiers[i - 1][0] : 0}–${upTo} 点每点 ${price}`).join('，')
    const train = el('section', { class: 'pb-card', style: 'margin-bottom:12px' }, el('h3', null, '突破训练', el('small', { text: `今日已训练 ${gear.daily.trained} / ${p.trainDaily}` })),
      el('p', { class: 'pb-muted', style: 'margin-bottom:8px', text: `自然成长每天最多 300 经验；用 D币 突破训练可以再多拿，每天最多 ${p.trainDaily}，阶梯计价：${tierText}。` }),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [10, 50, 100, 200, 300].filter((x) => x <= left).map((xp) => { const cost = trainCost(gear.daily.trained, xp); return el('button', { class: 'pb-btn ghost', type: 'button', disabled: gear.coins < cost, onclick: async () => { gear = await call('/pet/battle/train?xp=' + xp, { method: 'POST', body: { operation: uuid() } }); home = await api('/pet/battle/home'); if (home.me?.progress) applyServerProgress(home.me.progress); say(`突破训练完成 经验 +${xp}`); renderShop(); renderTop() } }, `+${xp} 经验（${fmt(cost)}）`) }), left <= 0 ? el('span', { class: 'pb-muted', text: '今天的突破训练已满' }) : null))
    put(body, train, el('p', { class: 'pb-muted', style: 'margin-bottom:8px', text: '传说装备不出售，只能对战掉落或每日宝箱获得。重复获得的装备会自动强化 +1。' }), grid)
  }

  // ---------- 每日 ----------
  function renderDaily() {
    const d = gear.daily, ready = d.battles >= d.need && !d.chest
    const out = el('div')
    const box = el('section', { class: 'pb-card pb-chest' }, el('div', { class: 'pb-chest-box' + (ready ? ' ready' : ''), text: d.chest ? '📭' : '🎁' }),
      el('strong', { text: d.chest ? '今天的宝箱已领取' : `今日挑战 ${Math.min(d.battles, d.need)} / ${d.need}` }),
      el('p', { class: 'pb-muted', text: '每天主动挑战满 3 场，开一次宝箱，必出一件装备（传说概率 5%）。' }),
      el('button', { class: 'pb-btn', type: 'button', disabled: !ready, onclick: async () => {
        const r = await call('/pet/battle/chest', { method: 'POST', body: {} })
        gear = r; const it = gear.catalog.find((x) => x.id === r.got.item)
        put(out, el('div', { class: 'pb-reward-pop' }, el('img', { src: thumb(it.id), alt: '' }), el('strong', { text: `${RAR[it.rarity]}「${it.name}」` }), el('small', { class: 'pb-muted', text: r.got.upgraded ? '已拥有，自动强化 +1' : '新装备！去装备页穿上' })))
        renderTop(); box.querySelector('button').disabled = true; box.querySelector('.pb-chest-box').className = 'pb-chest-box'
      } }, ready ? '开宝箱' : d.chest ? '明天再来' : '先去挑战'), out)
    const rewards = el('section', { class: 'pb-card', style: 'margin-top:12px' }, el('h3', { text: '升级奖励' }), el('div', { class: 'pb-items' }, Object.entries(gear.rewards).map(([lv, id]) => {
      const it = gear.catalog.find((x) => x.id === id)
      return itemCard(it, gear.items.find((x) => x.id === id), { sub: (gear.level >= Number(lv) ? '已领取 · ' : '') + `Lv${lv} 奖励` })
    })))
    put(body, box, rewards)
  }

  // ---------- 说明 ----------
  function renderGuide() {
    const p = gear.prices, R = duel?.rules
    const sec = (title, ...items) => el('section', { class: 'pb-card pb-guide' }, el('h3', { text: title }), el('ul', null, items.map((t) => el('li', { text: t }))))
    const skills = el('section', { class: 'pb-card pb-guide' }, el('h3', { text: '招式一览（按等级解锁）' }), el('table', { class: 'pb-table' }, el('thead', null, el('tr', null, ['等级', '招式', '效果'].map((h) => el('th', { text: h })))),
      el('tbody', null, (home.allSkills || []).map((k) => el('tr', { class: home.me.level >= k.level ? '' : 'pb-dim' }, el('td', { text: 'Lv' + k.level }), el('td', { text: k.name }), el('td', { text: k.desc }))))))
    put(body, el('div', { class: 'pb-guide-grid' },
      sec('怎么玩', '在「擂台」挑战其他有站宠的站友：对方不用在线，系统按双方属性、招式、装备自动打完，双方都能看回放。', `每天主动挑战 ${home.today.limit} 次，同一个人每天最多 3 次，两次挑战间隔 8 秒。`, '主动挑战：胜 +15、平 +8、负 +5 经验，并有概率掉落装备（胜 25%、平 15%、负 10%）。被挑战不扣任何东西。', '每天主动挑战满 3 场可在「每日」开宝箱，必出一件装备。'),
      sec('属性', '生命：血量，归零即败。每级 +5，每点体质 +4。', '力量：决定伤害。每级 +0.7，每点力量 +0.4。', '防御：按「100 ÷ (100 + 防御)」减少受到的伤害，主要来自服装。', '敏捷：提高闪避和暴击。每级 +0.5，每点敏捷 +0.4。闪避率 = 4% + 双方敏捷差 × 0.6%（2%–40%）；暴击率 = 10% + 敏捷 × 0.3%（最高 35%），暴击 1.7 倍。', '速度：决定每回合谁先出手。每级 +0.5，每点速度 +0.4。', '天赋：每个账号固定有 ±10% 的属性浮动，同等级也会有差异。', '属性点：每升 1 级得 3 点，可在「加点」分配；减点需要洗点。'),
      sec('等级与经验', '升到下一级需要「当前等级 × 100」经验。', '自然成长（摸摸、喂食、玩耍、陪伴、对战）每天最多 300 经验。', `突破训练：用 D币 每天再买最多 ${p.trainDaily} 经验，阶梯计价（${p.trainTiers.map(([u, c], i) => `${i ? p.trainTiers[i - 1][0] : 0}–${u} 每点 ${c}`).join('，')}）。`, '等级和经验由服务器记账，改本地数据无效。'),
      sec('战斗规则', '每回合双方按速度先后各行动一次，最多 20 回合；打满还没分胜负，按剩余生命比例判胜。', '每次行动先判定武器技，再从强到弱判定自身招式，都没触发就普通攻击。', '伤害 = 力量 × 招式倍率 × (0.6–1.4 随机) × 暴击 1.7，再按防御减免；护盾先吸收伤害。', '状态：眩晕（跳过一回合）、灼烧（每回合掉血，3 回合）、虚弱（攻击下降）、灵巧（闪避提升）、蓄力（下一击必暴）。'),
      sec('装备', '武器带武器技（概率触发）；服装加生命和防御；伙伴提供被动：吸血、反击、反伤、复活、首回合先手、闪避。', '稀有度：普通 / 稀有 / 史诗 / 传说。面板数值实际按 30% 生效，每强化一级再 +4%（最高 +10）。', '获得：升级奖励、对战掉落、每日宝箱、商店（传说不卖）。重复获得自动强化 +1。'),
      sec('D币 用途', `强化：+0→+1 普通 ${fmt(p.enhanceBase[0])} 起，稀有 ×1.6、史诗 ×2.6、传说 ×4，越往后越贵。`, `商店：普通 ${fmt(p.shop[1])}、稀有 ${fmt(p.shop[2])}、史诗 ${fmt(p.shop[3])}。`, `洗点：${fmt(p.respec)}。`, '所有扣费都由服务器完成，每笔都有 D币 流水；网络重试不会重复扣。'),
      R ? sec('实时约战（押注 D币）', `在对手旁点「约战」并设置押注（${R.minStake}–${fmt(R.maxStake)}），押注当场冻结；对方点「接受」也冻结同样金额，立即开打。`, `赢家拿走两份押注，站点抽 ${R.rake * 100}%；平局各自退回；${R.expire / 60} 分钟没人接、或发起方取消、对方拒绝，全额退回。`, `双方需 Lv${R.minLevel} 以上、注册满 ${R.minAccountDays} 天、等级差不超过 ${R.maxLevelGap} 级；同一对每天最多 ${R.pairDaily} 场；每人每天押注合计不超过 ${fmt(R.dailyStake)}。`, '约战不占每日挑战次数，也不给经验和掉落。异常对局会被标记人工复核。') : null),
      skills)
  }

  put(body, el('p', { class: 'pb-muted', text: '正在进入擂台…' }))
  try { await refresh(); render() } catch (e) { put(body, el('p', { class: 'pb-muted', text: e.message || '擂台暂时进不去' })) }
  return dialog
}
