// 小岛的面板：集市（卖货 / 行情 / 杂货）、背包、说明、菜单。都是从屏幕底部滑出的木牌风格面板。
import * as R from '/pet-world-rules.js'
import * as A from '/pet-isle-scenery.js'

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
const short = (n) => (n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(n >= 1e6 ? 0 : 1) + '万' : fmt(n))
const coin = (n, big) => el('span', { class: 'isle-price' + (big ? ' big' : '') }, el('img', { src: A.itemIcon('coin', 2), alt: '' }), big ? fmt(n) : short(n))
const dayAdd = (day, k) => new Date(Date.parse(day) + k * 86400000).toISOString().slice(0, 10)
const KIND = (id) => R.CROPS.some((c) => c.id === id) ? '作物' : R.ANIMALS.some((a) => (a.products || [{id:a.product}]).some(p=>p.id===id)) ? '畜产' : R.FISH.some((f) => f.id === id) ? '鱼' : R.ORES.some((o) => o.id === id) ? '矿石' : '杂货'
const QN = ['普通', '银星', '金星']

export function sheet(host, title, body, { wide = false, onClose } = {}) {
  host.querySelector('.isle-sheet-wrap')?.remove()
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 220); onClose?.() }
  const wrap = el('div', { class: 'isle-sheet-wrap', onclick: (e) => { if (e.target === wrap) close() } },
    el('section', { class: 'isle-sheet' + (wide ? ' wide' : ''), role: 'dialog', 'aria-label': title },
      el('header', {}, el('h2', { text: title }), el('button', { class: 'isle-x', type: 'button', 'aria-label': '关闭', onclick: close }, '×')),
      el('div', { class: 'isle-sheet-body' }, body)))
  host.append(wrap)
  requestAnimationFrame(() => wrap.classList.add('open'))
  return { close, body: wrap.querySelector('.isle-sheet-body') }
}
const tabs = (items, onPick, active) => el('nav', { class: 'isle-tabs' }, items.map(([k, label]) => el('button', { class: k === active ? 'on' : '', type: 'button', onclick: () => onPick(k) }, label)))

// 14 天走势（前 13 天用确定性算法本地算，今天用服务端带供需的价格）
function series(id, day, today) { return [...Array.from({ length: 13 }, (_, k) => R.priceOf(id, dayAdd(day, k - 13))), today || R.priceOf(id, day)] }
function spark(vals, w = 84, h = 26) {
  const c = el('canvas', { width: w * 2, height: h * 2, class: 'isle-spark', style: `width:${w}px;height:${h}px` }), g = c.getContext('2d')
  const lo = Math.min(...vals), hi = Math.max(...vals), y = (v) => 2 * (h - 3 - ((v - lo) / Math.max(1, hi - lo)) * (h - 6))
  g.lineWidth = 2; g.strokeStyle = vals.at(-1) >= vals.at(-2) ? '#e0475e' : '#3aa86b'; g.beginPath()
  vals.forEach((v, i) => { const x = (i / (vals.length - 1)) * (w * 2 - 4) + 2; i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)) }); g.stroke()
  g.fillStyle = g.strokeStyle; g.fillRect(w * 2 - 6, y(vals.at(-1)) - 2, 4, 4)
  return c
}
const change = (vals) => { const a = vals.at(-2), b = vals.at(-1), p = ((b - a) / a) * 100; return el('span', { class: 'isle-chg ' + (p >= 0 ? 'up' : 'down') }, (p >= 0 ? '▲' : '▼') + Math.abs(p).toFixed(0) + '%') }

async function settle(isle) { await isle.flush(); for (let k = 0; k < 40 && isle.busy?.(); k++) await new Promise((r) => setTimeout(r, 150)) }

export async function openMarket(host, isle, tab = 'sell') {
  const sh = sheet(host, 'Claude 的杂货铺', el('div', { class: 'isle-loading', text: '摊主在清点货物…' }), { wide: true, onClose: () => isle.refresh() })
  await settle(isle)
  const draw = (k) => {
    tab = k
    const s = isle.state, prices = isle.prices, day = isle.day
    const earnLeft = R.WORLD.dailyEarn - s.earn.amt
    const head = el('div', { class: 'isle-market-head' }, el('img', { class: 'isle-merchant-portrait', src: A.merchantUrl, alt: 'Claude 娘商店店主' }), el('div', {}, el('b', { text: ['今天的价格，我替你记好啦。', '收成不错，让我清点一下。', '种子、饲料和鱼饵，都备齐了。'][['trend', 'sell', 'shop'].indexOf(k)] || '' }), el('small', { text: `${R.SEASONS[isle.season]}季 · ${R.WEATHERS[isle.weather]} · 今天还能卖 ${short(Math.max(0, earnLeft))} D币` })), coin(isle.coins, true))
    const body = []
    if (k === 'sell') {
      const rows = Object.entries(s.inv).filter(([id]) => prices[id]).flatMap(([id, qs]) => qs.map((n, q) => (n ? { id, q, n, price: Math.round(prices[id] * R.QUALITY[q]) } : null)).filter(Boolean)).sort((a, b) => b.price * b.n - a.price * a.n)
      if (!rows.length) body.push(el('p', { class: 'isle-empty', text: '背包里没有能卖的东西。去种菜、钓鱼、挖矿吧！' }))
      else {
        const total = rows.reduce((t, r) => t + r.price * r.n, 0)
        body.push(el('div', { class: 'isle-sellall' }, el('span', {}, `全部卖出可得 `, coin(total, true)), el('button', { class: 'isle-btn', type: 'button', disabled: earnLeft <= 0, onclick: () => { let got = 0; for (const r of rows) { const o = isle.push({ a: 'sell', id: r.id, q: r.q, n: r.n }); if (o) got += o.earn || 0 } if (got) isle.coinBurst(got); draw('sell') } }, '一键全卖')))
        body.push(el('div', { class: 'isle-grid' }, rows.map((r) => {
          const vals = series(r.id, day, prices[r.id])
          return el('button', { class: 'isle-cell q' + r.q, type: 'button', onclick: () => sellOne(r) },
            el('img', { src: A.itemIcon(r.id, 3), alt: '' }), el('b', { text: R.ITEM_NAME[r.id] }), el('small', {}, r.q ? '★'.repeat(r.q) + ' ' : '', '×' + r.n), el('span', { class: 'isle-cell-p' }, coin(r.price), change(vals)))
        })))
      }
      const sellOne = (r) => {
        const pick = el('div', { class: 'isle-sellpick' },
          el('div', { class: 'isle-sellpick-h' }, el('img', { src: A.itemIcon(r.id, 4), alt: '' }), el('div', {}, el('b', { text: `${R.ITEM_NAME[r.id]}${r.q ? ' ' + QN[r.q] : ''}` }), el('small', { text: `有 ${r.n} 个 · 单价 ${fmt(r.price)}` })), spark(series(r.id, day, prices[r.id]), 110, 34)),
          el('div', { class: 'isle-sellpick-b' }, [1, Math.ceil(r.n / 2), r.n].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((n) => el('button', { class: 'isle-btn', type: 'button', onclick: () => { const o = isle.push({ a: 'sell', id: r.id, q: r.q, n }); if (o?.earn) isle.coinBurst(o.earn); draw('sell') } }, `卖 ${n === r.n ? '全部 ' : ''}${n} 个 · `, coin(r.price * n)))))
        sh.body.querySelector('.isle-sellpick')?.remove(); sh.body.prepend(pick); sh.body.scrollTop = 0
      }
    } else if (k === 'trend') {
      const groups = ['作物', '畜产', '鱼', '矿石']
      for (const gname of groups) {
        const ids = Object.keys(R.BASE_PRICE).filter((id) => KIND(id) === gname)
        body.push(el('h3', { text: gname }), el('div', { class: 'isle-trend' }, ids.map((id) => {
          const vals = series(id, day, prices[id]), crop = R.CROPS.find((c) => c.id === id)
          const inSeason = crop ? crop.seasons.includes(isle.season) : true
          const rel = vals.at(-1) / R.BASE_PRICE[id]
          return el('div', { class: 'isle-trend-row' }, el('img', { src: A.itemIcon(id, 2), alt: '' }), el('b', { text: R.ITEM_NAME[id] }),
            crop && !inSeason ? el('em', { class: 'off', text: '反季' }) : rel > 1.35 ? el('em', { class: 'hot', text: '抢手' }) : rel < 0.72 ? el('em', { class: 'cold', text: '滞销' }) : el('em'),
            spark(vals), el('span', { class: 'isle-trend-p' }, fmt(vals.at(-1))), change(vals))
        })))
      }
      body.push(el('p', { class: 'isle-note', text: '价格每天北京时间 0 点变动：基础价 × 季节（反季贵、当季便宜）× 随机行情（有惯性，会连涨连跌，偶尔暴涨暴跌）× 供需（前一天全站卖得越多，今天越便宜）。' }))
    } else {
      const s2 = isle.state
      const item = (id, name, desc, price, act, left) => el('div', { class: 'isle-shoprow' }, el('img', { src: A.itemIcon(id, 3), alt: '' }), el('div', {}, el('b', { text: name }), el('small', { text: desc })), el('div', { class: 'isle-shoprow-b' }, act.map(([label, a, cost]) => el('button', { class: 'isle-btn', type: 'button', disabled: isle.coins < cost || left === 0, onclick: () => { if (isle.push(a)) draw('shop') } }, label, ' · ', coin(cost)))))
      body.push(
        item('feed', `饲料（有 ${s2.inv.feed?.[0] || 0}）`, '动物吃一顿管 24 小时，饿着不产出', R.SHOP.feed.price, [['×10', { a: 'buy', id: 'feed', n: 10 }, R.SHOP.feed.price * 10], ['×30', { a: 'buy', id: 'feed', n: 30 }, R.SHOP.feed.price * 30]]),
        item('bait', `鱼饵（有 ${s2.inv.bait?.[0] || 0}）`, '更少脱钩，贵鱼概率翻倍', R.SHOP.bait.price, [['×10', { a: 'buy', id: 'bait', n: 10 }, R.SHOP.bait.price * 10], ['×30', { a: 'buy', id: 'bait', n: 30 }, R.SHOP.bait.price * 30]]),
        item('coffee', `冰美式（今天还能喝 ${R.WORLD.daily.coffee - (s2.cnt.coffee || 0)} 杯）`, `立刻 +${R.WORLD.coffee.energy} 体力，可以超过上限`, R.WORLD.coffee.price, [['喝一杯', { a: 'coffee' }, R.WORLD.coffee.price]], R.WORLD.daily.coffee - (s2.cnt.coffee || 0)),
      )
    }
    sh.body.replaceChildren(tabs([['sell', '卖货'], ['trend', '行情'], ['shop', '杂货']], draw, k), head, ...body)
    const credit = el('p', { class: 'isle-merchant-credit' }, 'Claude 娘设计：ZipZipPipe · ', el('a', { href: 'https://github.com/shuaizenge/ai-girls/tree/main/characters/claude', target: '_blank', rel: 'noopener' }, '素材出处')); sh.body.append(credit)
  }
  draw(tab)
}

export async function openBag(host, isle, onMarket) {
  const sh = sheet(host, '背包', el('div', { class: 'isle-loading', text: '整理中…' }))
  await settle(isle)
  const s = isle.state
  const book = () => {
    const seen = new Set(s.seen || []), groups = [['作物', R.CROPS.map((c) => c.id)], ['畜产', R.ANIMALS.flatMap((a) => (a.products || [{id:a.product}]).map(p=>p.id))], ['鱼', R.FISH.map((f) => f.id)], ['矿石', R.ORES.map((o) => o.id)]]
    const all = groups.flatMap((g) => g[1]), got = all.filter((id) => seen.has(id)).length
    return [el('div', { class: 'isle-bag-head' }, el('b', { text: `图鉴 ${got}/${all.length}` }), el('small', { text: got === all.length ? '全部集齐！' : '第一次得到会点亮' })),
      ...groups.map(([name, ids]) => [el('h3', { text: name }), el('div', { class: 'isle-book' }, ids.map((id) => {
        const f = R.FISH.find((x) => x.id === id), o = R.ORES.find((x) => x.id === id), c = R.CROPS.find((x) => x.id === id)
        const tip = f ? `${R.SEASONS.filter((_, i) => f.seasons.includes(i)).join('')}季 · ${f.hours[0] === 0 && f.hours[1] === 24 ? '全天' : f.hours[0] + '–' + (f.hours[1] % 24) + '点'} · 鱼竿 Lv${f.rod}` : o ? `第 ${o.floor} 层以下` : c ? `${R.SEASONS.filter((_, i) => c.seasons.includes(i)).join('')}季` : ''
        return el('div', { class: 'isle-book-cell' + (seen.has(id) ? '' : ' locked'), title: tip }, el('img', { src: A.itemIcon(id, 3), alt: '' }), el('small', { text: seen.has(id) ? R.ITEM_NAME[id] : '？？？' }), el('i', { text: tip }))
      }))])]
  }
  const rows = Object.entries(s.inv).flatMap(([id, qs]) => qs.map((n, q) => (n ? { id, q, n } : null)).filter(Boolean))
  const value = rows.reduce((t, r) => t + (isle.prices[r.id] || 0) * R.QUALITY[r.q] * r.n, 0)
  const bagTabs=[['items','物品'],['fresh','保鲜'],['book','图鉴']]
  let visibleBatches=60
  const freshness=()=>R.freshnessSummary(isle.persistedState||isle.state,isle.now())
  const timeLeft=n=>n>=86400?(n/86400).toFixed(1)+' 天':n>=3600?Math.ceil(n/3600)+' 小时':Math.max(1,Math.ceil(n/60))+' 分钟'
  const drawFresh=()=>{
    const f=freshness()
    sh.body.replaceChildren(tabs(bagTabs,drawTab,'fresh'),el('p',{class:'isle-note',text:'优先使用最早到期的批次；长夜暂停保鲜消耗，到期时间由服务端记录。'}))
    if(f.pendingMigration)sh.body.append(el('p',{class:'valley-social-notice',text:'旧库存将在首次有效保存时建立保鲜批次，并获得至少三个现实日缓冲，不会一进来就过期。'}))
    const list=el('div',{class:'valley-fresh-list'})
    for(const b of f.batches.slice(0,visibleBatches))list.append(el('div',{class:'valley-fresh-row'},el('img',{src:A.itemIcon(b.id,3),alt:''}),el('div',{},el('b',{text:(R.ITEM_NAME[b.id]||b.id)+' ×'+b.n}),el('small',{text:QN[b.q]+' · '+(b.left>0?'剩余 '+timeLeft(b.left):'已到期，等待结算')})),el('time',{text:new Date(b.expires*1000).toLocaleString('zh-CN')})))
    sh.body.append(list)
    if(!f.batches.length)sh.body.append(el('p',{class:'isle-empty',text:f.pendingMigration?'旧库存尚未建立保鲜批次。':'当前没有需要保鲜的库存；矿石、饲料和鱼饵可长期保存。'}))
    if(f.batches.length>visibleBatches)sh.body.append(el('button',{class:'isle-btn',type:'button',onclick:()=>{visibleBatches+=60;drawFresh()}},'查看更多批次'))
    const expired=Object.entries(f.expired.items||{}).filter(([,n])=>n>0)
    if(expired.length)sh.body.append(el('h3',{text:'过期清理记录'}),el('p',{class:'isle-note',text:expired.map(([id,n])=>(R.ITEM_NAME[id]||id)+' ×'+n).join('、')}))
  }
  const drawTab = (k) => k === 'fresh' ? drawFresh() : k === 'book' ? sh.body.replaceChildren(tabs(bagTabs, drawTab, 'book'), ...book().flat()) : drawItems()
  const drawItems = () => sh.body.replaceChildren(tabs(bagTabs, drawTab, 'items'),
    el('div', { class: 'isle-bag-head' }, el('span', {}, '按今天价格估值 ', coin(value, true)), el('button', { class: 'isle-btn', type: 'button', onclick: () => { sh.close(); onMarket() } }, '去集市卖')),
    rows.length ? el('div', { class: 'isle-grid' }, rows.map((r) => el('div', { class: 'isle-cell q' + r.q }, el('img', { src: A.itemIcon(r.id, 3), alt: '' }), el('b', { text: R.ITEM_NAME[r.id] || r.id }), el('small', {}, r.q ? '★'.repeat(r.q) + ' ' : '', '×' + r.n), isle.prices[r.id] ? el('span', { class: 'isle-cell-p' }, coin(Math.round(isle.prices[r.id] * R.QUALITY[r.q]))) : el('span', { class: 'isle-cell-p muted', text: KIND(r.id) })))) : el('p', { class: 'isle-empty', text: '空空的。' }),
    el('div', { class: 'isle-stats' },
      el('div', {}, el('small', {text:'建设额度（不可提现）'}), el('b', {text:fmt(s.constructionCredit||0)})),
      el('div', {}, el('small', { text: '工具' }), el('b', { text: `鱼竿 Lv${s.tools.rod} · 镐子 Lv${s.tools.pick} · 洒水器 Lv${s.tools.spr} · 小屋 Lv${s.tools.house}` })),
      el('div', {}, el('small', { text: '今天' }), el('b', { text: `钓鱼 ${s.cnt.fish || 0}/${R.WORLD.daily.fish} · 挖矿 ${s.cnt.mine || 0}/${R.WORLD.daily.mine} · 卖出 ${short(s.earn.amt)}/${short(R.WORLD.dailyEarn)}` })),
      el('div', {}, el('small', { text: '规模' }), el('b', { text: `地块 ${s.plotN}/${R.WORLD.plotsMax} · 畜栏 ${s.barnN}/${R.WORLD.barnMax} · 蟹笼 ${s.traps.length}/${R.WORLD.trapMax} · 矿洞最深 ${s.mine.max} 层` }))),
  )
  drawItems()
}

export function openGuide(host) {
  const tbl = (head, rows) => el('table', { class: 'isle-tbl' }, el('thead', {}, el('tr', {}, head.map((h) => el('th', { text: h })))), el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c) => el('td', {}, c))))))
  const icon = (id) => el('img', { src: A.itemIcon(id, 2), alt: '', class: 'isle-ti' })
  const se = (arr) => arr.map((i) => R.SEASONS[i]).join('')
  const d = (m) => (m >= 60 ? (m / 60) + '小时' : m + '分')
  sheet(host, '小岛说明', el('div', { class: 'isle-guide' },
    el('h3', { text: '怎么玩' }),
    el('ul', {},
      el('li', {}, el('b', { text: '农田：' }), '下面快捷栏选种子，点空地就种（自动扣种子钱）。点有水滴标记的地浇水，每个生长阶段浇一次，剩余时间缩短 25%，收获品质更高。熟了会闪光，点一下收获。手指按住一块地划过去，可以连着种 / 浇 / 收一整排。'),
      el('li', {}, el('b', { text: '季节：' }), '北京时间每周一换季（春→夏→秋→冬）。反季作物种不了，已经种下的到了新季节会枯萎，只能清掉——换季前记得收完。草莓、番茄、玉米、葡萄收完会留在地里再长，能收好几茬。'),
      el('li', {}, el('b', { text: '牧场：' }), '动物需累计喂饱的有效时间才成熟，饿了暂停成长和生产。成熟后每批2件，定期产副产物；达到终身产次后退休，仍可领取窝中产物或卖出。窝满不继续累积。点击动物查看剩余产次和实际回售价。'),
      el('li', {}, el('b', { text: '海边：' }), '点码头开始钓鱼，浮漂上冒出「!」时马上点屏幕收竿（太早太晚都不扣体力）。鱼的种类看季节、时段和鱼竿等级。码头两边能放蟹笼，自动抓小鱼。'),
      el('li', {}, el('b', { text: '矿洞：' }), '点矿洞进去，敲碎石头得到矿石宝石。越深越值钱，可能出现通往下一层的梯子。镐子等级决定最深能到哪层。'),
      el('li', {}, el('b', { text: '集市：' }), '点Claude 娘店主卖东西。价格随行情变化，但食材有保鲜期，先看背包「保鲜」再决定何时出售；过期食品不能卖出或食用。'),
      el('li', {}, el('b', { text: '新人礼：' }), `第一次进🌟🐟谷可以领 ${fmt(R.WELCOME_GIFT)} D币（每个账号一次；没领的话在小屋旁的信箱里领）。`),
      el('li', {}, el('b', { text: '挂机管家：' }), `菜单或小屋里雇个管家（${fmt(R.AUTO.hire)} D币，之后每轮工钱 ${fmt(R.AUTO.wage)}），配好策略后每 ${R.AUTO.every / 3600} 小时替你巡视一次：收菜补种、收蛋喂食、收蟹笼、用剩余体力钓鱼挖矿、按价格卖货，离线也算。手艺一般（只有普通品质、多耗体力、抽成 ${Math.round(R.AUTO.fee * 100)}%），收益约为认真玩的一半。`),
      el('li', {}, el('b', { text: '每日目标：' }), `广场公告栏每天给出 3 个小目标（全站一样），完成一个领 ${fmt(R.GOAL_REWARD)} D币，三个都完成再领 ${fmt(R.GOAL_BONUS)}。`),
      el('li', {}, el('b', { text: '成长：' }), '收获、收蛋、钓鱼、挖矿都会给大肥鱼加经验（和养成共用每天 300 点的自然成长上限），等级越高擂台属性越强。'),
      el('li', {}, el('b', { text: '升级：' }), '小屋（体力上限 +20）、铁匠铺（鱼竿 / 镐子 / 洒水器）、开垦地块、扩建畜栏、蟹笼——这些是主要的 D币 花销，也是收益翻倍的关键。'),
    ),
    el('h3', { text: '体力与上限' }),
    el('p', { text: `体力上限 ${R.WORLD.energyBase}（小屋每级 +${R.WORLD.energyPerHouse}），每 ${R.WORLD.regen / 60} 分钟回 1 点，满了就不再回。每天还能吃「免费便当」${R.WORLD.daily.rest} 次，体力直接回满（状态栏 🍱 或小屋里）。种地 ${R.WORLD.cost.plant}、浇水 ${R.WORLD.cost.water}、收获 ${R.WORLD.cost.harvest}、喂食 ${R.WORLD.cost.feed}、钓鱼 ${R.WORLD.cost.fish}、挖矿 ${R.WORLD.cost.mine} 点。吃自己种的菜能回体力，集市的冰美式每天最多 ${R.WORLD.daily.coffee} 杯。每天最多钓 ${R.WORLD.daily.fish} 竿、挖 ${R.WORLD.daily.mine} 下，卖出所得每天最多 ${short(R.WORLD.dailyEarn)} D币（卖不掉的留到明天）。` }),
    el('p', {class:'isle-note',text:'经营收益取决于成熟周期、喂养、收取频率、库存保鲜和当天售价。动物退休后不能继续生产；先看真实回售价再决定更换。建设额度购买的动物只按现金出资比例返还D币，不能立即套现。'}),
    el('h3', {text:'谷内时间与长夜'}),
    el('p', {text:'现实一天过三个谷日；北京时间06–12、12–18、18–次日06为三段。00–06长夜暂停保鲜、饲料、动物成长和生产的有效时长。便当、目标、钓鱼和社交额度仍按现实北京时间日计算。'}),
    el('h3', {text:'串门和守护兽'}),
    el('p', {text:'全体访客共用当前成熟产物10%的保守价值预算，主人至少保留90%；不足一整件时不能偷。每人每天20次，每目标每天2次。守护兽22–06巡逻，被抓最多赔200D币，以余额为限，每天罚款最多1000。首次操作前会再次展示规则。'}),
    el('h3', { text: '作物' }),
    tbl(['', '作物', '季节', '种子', '成熟', '再收', '基础价'], R.CROPS.map((c) => [icon(c.id), c.name, se(c.seasons), fmt(c.seed), d(c.grow), c.regrow ? `${d(c.regrow)}×${c.times - 1}` : '—', fmt(c.price)])),
    el('h3', { text: '动物' }),
    tbl(['', '动物', '买价', '成熟（有效小时）', '每餐饲料', '终生产次', '产物'], R.ANIMALS.map((a) => [icon(a.product), a.name, short(a.price), a.mature, a.feed, a.lifetime, a.products.map(p=>p.name).join(' / ')])),
    el('h3', { text: '鱼' }),
    tbl(['', '鱼', '季节', '时段', '鱼竿', '基础价'], R.FISH.map((f) => [icon(f.id), f.name, se(f.seasons), f.hours[0] === 0 && f.hours[1] === 24 ? '全天' : `${f.hours[0]}–${f.hours[1] % 24} 点`, 'Lv' + f.rod, fmt(f.price)])),
    el('h3', { text: '矿石' }),
    tbl(['', '矿石', '最浅层', '基础价'], R.ORES.map((o) => [icon(o.id), o.name, o.floor, fmt(o.price)])),
    el('h3', { text: '天气' }),
    el('p', { text: '晴：普通。雨：所有作物自动浇水、更好钓、贵鱼更多。风：蟹笼收获翻倍。雪（只在冬天）：矿洞宝石更多。' }),
  ), { wide: true })
}

// 挂机管家：配置策略。管家每 4 小时巡视一次（不在线也算），回来时自动补算并给报告。
export function openAuto(host, isle, toast) {
  const s = isle.state, cur = { ...R.AUTO_DEFAULT, ...(s.auto || {}) }, hired = !!s.auto?.hired
  const season = isle.season, crops = R.CROPS.filter((c) => c.seasons.includes(season)), best = R.bestCrop(season)
  const on = el('input', { type: 'checkbox', checked: cur.on })
  const crop = el('select', {}, el('option', { value: 'best', text: `当季最赚（现在是${best?.name || '—'}）` }), crops.map((c) => el('option', { value: c.id, text: `${c.name}（种子 ${fmt(c.seed)}）` })), el('option', { value: 'none', text: '不种，只收' }))
  crop.value = cur.crop === 'best' || cur.crop === 'none' || crops.some((c) => c.id === cur.crop) ? cur.crop : 'best'
  const water = el('input', { type: 'checkbox', checked: cur.water }), feed = el('input', { type: 'checkbox', checked: cur.feed }), sell = el('input', { type: 'checkbox', checked: cur.sell })
  const fishPct = el('input', { type: 'range', min: 0, max: 100, step: 10, value: cur.fishPct }), fishLabel = el('small')
  const minPct = el('input', { type: 'range', min: 0, max: 150, step: 10, value: cur.minPct }), minLabel = el('small')
  const keep = el('input', { type: 'number', min: 0, max: 300, step: 10, value: cur.keep }), budget = el('input', { type: 'number', min: 0, max: R.AUTO.budgetMax, step: 10000, value: cur.budget })
  const syncLabels = () => { fishLabel.textContent = `钓鱼 ${fishPct.value}% · 挖矿 ${100 - fishPct.value}%`; minLabel.textContent = Number(minPct.value) ? `只在价格 ≥ 基础价 ${minPct.value}% 时卖，便宜了就囤着` : '有货就卖' }
  fishPct.addEventListener('input', syncLabels); minPct.addEventListener('input', syncLabels); syncLabels()
  const row = (title, sub, ctl, cls) => el('label', { class: 'isle-auto-row' + (cls ? ' ' + cls : '') }, el('div', {}, el('b', { text: title }), sub ? (typeof sub === 'string' ? el('small', { text: sub }) : sub) : null), ctl)
  const L = s.autoLog
  const save = el('button', { class: 'isle-btn', type: 'button', onclick: async () => {
    save.disabled = true
    try {
      const cfg = { on: on.checked, crop: crop.value, water: water.checked, feed: feed.checked, fishPct: Number(fishPct.value), keep: Number(keep.value), sell: sell.checked, minPct: Number(minPct.value), budget: Number(budget.value) }
      await isle.autoSave(cfg)
      toast?.(cfg.on ? '管家开始干活了：每 4 小时巡视一次，离线也算' : '管家已休息', 'ok'); sh.close()
    } catch (e) { toast?.(e.message || '保存失败', 'err'); save.disabled = false }
  } }, '保存策略')
  const sh = sheet(host, '挂机管家', el('div', { class: 'isle-auto' },
    row('开启挂机', hired ? (cur.on ? `挂机中 · 下一轮巡视约 ${Math.max(1, Math.ceil(((s.auto?.t || 0) + R.AUTO.every - isle.now()) / 60))} 分钟后` : '已雇佣，打开就开始巡视') : `第一次开启付雇佣费 ${fmt(R.AUTO.hire)} D币`, on, 'big'),
    row('种什么', '收完、清掉枯萎的地后补种', crop),
    row('自动浇水', '没有洒水器的地每个阶段浇一次（耗体力）', water),
    row('自动喂食', '饿了就喂，饲料不够自动买', feed),
    row('剩余体力怎么用', fishLabel, fishPct),
    row('保留体力', '留给你上线时自己玩', keep),
    row('自动卖货', minLabel, el('span', { style: 'display:flex;gap:8px;align-items:center' }, minPct, sell)),
    row('每轮花费上限', '种子 + 饲料（不含工钱）', budget),
    el('ul', { class: 'isle-auto-rules' },
      el('li', { text: `每 ${R.AUTO.every / 3600} 小时巡视一次，不在线也算；回来时一次性补算，最多补 ${R.AUTO.maxBack / 3600} 小时。` }),
      el('li', { text: `工钱每轮 ${fmt(R.AUTO.wage)} D币，付不起就歇一轮；代卖抽成 ${Math.round(R.AUTO.fee * 100)}%。` }),
      el('li', { text: `管家手艺一般：收获、产物、鱼都只有普通品质，不会多收；钓鱼 / 挖矿每次多耗 ${R.AUTO.surcharge} 点体力。只挂机大约是认真玩收益的一半。` }),
      el('li', { text: '和你共用体力、每日钓鱼挖矿次数和卖出上限；你上线自己玩，管家照样按点巡视。' })),
    L ? el('p', { class: 'isle-note', text: `上次报告：巡视 ${L.visits} 轮，收入 ${fmt(L.earn)}，支出 ${fmt(L.spend)}（含工钱 ${fmt(L.wage || 0)}）` }) : null,
    save,
  ), { onClose: () => isle.refresh() })
}
