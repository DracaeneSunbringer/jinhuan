// 小岛的面板：集市（卖货 / 行情 / 杂货）、背包、说明、菜单。都是从屏幕底部滑出的木牌风格面板。
import * as R from '/pet-world-rules.js?v=472f7fbf'
import * as A from '/pet-isle-art.js?v=472f7fbf'

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
const KIND = (id) => R.RECIPES.some((r) => r.id === id && r.price) ? '加工品' : String(id).startsWith('sd_') ? '种子' : R.CROPS.some((c) => c.id === id) ? '作物' : R.ANIMALS.some((a) => a.product === id) ? '畜产' : R.FISH.some((f) => f.id === id) ? '鱼' : R.ORES.some((o) => o.id === id) ? '矿石' : '杂货'
const QN = ['普通', '银星', '金星']
const KIND_ORDER = ['作物', '畜产', '鱼', '矿石', '加工品', '种子', '杂货']
const kindRank = (id) => KIND_ORDER.indexOf(KIND(id))
let riseLo = null, riseHi = null

export function sheet(host, title, body, { wide = false, onClose } = {}) {
  const previous=host.querySelector('.isle-sheet-wrap');previous?.dispatchEvent(new Event('isleclose'));previous?.remove()
  const before=document.activeElement;let closed=false
  const close=()=>{if(closed)return;closed=true;document.removeEventListener('keydown',key,true);wrap.classList.remove('open');setTimeout(()=>wrap.remove(),220);onClose?.();if(before?.isConnected)before.focus?.({preventScroll:true})}
  const wrap=el('div',{class:'isle-sheet-wrap',onclick:e=>{if(e.target===wrap)close()}},el('section',{class:'isle-sheet'+(wide?' wide':''),role:'dialog','aria-modal':'true','aria-label':title},el('header',{},el('h2',{text:title}),el('button',{class:'isle-x',type:'button','aria-label':'关闭',onclick:close},'×')),el('div',{class:'isle-sheet-body'},body)))
  const key=e=>{if(closed||!wrap.isConnected)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}else if(e.key==='Tab'){const nodes=[...wrap.querySelectorAll('button,input,textarea,select,a[href],[tabindex]')].filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}
  wrap.addEventListener('isleclose',close,{once:true});document.addEventListener('keydown',key,true);host.append(wrap)
  requestAnimationFrame(()=>{if(!closed){wrap.classList.add('open');wrap.querySelector('.isle-x').focus({preventScroll:true})}})
  return {close,body:wrap.querySelector('.isle-sheet-body')}
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
  let includeWarehouse=false;
  const sh = sheet(host, '猫猫集市', el('div', { class: 'isle-loading', text: '摊主在清点货物…' }), { wide: true, onClose: () => isle.refresh() })
  await settle(isle)
  // 同一物品的不同品质排在一起：先按大类，再按物品名，最后金星到普通。
  const rowOrder = (a, b) => kindRank(a.id) - kindRank(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || b.q - a.q
  const draw = (k) => {
    tab = k
    const s = isle.state, prices = isle.prices, day = isle.day
    const earnLeft = Infinity // 每日售卖上限已取消
    const head = el('div', { class: 'isle-market-head' }, el('canvas', { class: 'isle-cat', width: 14, height: 12 }), el('div', {}, el('b', { text: ['喵～今天行情如下', '收货啦收货啦', '要点什么吗喵', '加工坊开工啦，原料变好货'][['trend', 'sell', 'shop', 'craft'].indexOf(k)] || '' }), el('small', { text: `${R.SEASONS[isle.season]}季 · ${R.WEATHERS[isle.weather]} · 卖出不限量` })), coin(isle.coins, true))
    const body = [el('div',{class:'b12-stock-tools'},b12WarehouseButton(host,isle),el('button',{class:'isle-btn ghost',type:'button',onclick:()=>openB12Journal(host,isle)},'山谷纪事'),['sell','craft'].includes(k)?el('label',{},el('input',{type:'checkbox',checked:includeWarehouse,onchange:e=>{includeWarehouse=e.target.checked;draw(k)}}),'包含仓库物品'):null)]
    if (k === 'sell') {
      const rows = Object.entries(s.inv).filter(([id]) => prices[id]).flatMap(([id, qs]) => qs.map((total, q) => {const n=includeWarehouse?total:R.b12Available(s,id,q);return n ? { id, q, n, price: Math.round(prices[id] * R.QUALITY[q]) } : null}).filter(Boolean)).sort(rowOrder)
      if (!rows.length) body.push(el('p', { class: 'isle-empty', text: '背包里没有能卖的东西。去种菜、钓鱼、挖矿吧！' }))
      else {
        const total = b12SellPreview(isle,rows,includeWarehouse)
        body.push(el('div', { class: 'isle-sellall' }, el('span', {}, b12QuoteText(total)), el('button', { class: 'isle-btn', type: 'button', disabled: earnLeft <= 0, onclick: () => b12SellRows(isle,rows,includeWarehouse,sh,()=>draw('sell')) }, '一键全卖')))
        let riseSync = null
        {
          // 涨幅口径与格子上的 ▲/▼ 完全一致：今天集市价对比昨天，按显示的整数百分比比较，区间含两端。
          const yday = dayAdd(day, -1)
          const riseOf = (id) => { const a = R.priceOf(id, yday), p = ((prices[id] - a) / a) * 100; return Math.sign(p) * Number(Math.abs(p).toFixed(0)) }
          for (const r of rows) r.rise = riseOf(r.id)
          const min = Math.min(...rows.map((r) => r.rise)), max = Math.max(...rows.map((r) => r.rise))
          const clamp = (v) => Math.max(min, Math.min(max, v))
          // 上次的区间已不在今天的行情范围内（例如那批货刚卖完），回到默认：不跌的都选上。
          const stale = riseLo == null || riseLo > max || riseHi < min
          let lo = stale ? clamp(0) : clamp(riseLo), hi = stale ? max : clamp(riseHi)
          if (lo > hi) [lo, hi] = [hi, lo]
          const pct = (v) => (v > 0 ? '+' : '') + v + '%'
          const val = el('b', { class: 'isle-rise-val' }), fill = el('i'), sum = el('small', { class: 'isle-rise-sum' })
          const thumb = (v, label) => el('input', { type: 'range', min, max, step: 1, value: v, 'aria-label': label })
          const a = thumb(lo, '最低涨幅'), b = thumb(hi, '最高涨幅')
          const go = el('button', { class: 'isle-btn', type: 'button' })
          const pick = () => rows.filter((r) => r.rise >= lo && r.rise <= hi)
          riseSync = () => {
            const span = max - min || 1, list = pick(), total = b12SellPreview(isle,list,includeWarehouse), n = list.reduce((t, r) => t + r.n, 0)
            val.textContent = lo === hi ? pct(lo) : `${pct(lo)} ～ ${pct(hi)}`
            fill.style.left = ((lo - min) / span) * 100 + '%'; fill.style.width = ((hi - lo) / span) * 100 + '%'
            // 两个把手重叠在右端时，让左把手在上面，否则拖不动。
            a.style.zIndex = lo - min > (max - min) / 2 ? 3 : 1
            for (const r of rows) r.cell?.classList.toggle('pick', r.rise >= lo && r.rise <= hi)
            sum.replaceChildren(list.length ? `选中 ${list.length} 格 · 共 ${fmt(n)} 件 · 可得 ` : '这个区间没有货物', ...(list.length ? [b12QuoteText(total)] : []))
            go.textContent = list.length ? `卖出选中的 ${list.length} 格` : '没有选中货物'; go.disabled = !list.length
            riseLo = lo; riseHi = hi
          }
          a.addEventListener('input', () => { lo = Math.min(Number(a.value), hi); a.value = lo; riseSync() })
          b.addEventListener('input', () => { hi = Math.max(Number(b.value), lo); b.value = hi; riseSync() })
          go.addEventListener('click', () => b12SellRows(isle,pick(),includeWarehouse,sh,()=>draw('sell')))
          body.push(el('div', { class: 'isle-rise' },
            el('div', { class: 'isle-rise-head' }, el('b', { text: '按今日涨幅卖' }), val),
            el('div', { class: 'isle-range' }, fill, a, b),
            el('div', { class: 'isle-range-ends' }, el('span', { text: pct(min) }), el('span', { text: '拖动两端选择区间' }), el('span', { text: pct(max) })),
            sum, go))
        }
        body.push(el('div', { class: 'isle-grid' }, rows.map((r) => {
          const vals = series(r.id, day, prices[r.id])
          return r.cell = el('button', { class: 'isle-cell q' + r.q, type: 'button', onclick: () => sellOne(r) },
            el('img', { src: A.itemIcon(r.id, 3), alt: '' }), el('b', { text: R.ITEM_NAME[r.id] }), el('small', {}, r.q ? '★'.repeat(r.q) + ' ' : '', '×' + r.n), el('span', { class: 'isle-cell-p' }, coin(r.price), change(vals)))
        })))
        riseSync?.()
      }
      const sellOne = (r) => {
        const pick = el('div', { class: 'isle-sellpick' },
          el('div', { class: 'isle-sellpick-h' }, el('img', { src: A.itemIcon(r.id, 4), alt: '' }), el('div', {}, el('b', { text: `${R.ITEM_NAME[r.id]}${r.q ? ' ' + QN[r.q] : ''}` }), el('small', { text: `有 ${r.n} 个 · 单价 ${fmt(r.price)}` })), spark(series(r.id, day, prices[r.id]), 110, 34)),
          el('div', { class: 'isle-sellpick-b' }, [1, Math.ceil(r.n / 2), r.n].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((n) => el('button', { class: 'isle-btn', type: 'button', onclick: () => b12SellRows(isle,[{...r,n}],includeWarehouse,sh,()=>draw('sell')) }, `卖 ${n === r.n ? '全部 ' : ''}${n} 个 · `, el('small',{text:b12QuoteText(b12SellPreview(isle,[{...r,n}],includeWarehouse))})))))
        sh.body.querySelector('.isle-sellpick')?.remove(); sh.body.prepend(pick); sh.body.scrollTop = 0
      }
    } else if(k==='cargo') { body.push(...b12CargoUI(isle,()=>draw('cargo')))
    } else if(k==='tax') { body.push(b12TaxPanel())
    } else if (k === 'trend') {
      const evs = R.marketEvents(day)
      body.push(el('div', { class: 'isle-news' }, el('b', { text: '📜 今日商闻（每个岛日换一批，跟季节和天气有关）' }), evs.length ? evs.map((e) => el('div', { class: 'isle-news-row' }, el('img', { class: 'isle-news-g', src: A.itemIcon('guild:' + e.gid), alt: '' }), el('em', { text: e.guild }), el('span', { text: e.text }), el('span', { class: e.m > 1 ? 'up' : 'down', text: (e.m > 1 ? '▲ +' : '▼ ') + Math.round((e.m - 1) * 100) + '%' }), el('small', { text: '影响：' + e.items.map((id) => R.ITEM_NAME[id] || id).join('、') }))) : el('small', { text: '今天风平浪静。' })))
      const groups = ['作物', '畜产', '鱼', '矿石', '加工品']
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
      body.push(el('p', { class: 'isle-note', text: '价格每累计 4 小时白昼变动一次，北京时间 22:00—08:00 长夜暂停换日：基础价 × 季节（反季贵、当季便宜）× 随机行情（有惯性，偶尔暴涨暴跌）× 供需（集市有基础库存，上一个岛日全站卖出越多越便宜，最多便宜 20%）。作物每人每天同一种前 150 个全价，151–400 个 85%，之后 70%。' }))
    } else if (k === 'craft') {
      const s2 = isle.state, have = (id) => [0,1,2].reduce((a,q)=>a+(includeWarehouse?(s2.inv[id]?.[q]||0):R.b12Available(s2,id,q)),0), left = R.WORLD.daily.craft - R.isleCount(s2, 'craft')
      body.push(el('p', { class: 'isle-note', text: `每次加工 1 体力 · 这个岛日还能做 ${left} 份 · 原料按普通→银星→金星的顺序扣 · 加工品价格同样受季节和商闻影响` }))
      body.push(el('div', { class: 'isle-craft-energy' },
        el('span', { text: `当前体力 ${Math.floor(s2.en)} · 每份需要 ${R.WORLD.cost.craft} 体力` }),
        s2.en < R.WORLD.cost.craft && left > 0 ? el('button', { class: 'isle-btn', type: 'button', onclick: () => isle.foodMenu('加工体力不足，请先选择食物补充。') }, '补充体力') : null))
      for (const r of R.RECIPES) {
        const max = Math.min(20, left, Math.floor(s2.en / R.WORLD.cost.craft), ...Object.entries(r.in).map(([id, n]) => Math.floor(have(id) / n)))
        const worth = r.price ? Object.entries(r.in).reduce((t, [id, n]) => t + (prices[id] || 0) * n, 0) : 0
        body.push(el('div', { class: 'isle-shoprow' }, el('img', { src: A.itemIcon(r.id, 3), alt: '' }),
          el('div', {}, el('b', { text: `${r.name}（有 ${have(r.id)}）` }), el('div', { class: 'isle-craft-in' }, Object.entries(r.in).map(([id, n]) => el('span', { class: have(id) < n ? 'lack' : '', text: `${R.ITEM_NAME[id]} ${have(id)}/${n}` }))),
            el('small', { text: r.price ? `今天卖 ${fmt(prices[r.id] || r.price)}（原料值 ${fmt(worth)}）` : '拿去矿洞炸矿：一次炸出 6–8 块矿石' })),
          el('div', { class: 'isle-shoprow-b' }, [1, 5, max].filter((n, i, a) => n > 0 && n <= max && a.indexOf(n) === i).map((n) => el('button', { class: 'isle-btn', type: 'button', onclick: () => { if (isle.push({ a: 'craft', id: r.id, n, includeWarehouse })) draw('craft') } }, n === max && n > 5 ? `做 ${n}（最多）` : `做 ${n}`)), max > 0 ? null : el('small', { role: 'status', text: left <= 0 ? '本岛日加工次数已用完' : s2.en < R.WORLD.cost.craft ? (Object.entries(r.in).some(([id, n]) => have(id) < n) ? '体力不足，材料也不足' : '体力不足') : '材料不足' }))))
      }
    } else {
      const s2 = isle.state
      const item = (id, name, desc, price, act, left) => el('div', { class: 'isle-shoprow' }, el('img', { src: A.itemIcon(id, 3), alt: '' }), el('div', {}, el('b', { text: name }), el('small', { text: desc })), el('div', { class: 'isle-shoprow-b' }, act.map(([label, a, cost]) => el('button', { class: 'isle-btn', type: 'button', disabled: isle.coins < cost || left === 0, onclick: () => { if (isle.push(a)) draw('shop') } }, label, ' · ', coin(cost)))))
      body.push(
        item('feed', `饲料（有 ${s2.inv.feed?.[0] || 0}）`, '动物吃一顿管 24 小时，饿着不产出', R.SHOP.feed.price, [['×10', { a: 'buy', id: 'feed', n: 10 }, R.SHOP.feed.price * 10], ['×30', { a: 'buy', id: 'feed', n: 30 }, R.SHOP.feed.price * 30]]),
        item('bait', `鱼饵（有 ${s2.inv.bait?.[0] || 0}）`, '更少脱钩，贵鱼概率翻倍', R.SHOP.bait.price, [['×10', { a: 'buy', id: 'bait', n: 10 }, R.SHOP.bait.price * 10], ['×30', { a: 'buy', id: 'bait', n: 30 }, R.SHOP.bait.price * 30]]),
        item('bomb', `炸药（有 ${s2.inv.bomb?.[0] || 0}）`, '矿洞里用：一次炸开一片石头，出 6–8 块矿石，还可能炸出梯子', R.SHOP.bomb.price, [['×1', { a: 'buy', id: 'bomb', n: 1 }, R.SHOP.bomb.price], ['×5', { a: 'buy', id: 'bomb', n: 5 }, R.SHOP.bomb.price * 5]]),
        el('h3',{text:'守家道具'}),
        el('p',{class:'isle-note',text:'基础发现率 55%，范围 35%—75%；警戒槽与护具槽可各选一种，同槽不叠加。好友协防最多增加 6 个百分点，主场保留 10% 生命。'}),
        el('p',{text:b12EffectsText(s2,isle.now())}),
        R.b12GuardRefundQuote(s2)?el('button',{class:'isle-btn',type:'button',onclick:async e=>{const b=e.currentTarget;b.disabled=true;try{await isle.actNow({a:'guardRefund'});draw('shop')}catch(err){b.textContent=err.message||'领取失败，请重试';b.disabled=false}}},'领取旧守家道具补偿 '+fmt(R.b12GuardRefundQuote(s2))+' D'):null,
        ...Object.entries(R.GUARD_ITEMS).map(([id, g]) => item(id, g.name, g.desc + '（买了立刻生效，不用手动用）', g.price, [['买', { a: 'buy', id }, g.price]])),
        el('h3',{text:'偷菜道具'}),
        el('p',{class:'isle-note',text:'潜行槽可选斗篷或口哨，携带槽可配菜篮。旧夜行斗篷在原到期前保留降低 15 个百分点的效果。'}),
        ...Object.entries(R.THIEF_ITEMS).map(([id, g]) => item(id, g.name, g.desc + '（买了立刻生效，串门时自动起作用）', g.price, [['买', { a: 'buy', id }, g.price]])),
        item('coffee', `冰美式（今天还能喝 ${R.WORLD.daily.coffee - (s2.cnt.coffee || 0)} 杯）`, `立刻 +${R.WORLD.coffee.energy} 体力，可以超过上限`, R.WORLD.coffee.price, [['喝一杯', { a: 'coffee' }, R.WORLD.coffee.price]], R.WORLD.daily.coffee - (s2.cnt.coffee || 0)),
      )
    }
    sh.body.replaceChildren(tabs([['sell', '卖货'], ['trend', '行情'], ['craft', '加工'], ['cargo','货船'], ['shop', '杂货'], ['tax','公库']], draw, k), head, ...body)
    const cat = sh.body.querySelector('.isle-cat'); cat.getContext('2d').drawImage(A.CAT[0], 0, 0)
  }
  draw(tab)
}

export async function openBag(host, isle, onMarket) {
  const sh = sheet(host, '背包', el('div', { class: 'isle-loading', text: '整理中…' }))
  await settle(isle)
  const s = isle.state
  const book = () => {
    const seen = new Set(s.seen || []), groups = [['作物', R.CROPS.map((c) => c.id)], ['畜产', R.ANIMALS.map((a) => a.product)], ['鱼', R.FISH.map((f) => f.id)], ['矿石', R.ORES.map((o) => o.id)]]
    const all = groups.flatMap((g) => g[1]), got = all.filter((id) => seen.has(id)).length
    return [el('div', { class: 'isle-bag-head' }, el('b', { text: `图鉴 ${got}/${all.length}` }), el('small', { text: got === all.length ? '全部集齐！' : '第一次得到会点亮' })),
      ...groups.map(([name, ids]) => [el('h3', { text: name }), el('div', { class: 'isle-book' }, ids.map((id) => {
        const f = R.FISH.find((x) => x.id === id), o = R.ORES.find((x) => x.id === id), c = R.CROPS.find((x) => x.id === id)
        const tip = f ? `${R.SEASONS.filter((_, i) => f.seasons.includes(i)).join('')}季 · ${f.hours[0] === 0 && f.hours[1] === 24 ? '全天' : f.hours[0] + '–' + (f.hours[1] % 24) + '点'} · 鱼竿 Lv${f.rod}` : o ? `第 ${o.floor} 层以下` : c ? `${R.SEASONS.filter((_, i) => c.seasons.includes(i)).join('')}季` : ''
        return el('div', { class: 'isle-book-cell' + (seen.has(id) ? '' : ' locked'), title: tip }, el('img', { src: A.itemIcon(id, 3), alt: '' }), el('small', { text: seen.has(id) ? R.ITEM_NAME[id] : '？？？' }), el('i', { text: tip }))
      }))])]
  }
  const rows = Object.entries(s.inv).flatMap(([id, qs]) => qs.map((n, q) => (n ? { id, q, n } : null)).filter(Boolean))
  const stacks = (() => {
    const g = new Map()
    for (const r of rows) {
      const s0 = g.get(r.id) || { id: r.id, items: [], total: 0, value: 0 }
      s0.items.push({ q: r.q, n: r.n }); s0.total += r.n
      s0.value += r.n * Math.round((isle.prices[r.id] || 0) * R.QUALITY[r.q])
      g.set(r.id, s0)
    }
    return [...g.values()].map((x) => ({ ...x, items: x.items.sort((a, b) => b.q - a.q) })).sort((a, b) => kindRank(a.id) - kindRank(b.id) || b.value - a.value || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  })()
  const value = rows.reduce((t, r) => t + (isle.prices[r.id] || 0) * R.QUALITY[r.q] * r.n, 0)
  const useTip = el('div', { class: 'isle-use', hidden: true })
  const USE = (id) => id === 'bomb' ? ['💣 炸药', '进矿洞后点底部快捷栏的「💣 炸药」，一次炸开附近的石头，出 6–8 块矿石，还可能炸出下一层的梯子。每次 6 体力，每天最多 10 次。']
    : id.startsWith('sd_') ? ['🌱 ' + R.ITEM_NAME[id], '不用手动用：种' + R.ITEM_NAME[id.slice(3)] + '时自动先扣种子、不花 D币。快捷栏这种作物的格子上会显示 🌱 数量。注意只能在对应季节种。']
    : id === 'feed' ? ['饲料', '点牧场里的动物喂食，吃一顿管 24 小时。'] : id === 'bait' ? ['鱼饵', '去码头钓鱼时，快捷栏点鱼饵格子开关，开着会自动消耗。']
    : R.RECIPES.some((r) => r.id === id) ? [R.ITEM_NAME[id], '加工品：去集市「卖货」卖掉，价格看「行情」页的加工品和今日商闻。']
    : isle.prices[id] ? [R.ITEM_NAME[id] || id, '去集市卖掉，或在集市「加工」页做成更值钱的加工品。'] : [R.ITEM_NAME[id] || id, '']
  const showUse = (id) => { const [t, d] = USE(id); useTip.hidden = false; useTip.replaceChildren(el('img', { src: A.itemIcon(id, 3), alt: '' }), el('div', {}, el('b', { text: t }), el('small', { text: d || '暂时没有特别用途。' }))); useTip.scrollIntoView({ block: 'nearest' }) }
  const buffRow = () => { const t = Math.floor(Date.now() / 1000), h = (u) => Math.ceil((u - t) / 3600) + ' 小时', list = []
    list.push(b12EffectsText(s,t));
    return el('div', { class: 'isle-buffs' }, el('small', { text: '生效中的道具' }), el('b', { text: list.length ? list.join(' · ') : '没有。守家 / 偷菜道具在集市「杂货」买，买了立刻生效，不占背包。' })) }
  const drawTab = (k) => k === 'book' ? sh.body.replaceChildren(tabs([['items', '物品'], ['book', '图鉴']], drawTab, 'book'), ...book().flat()) : drawItems()
  const drawItems = () => sh.body.replaceChildren(tabs([['items', '物品'], ['book', '图鉴']], drawTab, 'items'),
    el('div', { class: 'isle-bag-head' }, el('span', {}, '按今天价格估值 ', coin(value, true)), el('button', { class: 'isle-btn', type: 'button', onclick: () => { sh.close(); onMarket() } }, '去集市卖')),
    b12WarehouseButton(host,isle), buffRow(), useTip,
    stacks.length ? el('div', { class: 'isle-grid' }, stacks.map((g) => el('div', { class: 'isle-cell' + (g.items.length === 1 ? ' q' + g.items[0].q : ' stacked'), role: 'button', tabindex: 0, onclick: () => showUse(g.id) },
      el('img', { src: A.itemIcon(g.id, 3), alt: '' }), el('b', { text: R.ITEM_NAME[g.id] || g.id }),
      el('small', {}, g.items.length === 1 ? (g.items[0].q ? '★'.repeat(g.items[0].q) + ' ' : '') + '×' + g.total : '共 ×' + g.total),
      g.items.length > 1 ? el('span', { class: 'isle-stack' }, g.items.map((x) => el('i', { class: 'sq' + x.q }, (x.q ? '★'.repeat(x.q) : '普通') + ' ×' + x.n))) : null,
      isle.prices[g.id] ? el('span', { class: 'isle-cell-p' }, coin(g.value)) : el('span', { class: 'isle-cell-p muted', text: KIND(g.id) })))) : el('p', { class: 'isle-empty', text: '空空的。' }),
    el('div', { class: 'isle-stats' },
      el('div', {}, el('small', { text: '工具' }), el('b', { text: `鱼竿 Lv${s.tools.rod} · 镐子 Lv${s.tools.pick} · 洒水器 Lv${s.tools.spr} · 小屋 Lv${s.tools.house}` })),
      el('div', {}, el('small', { text: '这个岛日' }), el('b', { text: `钓鱼 ${R.isleCount(s, 'fish')}/${R.WORLD.daily.fish} · 挖矿 ${R.isleCount(s, 'mine')}/${R.WORLD.daily.mine} · 卖出 ${short(s.earn.amt)}` })),
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
      el('li', {}, el('b', { text: '季节：' }), '岛上一天累计白昼 4 小时，每 12 个岛日换季；每天北京时间 22:00—08:00 岛钟暂停（春→夏→秋→冬）。反季作物种不了；已经种下的会长熟，可多次采收的作物换季后再长一轮会枯萎。草莓、番茄、玉米、葡萄收完会留在地里再长，能收好几茬。'),
      el('li', {}, el('b', { text: '牧场：' }), '点畜栏买动物。喂一次管 24 小时，期间按时产出，窝里最多攒几个（挂机上限），满了就不再攒——常来收，收益更高。每天还能摸一次，心情越好越容易出银星 / 金星。'),
      el('li', {}, el('b', { text: '海边：' }), '点码头开始钓鱼，浮漂上冒出「!」时马上点屏幕收竿（太早太晚都不扣体力）。鱼的种类看季节、时段和鱼竿等级。码头两边能放蟹笼，自动抓小鱼。'),
      el('li', {}, el('b', { text: '矿洞：' }), '点矿洞进去，敲碎石头得到矿石宝石。越深越值钱，可能出现通往下一层的梯子。镐子等级决定最深能到哪层。'),
      el('li', {}, el('b', { text: '集市：' }), '点猫猫摊主卖东西。每个岛日（现实 4 小时）价格都在变（看「行情」里最近 14 个岛日的走势），不着急可以囤着等涨价。'),
      el('li', {}, el('b', { text: '新人礼：' }), `第一次进鱼鱼谷可以领 ${fmt(R.WELCOME_GIFT)} D币（每个账号一次；没领的话在小屋旁的信箱里领）。`),
      el('li', {}, el('b', { text: '挂机管家：' }), `菜单或小屋里雇个管家（${fmt(R.AUTO.hire)} D币，之后每轮工钱 ${fmt(R.AUTO.wage)}），配好策略后每 ${R.AUTO.every / 3600} 小时替你巡视一次：收菜补种、收蛋喂食、收蟹笼、用剩余体力钓鱼挖矿、按价格卖货，离线也算。手艺和你亲手玩一样（品质、多收、体力消耗、售价都相同，不抽成）；收入和亲手玩一样全额到账。`),
      el('li', {}, el('b', { text: '每日目标：' }), '广场公告栏每天按你的小岛情况出 4 个目标（2 简单 / 1 中等 / 1 困难；装了洒水器就不会再让你手动浇水）。奖励是 D币 + 当季种子、鱼饵、饲料、矿石、宝石、炸药，困难目标和全部完成还送擂台装备。'),
      el('li', {}, el('b', { text: '加工坊：' }), '集市「加工」页把作物、畜产、矿石做成果酱、葡萄酒、奶酪、金锭、宝石项链、钻石王冠……卖价比原料高。煤 + 铜矿还能做炸药。'),
      el('li', {}, el('b', { text: '今日商闻：' }), '东海龙宫、昆仑玉坊、扶桑神农社等神话商会每个岛日都有新动静，跟季节天气挂钩，会让一批货涨价或压价，在「行情」页最上面看。'),
      el('li', {}, el('b', { text: '炸矿：' }), '矿洞里点「💣 炸药」，一次炸开附近的石头，出 6–8 块矿石，还可能炸出下一层的梯子。'),
      el('li', {}, el('b', { text: '经验：' }), '种菜、收产物、钓鱼、挖矿、加工、串门帮忙得到的经验都算进大肥鱼的擂台等级（和擂台对战是同一个等级，升级加属性点、解锁技能和装备）。经验按北京时间自然日累计，常规上限 1000，中等落后 2000，显著落后 3000；不必赶夜间刷新；满了就不再飘「+经验」。'),
      el('li', {}, el('b', { text: '串门帮忙：' }), '去别人岛上点「🤝 一键帮忙」：帮 TA 浇水、清理反季枯掉的地、用你的饲料喂饿着的动物。你拿少量 D币和擂台经验，双方亲密度 +1/处（每天每人最多 +5）。每天能帮 10 家，同一家 1 次。'),
      el('li', {}, el('b', { text: '亲密度：' }), '帮忙涨、偷菜掉（-5）。0/10/30/60/100 对应 Lv1–5：等级越高帮忙奖励越多（每级 +10%）；到 30（Lv3）后对方的大肥鱼会帮你看家，每个这样的好友让小偷被发现的概率 +5%，最多 +15%。'),
      el('li', {}, el('b', { text: '守家道具：' }), '杂货里买鱼干零食 / 珊瑚护甲 / 龙宫护符，小偷更容易被大肥鱼发现，守家擂台也更能打。'),
      el('li', {}, el('b', { text: '成长：' }), '收获、收蛋、钓鱼、挖矿都会给大肥鱼加经验（收获 / 收蛋 6、钓鱼 9、挖矿 6，和养成共用每天 1000 点的自然成长上限，等级落后时有追赶加成），等级越高擂台属性越强。'),
      el('li', {}, el('b', { text: '升级：' }), '小屋（体力上限 +20）、铁匠铺（鱼竿 / 镐子 / 洒水器）、开垦地块、扩建畜栏、蟹笼——这些是主要的 D币 花销，也是收益翻倍的关键。'),
    ),
    el('h3', { text: '体力与上限' }),
    el('p', { text: `体力上限 ${R.WORLD.energyBase}（小屋每级 +${R.WORLD.energyPerHouse}），每 ${R.WORLD.regen / 60} 分钟回 1 点，满了就不再回。种地 ${R.WORLD.cost.plant}、浇水 ${R.WORLD.cost.water}、收获 ${R.WORLD.cost.harvest}、喂食 ${R.WORLD.cost.feed}、钓鱼 ${R.WORLD.cost.fish}、挖矿 ${R.WORLD.cost.mine} 点。吃自己种的菜能回体力，集市的冰美式每天最多 ${R.WORLD.daily.coffee} 杯。每天最多钓 ${R.WORLD.daily.fish} 竿、挖 ${R.WORLD.daily.mine} 下，卖出不限量。` }),
    el('p', { class: 'isle-note', text: '大概能赚多少：认真经营（每天来 5–6 次、体力用完）到中后期，一天能赚 100 万 D币 以上；每天只来一次（收菜收蛋、顺手把体力用完）大约 40–55 万；新岛第一天十几万。所有产出都受体力、真实生长时间和每日上限约束，开脚本也不会更多，反而会被「操作太快」拦住。' }),
    el('h3', { text: '作物' }),
    tbl(['', '作物', '季节', '种子', '成熟', '再收', '基础价'], R.CROPS.map((c) => [icon(c.id), c.name, se(c.seasons), fmt(c.seed), d(c.grow), c.regrow ? `${d(c.regrow)}×${c.times - 1}` : '—', fmt(c.price)])),
    el('h3', { text: '动物' }),
    tbl(['', '动物', '价格', '产出', '间隔', '最多攒', '基础价'], R.ANIMALS.map((a) => [icon(a.product), a.name, short(a.price), a.productName, d(a.every), a.cap, fmt(a.productPrice)])),
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
  const craft = el('input', { type: 'checkbox', checked: !!cur.craft }), bomb = el('input', { type: 'checkbox', checked: !!cur.bomb }), goals = el('input', { type: 'checkbox', checked: cur.goals !== false })
  const guard = el('select', {}, el('option', { value: 0, text: '不续' }), Object.entries(R.GUARD_ITEMS).map(([id, g], k) => el('option', { value: k + 1, text: g.name + '（' + fmt(g.price) + '）' }))); guard.value = String(cur.guard || 0)
  const syncLabels = () => { fishLabel.textContent = `钓鱼 ${fishPct.value}% · 挖矿 ${100 - fishPct.value}%`; minLabel.textContent = Number(minPct.value) ? `只在价格 ≥ 基础价 ${minPct.value}% 时卖，便宜了就囤着` : '有货就卖' }
  fishPct.addEventListener('input', syncLabels); minPct.addEventListener('input', syncLabels); syncLabels()
  const row = (title, sub, ctl, cls) => el('label', { class: 'isle-auto-row' + (cls ? ' ' + cls : '') }, el('div', {}, el('b', { text: title }), sub ? (typeof sub === 'string' ? el('small', { text: sub }) : sub) : null), ctl)
  const L = s.autoLog
  const save = el('button', { class: 'isle-btn', type: 'button', onclick: async () => {
    save.disabled = true
    try {
      const cfg = { on: on.checked, crop: crop.value, water: water.checked, feed: feed.checked, fishPct: Number(fishPct.value), keep: Number(keep.value), sell: sell.checked, minPct: Number(minPct.value), budget: Number(budget.value), craft: craft.checked, bomb: bomb.checked, goals: goals.checked, guard: Number(guard.value) }
      await isle.autoSave(cfg)
      toast?.(cfg.on ? '管家开始干活了：每 ' + R.AUTO.every / 3600 + ' 小时巡视一次，离线也算' : '管家已休息', 'ok'); sh.close()
    } catch (e) { toast?.(e.message || '保存失败', 'err'); save.disabled = false }
  } }, '保存策略')
  const sh = sheet(host, '挂机管家', el('div', { class: 'isle-auto' },
    b12WarehouseButton(host,isle),
    row('开启挂机', hired ? (cur.on ? `挂机中 · 下一轮巡视约 ${Math.max(1, Math.ceil(((s.auto?.t || 0) + R.AUTO.every - isle.now()) / 60))} 分钟后` : '已雇佣，打开就开始巡视') : `第一次开启付雇佣费 ${fmt(R.AUTO.hire)} D币`, on, 'big'),
    row('种什么', '收完、清掉枯萎的地后补种', crop),
    row('自动浇水', '没有洒水器的地每个阶段浇一次（耗体力）', water),
    row('自动喂食', '饿了就喂，饲料不够自动买', feed),
    row('剩余体力怎么用', fishLabel, fishPct),
    row('保留体力', '留给你上线时自己玩', keep),
    row('自动卖货', minLabel, el('span', { style: 'display:flex;gap:8px;align-items:center' }, minPct, sell)),
    row('自动加工', '加工品比原料贵 10% 以上才做，做完一起卖（耗体力）', craft),
    row('自动炸矿', '背包里有炸药就每轮最多炸 3 次（每次 6 体力）', bomb),
    row('自动领每日目标', '简单和中等目标做完就领；困难目标和全部完成有擂台装备，留给你自己上线领', goals),
    row('守家道具到期自动续', '到期后按所选道具续费；同槽存在其他道具时保留原选择。旧版续费策略已停用，请重新选择。', guard),
    row('每轮花费上限', '种子 + 饲料 + 守家道具（不含工钱）', budget),
    el('ul', { class: 'isle-auto-rules' },
      el('li', { text: `每 ${R.AUTO.every / 3600} 小时巡视一次，不在线也算；回来时一次性补算，最多补 ${R.AUTO.maxBack / 3600} 小时。` }),
      el('li', { text: `工钱每轮 ${fmt(R.AUTO.wage)} D币，付不起就歇一轮；代卖不抽成。` }),
      el('li', { text: '管家手艺和你亲手玩一样：品质、多收、体力消耗和售价都相同，收入全额到账。' }),
      el('li', { text: '和你共用体力、每日钓鱼挖矿次数和卖出上限；你上线自己玩，管家照样按点巡视。' })),
    L ? el('p', { class: 'isle-note', text: `上次报告：巡视 ${L.visits} 轮，收入 ${fmt(L.earn)}，支出 ${fmt(L.spend)}（含工钱 ${fmt(L.wage || 0)}）` }) : null,
    save,
  ), { onClose: () => isle.refresh() })
}

function b12EffectsText(s,t){const names={alert:'警戒',combat:'护具',stealth:'潜行',carry:'携带'};const parts=Object.entries(names).flatMap(([slot,name])=>{const x=R.b12Effect(s,slot,t);return x?[name+'：'+(x.legacy&&x.id==='cloak'?'旧夜行斗篷':R.ITEM_NAME[x.id])+'（剩 '+Math.ceil((x.until-t)/3600)+' 小时）']:[]});return parts.join(' · ')||'尚未装备守家或偷菜道具。'}

// Appended to the existing UI module; reuses its accessible sheet and controls.
const b12WarehouseButton=(host,isle)=>el('button',{class:'isle-btn',type:'button',onclick:()=>openWarehouse(host,isle)},'囤货仓库');
export async function openWarehouse(host,isle) {
  const sh=sheet(host,'囤货仓库',el('p',{text:'正在同步库存…'}),{wide:true,onClose:()=>isle.refresh()});
  await settle(isle);
  let kind='全部',filter='',onlyStored=false,busy=false,status='',pending=new Map();
  const key=(id,q)=>id+':'+q;
  const price=(id,q)=>Math.round((Number(isle.prices?.[id])||0)*R.QUALITY[q]);
  const base=(id,q)=>Math.round((Number(R.BASE_PRICE[id])||0)*R.QUALITY[q]);
  const rowsOf=()=>{const s=isle.state;return [...new Set([...Object.keys(s.inv),...Object.keys(s.b12?.keep||{})])].filter(id=>R.ITEM_NAME[id]).flatMap(id=>[0,1,2].filter(q=>s.inv[id]?.[q]||s.b12?.keep?.[id]?.[q]).map(q=>{
    const total=s.inv[id]?.[q]||0,stored=Math.min(total,s.b12?.vault?.[id]?.[q]||0),auto=(s.b12?.keep?.[id]?.[q]||0)>0,p=pending.get(key(id,q));
    return {id,q,total,stored,auto,n:p?p.n:stored,keep:p?p.keep:auto,kind:KIND(id),now:price(id,q),base:base(id,q)};
  })).sort((a,b)=>kindRank(a.id)-kindRank(b.id)||a.id.localeCompare(b.id)||b.q-a.q)};
  const stage=(r,n,keep=r.keep)=>{n=Math.max(0,Math.min(r.total,Math.floor(Number(n))||0));if(!n)keep=false;if(n===r.stored&&keep===r.auto)pending.delete(key(r.id,r.q));else pending.set(key(r.id,r.q),{id:r.id,q:r.q,n,keep});};
  const pct=r=>r.base>0&&r.now>0?Math.round((r.now/r.base-1)*100):null;
  const head=el('div',{class:'b15-wh-head'}),tabs=el('div',{class:'b15-wh-tabs',role:'tablist'}),list=el('div',{class:'b15-wh-list'}),foot=el('div',{class:'b15-wh-foot'}),live=el('p',{class:'b15-wh-status',role:'status'});
  const search=el('input',{type:'search',placeholder:'搜索物品','aria-label':'搜索仓库物品',oninput:e=>{filter=e.target.value.trim();drawList()}});
  const onlyBox=el('input',{type:'checkbox',onchange:e=>{onlyStored=e.target.checked;drawList()}});
  function drawHead(){
    const rows=rowsOf(),stored=rows.filter(r=>r.stored>0),value=stored.reduce((v,r)=>v+r.stored*r.now,0),cheap=rows.filter(r=>r.total>r.n&&pct(r)!==null&&pct(r)<0),dear=stored.filter(r=>pct(r)!==null&&pct(r)>=10);
    head.replaceChildren(
      el('div',{class:'b15-wh-sum'},el('b',{text:'已囤 '+stored.length+' 种'}),el('span',{},'按现价估值 ',coin(value))),
      el('div',{class:'b15-wh-quick'},
        el('button',{class:'isle-btn',type:'button',disabled:busy||!cheap.length,title:'把现价低于基础价的货全部标为囤起，等涨价再卖（需点保存）',onclick:()=>{for(const r of cheap)stage(r,r.total);status='已把 '+cheap.length+' 样低价货标为全部囤起，确认后点下方「保存」。';drawAll()}},'低价全囤（'+cheap.length+'）'),
        el('button',{class:'isle-btn ghost',type:'button',disabled:busy||!dear.length||pending.size>0,title:pending.size?'先保存或撤销未保存的改动':'卖出现价高于基础价 10% 及以上的仓库存货',onclick:()=>sellDear(dear)},'卖出高价存货（'+dear.length+'）')));
  }
  function drawTabs(){
    const kinds=new Set(rowsOf().map(r=>r.kind));
    tabs.replaceChildren(...['全部',...KIND_ORDER.filter(k=>kinds.has(k))].map(k=>el('button',{type:'button',role:'tab','aria-selected':String(k===kind),class:'b15-wh-tab'+(k===kind?' on':''),onclick:()=>{kind=k;drawTabs();drawList()}},k)));
  }
  function drawList(){
    const y=list.scrollTop,rows=rowsOf().filter(r=>(kind==='全部'||r.kind===kind)&&(!filter||R.ITEM_NAME[r.id].includes(filter))&&(!onlyStored||r.stored>0||r.n>0));
    list.replaceChildren(...rows.map(r=>{
      const p=pct(r),changed=pending.has(key(r.id,r.q));
      const input=el('input',{type:'number',inputmode:'numeric',min:0,max:r.total,value:r.n,'aria-label':R.ITEM_NAME[r.id]+QN[r.q]+'囤货数量',onchange:e=>{stage(r,e.target.value);drawAll()}});
      const step=(d)=>el('button',{type:'button',class:'b15-wh-step','aria-label':(d>0?'多囤':'少囤')+' '+Math.abs(d),disabled:busy||(d<0?r.n<=0:r.n>=r.total),onclick:()=>{stage(r,r.n+d);drawAll()}},d>0?'+':'−');
      const chip=(label,n)=>el('button',{type:'button',class:'b15-wh-chip'+(r.n===n?' on':''),disabled:busy,onclick:()=>{stage(r,n);drawAll()}},label);
      const auto=el('input',{type:'checkbox',checked:r.keep&&r.n>0,disabled:busy||r.n===0,title:r.n===0?'先设定囤货数量':'',onchange:e=>{stage(r,r.n,e.target.checked);drawAll()}});
      return el('div',{class:'b15-wh-row'+(changed?' changed':'')},
        el('img',{src:A.itemIcon(r.id,3),alt:''}),
        el('div',{class:'b15-wh-info'},el('b',{text:R.ITEM_NAME[r.id]+(r.q?' · '+QN[r.q]:'')}),
          el('small',{},'共 '+r.total+' · 可用 '+Math.max(0,r.total-r.n)+(r.now?' · 现价 '+fmt(r.now):'')),
          p===null?null:el('span',{class:'b15-wh-pct '+(p>=0?'up':'down'),title:'相对基础价 '+fmt(r.base)},(p>=0?'▲':'▼')+Math.abs(p)+'%')),
        el('div',{class:'b15-wh-ctl'},
          el('div',{class:'b15-wh-num'},step(-1),input,step(1),el('small',{text:'/ '+r.total})),
          el('div',{class:'b15-wh-chips'},chip('不囤',0),chip('一半',Math.floor(r.total/2)),chip('全部',r.total)),
          el('label',{class:'b15-wh-auto'},auto,'收获自动存')));
    }));
    if(!rows.length)list.append(el('p',{class:'isle-empty',text:onlyStored?'还没有囤货。':'没有符合条件的物品。'}));
    list.scrollTop=y;
  }
  function drawFoot(){
    foot.hidden=!pending.size;
    foot.replaceChildren(el('span',{text:'已改 '+pending.size+' 项'}),el('button',{class:'isle-btn ghost',type:'button',disabled:busy,onclick:()=>{pending.clear();status='已撤销未保存的改动。';drawAll()}},'撤销'),el('button',{class:'isle-btn',type:'button',disabled:busy,onclick:save},busy?'保存中…':'保存'));
  }
  function drawAll(){live.textContent=status;drawHead();drawList();drawFoot()}
  async function save(){
    if(busy||!pending.size)return;busy=true;status='正在保存…';drawAll();
    const list2=[...pending.values()];let ok=0,err='';
    // 多条动作同时排队，会合并进同一个请求；单次上限按 20 条分批。
    for(let i=0;i<list2.length;i+=20){const res=await Promise.allSettled(list2.slice(i,i+20).map(x=>isle.actNow({a:'warehouse',id:x.id,q:x.q,n:x.n,keep:x.keep})));for(const r of res){if(r.status==='fulfilled')ok++;else err=r.reason?.message||'部分保存失败';}}
    await settle(isle);pending.clear();busy=false;status=err?('已保存 '+ok+' 项；'+err+'，请检查后重试。'):('已保存 '+ok+' 项囤货设置。');drawAll();
  }
  async function sellDear(rows){
    if(busy)return;const sell=rows.map(r=>({id:r.id,q:r.q,n:r.stored})),quote=b12SellPreview(isle,sell,true);
    const yes=await (window.siteConfirm?window.siteConfirm('卖出 '+rows.length+' 样高价存货（共 '+sell.reduce((n,x)=>n+x.n,0)+' 件），预计到账约 '+fmt(quote.net)+' D（含售卖税 '+fmt(quote.tax)+' D）。确定卖出？'):Promise.resolve(false));
    if(!yes)return;busy=true;status='正在卖出…';drawAll();
    const actions=b12SaleActions(sell,true);let err='';
    for(let i=0;i<actions.length;i+=20){const res=await Promise.allSettled(actions.slice(i,i+20).map(a=>isle.actNow(a)));for(const r of res)if(r.status==='rejected')err=r.reason?.message||'部分未卖出';}
    await settle(isle);
    // 规则上「包含仓库」会先用未囤的部分；卖完后把这些行的囤货数量同步扣掉（不改自动补足目标），让卖掉的就是囤的那批。
    if(!err){const st=isle.state,fix=rows.map(r=>({id:r.id,q:r.q,n:Math.max(0,Math.min(st.inv[r.id]?.[r.q]||0,(st.b12?.vault?.[r.id]?.[r.q]||0)-r.stored))}));await Promise.allSettled(fix.map(x=>isle.actNow({a:'warehouse',id:x.id,q:x.q,n:x.n})));await settle(isle);}
    busy=false;status=err?('卖出完成，但'+err+'。'):'高价存货已卖出。';drawAll();
  }
  const manual=el('input',{type:'checkbox',checked:!!isle.manualWarehouse,onchange:e=>isle.setManualWarehouse?.(e.target.checked)});
  sh.body.replaceChildren(head,el('div',{class:'b15-wh-bar'},tabs,el('div',{class:'b15-wh-filter'},search,el('label',{},onlyBox,'只看已囤'))),live,list,foot,
    el('details',{class:'b15-wh-more'},el('summary',{text:'囤货规则'}),
      el('p',{class:'isle-note',text:'囤起的数量会被管家自动出售、自动加工和日常消耗保留；在集市手动卖货、加工或吃东西时可以选择「包含仓库」。开启「收获自动存」后，新收获会先补足到设定数量。'}),
      el('label',{class:'b12-stock-tools'},manual,'本次游玩手动种植、喂养、钓鱼和炸矿可用仓库'),
      el('small',{text:'默认关闭，重新进入小岛后恢复关闭；不改变管家策略。'})));
  drawTabs();drawAll();return sh;
}
function b12CargoUI(isle,redraw) {
  const s=isle.state,t=isle.now(),status=el('p',{role:'status'});
  return [el('p',{class:'isle-note',text:'货船按基础价售货，可买入囤货、加工或等行情出售。每个岛日换货，个人限额独立；卖出不会恢复购买额度。每天北京时间 22:00—08:00 不换货。跨季收获物可以买，种子仍遵守种植季节。'}),status,...R.b12Stock(t,isle.prices).map(it=>{
    const left=R.b12StockLeft(s,it,t),actions=[1,Math.min(5,left)].filter((n,i,a)=>n>0&&a.indexOf(n)===i);
    return el('div',{class:'isle-shoprow'},el('img',{src:A.itemIcon(it.id,3),alt:''}),el('div',{},el('b',{text:it.name+(it.rare?' · 稀有来货':'')}),el('small',{text:`本岛日可购 ${left}/${it.limit} · 背包 ${s.inv[it.id]?.[0]||0}`}),el('small',{text:`基础买价 ${fmt(it.price)} D`+(isle.prices[it.id]?` · 当前回收单价 ${fmt(isle.prices[it.id])} D（税前）`:'')}),it.rare?el('small',{text:'恢复 20 体力，每个自然日最多食用两份；无需夜间抢购。'}):null),el('div',{class:'isle-shoprow-b'},actions.map(n=>el('button',{class:'isle-btn',type:'button',disabled:left<n||isle.coins<it.price*n,onclick:async e=>{
      const parent=e.currentTarget.parentElement;for(const button of parent.querySelectorAll('button'))button.disabled=true;status.textContent='正在卸货…';
      try{await isle.actNow({a:'stockBuy',id:it.id,n,day:R.isleDay(t)});redraw();}catch(err){status.textContent=err.message||'购买失败，请重试';for(const button of parent.querySelectorAll('button'))button.disabled=false;}
    }},'买 '+n+' · ',coin(it.price*n)))),left===0?el('small',{text:'本岛日已购完'}):null);
  })];
}

function b12SaleActions(rows,includeWarehouse){
 return rows.flatMap(x=>{const actions=[];for(let left=x.n;left>0;left-=999)actions.push({a:'sell',id:x.id,q:x.q,n:Math.min(999,left),includeWarehouse});return actions});
}
function b12SellPreview(isle,rows,includeWarehouse){
 const t=isle.now(),s=JSON.parse(JSON.stringify(isle.state)),actions=b12SaleActions(rows,includeWarehouse),quote={gross:0,tax:0,net:0};
 for(let i=0;i<actions.length;i+=24){const r=R.applyActions(s,actions.slice(i,i+24),{t,day:R.worldDay(t),prices:isle.prices,coins:isle.coins+quote.net,rand:()=>0.5});quote.net+=r.earn;quote.tax+=r.tax||0;quote.gross+=r.earn+(r.tax||0)}
 return quote;
}
async function b12SellRows(isle,rows,includeWarehouse,sh,redraw){
 if(sh.body.dataset.selling==='1'||!rows.length)return;sh.body.dataset.selling='1';
 const status=el('p',{role:'status',text:'正在核对库存…'});sh.body.prepend(status);for(const c of sh.body.querySelectorAll('button,input'))c.disabled=true;
 let earned=0,error='';
 try{
  await settle(isle);if(isle.busy?.())throw Error('上一批操作尚未完成，请同步后重试。');
  const actions=b12SaleActions(rows,includeWarehouse);
  for(let i=0;i<actions.length;i+=24){status.textContent=`正在结算 ${Math.min(i+24,actions.length)}/${actions.length} 笔…`;const settled=await Promise.allSettled(actions.slice(i,i+24).map(a=>isle.actNow(a)));for(const r of settled)if(r.status==='fulfilled')earned+=r.value.earn||0;const failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
 }catch(e){error=e.message||'结算未完成，请核对库存后重试。'}
 finally{delete sh.body.dataset.selling;if(earned)isle.coinBurst(earned);if(sh.body.isConnected){redraw();sh.body.prepend(el('p',{role:'status',text:error?'部分操作未完成：'+error:'售卖已结算，到手 '+fmt(earned)+' D。'}))}}
}
const b12QuoteText=q=>`货款 ${fmt(q.gross)} · 税 ${fmt(q.tax)} · 到手 ${fmt(q.net)} D`;
function b12TaxPanel(){
 const box=el('div',{class:'b12-tax-panel'}),status=el('p',{role:'status',text:'正在读取公库账目…'});
 const when=t=>t?new Date(t*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'待拨付';
 const read=async()=>{
  box.replaceChildren(status);status.textContent='正在读取公库账目…';
  try{
   const response=await fetch('/api/pet/world/tax',{credentials:'same-origin',cache:'no-store'}),j=await response.json();if(!response.ok)throw Error(j.error||'账目读取失败');if(!box.isConnected)return;
   const c=j.current,p=j.treasury,m=j.mine,names={'pet-world-sale-tax':'售卖税','pet-world-balance-tax':'余额税','pet-world-subsidy':'暖潮补贴'};
   const stat=(label,value)=>el('div',{},el('span',{text:label}),el('b',{text:fmt(value)+' D'}));
   box.replaceChildren(el('p',{class:'isle-note',text:`第 ${j.season+1} 季 · 第 ${j.day}/12 岛日。岛民把商路的一部分收益存入暖潮公库，在归港节帮助资金较少、持续经营的小岛。`}),
    el('div',{class:'b12-tax-summary'},stat('本季售卖税',c.sales),stat('本季余额税',c.balance_tax),stat('公库余额（含结转）',p.balance),stat('已留待拨付',p.reserved),stat('本季分配',c.allocated),stat('本季已拨付',c.paid)),
    el('p',{text:`本季获助 ${c.recipients} 人 · ${c.phase>=2?'分配额度已确定':c.phase===1?'正在核算分配额度':'第 11 岛日确定分配名单'}`}),
    el('details',{},el('summary',{text:'税收和补贴规则'}),el('p',{text:'仅已开岛玩家参与。钱包前 300 万 D 免税；售卖货款进入 300 万—1000 万部分收 1%，超过 1000 万部分收 3%。管家先扣原有服务费，再计售卖税。'}),el('p',{text:'余额税每天北京时间 08:00 结算：300 万—1000 万部分收 0.1%，超过 1000 万部分收 0.3%。例如 2000 万余额收 37000 D，不扣穿 300 万。'}),el('p',{text:'开岛满 24 小时、本季至少两个岛日经营且参考资金不足 300 万，可参与季末补贴。参考资金会加回本季净转出的赠送金额。可分配税池的 80% 按资金缺口分配，每人每季最多 100 万 D；第 11、12 岛日各发一半，离线也保留。未分配金额结转。'})),
    el('h3',{text:'我的本季补贴'}),m?el('p',{text:`获配 ${fmt(m.amount)} D · 首笔 ${when(m.first_at)} · 次笔 ${when(m.second_at)}`}):el('p',{text:c.phase?'本季未进入补贴名单。':'名单尚未确定，暂未生成个人额度。'}),
    el('h3',{text:'我的最近 20 笔税款与补贴'}),j.history.length?el('div',{class:'b12-tax-history'},j.history.map(x=>el('div',{},el('b',{text:names[x.kind]||'账目'}),el('time',{text:when(x.created_at)}),el('span',{text:(x.delta>0?'+':'')+fmt(x.delta)+' D'})))):el('p',{class:'isle-empty',text:'暂时没有税款或补贴记录。'}),el('button',{class:'isle-btn',type:'button',onclick:read},'刷新账目'));
  }catch(e){status.textContent=e.message||'账目读取失败';box.replaceChildren(status,el('button',{class:'isle-btn',type:'button',onclick:read},'重试'));}
 };queueMicrotask(read);return box;
}

export async function openB12Journal(host,isle){
 const sh=sheet(host,'山谷纪事',el('p',{text:'正在打开纪事…'}),{wide:true});await settle(isle);let busy=false,message='';
 const draw=()=>{
  const s=isle.state,night=R.b12NightView(s,isle.now()),status=el('p',{role:'status',text:message});
  const act=async a=>{if(busy)return;busy=true;for(const b of sh.body.querySelectorAll('button'))b.disabled=true;try{await isle.actNow(a);message=a.a==='storyRead'?'章节已读。':'夜潮小礼已放入背包。'}catch(e){message=e.message||'保存失败，请重试'}finally{busy=false;if(sh.body.isConnected)draw()}};
  sh.body.replaceChildren(el('p',{class:'isle-note',text:'每天北京时间22:00—08:00为长夜。岛钟休息，作物与成年动物继续生产。夜间奇缘最多一次，次日22:00前查看和领取相同结果，无需熬夜。'}),status,
   el('section',{class:'b12-night-story'},el('h3',{text:night.key+' · '+night.title}),el('p',{text:night.text}),night.got.length?el('p',{text:night.got.map(x=>(R.ITEM_NAME[x.id]||x.id)+' × '+x.n).join('、')}):null,night.claimable?el('button',{class:'isle-btn',type:'button',onclick:()=>act({a:'nightClaim',key:night.key})},'领取夜潮小礼'):night.claimed?el('small',{text:'这段夜潮的礼物已领取。'}):null),
   ...R.B12_CHAPTERS.map(ch=>el('details',{class:'b12-chapter',open:!(s.b12?.chapters&(1<<(ch.id-1)))},el('summary',{text:'第'+ch.id+'章 · '+ch.title+((s.b12?.chapters&(1<<(ch.id-1)))?' · 已读':'')}),el('p',{text:ch.body}),el('p',{text:ch.note}),el('p',{text:ch.close}),!(s.b12?.chapters&(1<<(ch.id-1)))?el('button',{class:'isle-btn ghost',type:'button',onclick:()=>act({a:'storyRead',chapter:ch.id})},'标记本章已读'):null)));
 };draw();return sh;
}
